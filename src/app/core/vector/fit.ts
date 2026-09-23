import { Point2D } from '../models/shape';
import { Region, RegionMap, convexHull, occlusionPixels, traceBoundary } from './regions';

export type FitKind = 'circle' | 'ellipse' | 'rect' | 'triangle' | 'line' | 'polygon';

export interface PrimitiveFit {
  kind: FitKind;
  score: number;
  iou: number;
  /** Circle / ellipse */
  cx?: number;
  cy?: number;
  rx?: number;
  ry?: number;
  rotation?: number; // degrees
  /** Axis-aligned or rotated rect */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** Line */
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  strokeWidth?: number;
  /** Triangle / polygon */
  points?: Point2D[];
}

/** Simplicity costs — lower is preferred when IoU is similar. */
const COST: Record<FitKind, number> = {
  circle: 0.0,
  ellipse: 0.04,
  rect: 0.06,
  triangle: 0.1,
  line: 0.08,
  polygon: 0.18,
};

export interface FitOptions {
  minIoU: number;
  maxVertices: number;
  /** Multiplier on simplicity costs (higher = prefer simpler shapes more) */
  simplicity: number;
}

const DEFAULT_FIT: FitOptions = {
  minIoU: 0.55,
  maxVertices: 12,
  simplicity: 1,
};

function moments(pixels: number[], width: number) {
  let n = pixels.length;
  let sx = 0;
  let sy = 0;
  for (const p of pixels) {
    sx += p % width;
    sy += (p / width) | 0;
  }
  const cx = sx / n;
  const cy = sy / n;
  let mxx = 0;
  let myy = 0;
  let mxy = 0;
  for (const p of pixels) {
    const dx = (p % width) - cx;
    const dy = ((p / width) | 0) - cy;
    mxx += dx * dx;
    myy += dy * dy;
    mxy += dx * dy;
  }
  mxx /= n;
  myy /= n;
  mxy /= n;
  return { cx, cy, mxx, myy, mxy, n };
}

/** Rasterize a candidate into a boolean mask over the region's bbox and compute IoU vs occlusion pixels. */
function iouAgainst(
  pixels: number[],
  width: number,
  height: number,
  testFn: (x: number, y: number) => boolean,
  bbox: { minX: number; minY: number; maxX: number; maxY: number },
): number {
  const pad = 2;
  const x0 = Math.max(0, bbox.minX - pad);
  const y0 = Math.max(0, bbox.minY - pad);
  const x1 = Math.min(width - 1, bbox.maxX + pad);
  const y1 = Math.min(height - 1, bbox.maxY + pad);

  const truth = new Set(pixels);
  let inter = 0;
  let uni = 0;

  // Count intersection / union over bbox
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const p = y * width + x;
      const inTruth = truth.has(p);
      const inFit = testFn(x + 0.5, y + 0.5);
      if (inTruth || inFit) uni++;
      if (inTruth && inFit) inter++;
    }
  }
  if (uni === 0) return 0;
  return inter / uni;
}

function scoreOf(kind: FitKind, iou: number, simplicity: number): number {
  return iou - COST[kind] * simplicity;
}

function fitCircle(
  pixels: number[],
  width: number,
  height: number,
  bbox: Region,
  simplicity: number,
): PrimitiveFit | null {
  const { cx, cy, n } = moments(pixels, width);
  const r = Math.sqrt(n / Math.PI);
  if (r < 1.5) return null;
  const iou = iouAgainst(
    pixels,
    width,
    height,
    (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r,
    bbox,
  );
  return {
    kind: 'circle',
    iou,
    score: scoreOf('circle', iou, simplicity),
    cx,
    cy,
    rx: r,
    ry: r,
    rotation: 0,
  };
}

function fitEllipse(
  pixels: number[],
  width: number,
  height: number,
  bbox: Region,
  simplicity: number,
): PrimitiveFit | null {
  const { cx, cy, mxx, myy, mxy } = moments(pixels, width);
  // Covariance eigen-decomposition
  const trace = mxx + myy;
  const det = mxx * myy - mxy * mxy;
  const disc = Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
  const l1 = trace / 2 + disc;
  const l2 = trace / 2 - disc;
  if (l1 <= 0 || l2 <= 0) return null;
  // For a filled ellipse, variance along axis = r^2 / 4
  const rx = 2 * Math.sqrt(l1);
  const ry = 2 * Math.sqrt(l2);
  if (rx < 1.5 || ry < 1.5) return null;
  const angle =
    Math.abs(mxy) < 1e-9 && mxx >= myy
      ? 0
      : (Math.atan2(2 * mxy, mxx - myy) / 2) * (180 / Math.PI);

  const cos = Math.cos((angle * Math.PI) / 180);
  const sin = Math.sin((angle * Math.PI) / 180);
  const iou = iouAgainst(
    pixels,
    width,
    height,
    (x, y) => {
      const dx = x - cx;
      const dy = y - cy;
      const lx = dx * cos + dy * sin;
      const ly = -dx * sin + dy * cos;
      return (lx * lx) / (rx * rx) + (ly * ly) / (ry * ry) <= 1;
    },
    bbox,
  );
  // Prefer circle label when nearly circular
  const aspect = Math.max(rx, ry) / Math.min(rx, ry);
  if (aspect < 1.12) {
    const r = (rx + ry) / 2;
    return {
      kind: 'circle',
      iou,
      score: scoreOf('circle', iou, simplicity),
      cx,
      cy,
      rx: r,
      ry: r,
      rotation: 0,
    };
  }
  return {
    kind: 'ellipse',
    iou,
    score: scoreOf('ellipse', iou, simplicity),
    cx,
    cy,
    rx,
    ry,
    rotation: angle,
  };
}

function fitAABB(
  pixels: number[],
  width: number,
  height: number,
  bbox: Region,
  simplicity: number,
): PrimitiveFit | null {
  const x = bbox.minX;
  const y = bbox.minY;
  const w = bbox.maxX - bbox.minX + 1;
  const h = bbox.maxY - bbox.minY + 1;
  if (w < 2 || h < 2) return null;
  const iou = iouAgainst(
    pixels,
    width,
    height,
    (px, py) => px >= x && px < x + w && py >= y && py < y + h,
    bbox,
  );
  return {
    kind: 'rect',
    iou,
    score: scoreOf('rect', iou, simplicity),
    x,
    y,
    width: w,
    height: h,
    rotation: 0,
  };
}

/** Rotating calipers approx: sample hull edge orientations. */
function fitRotatedRect(
  pixels: number[],
  width: number,
  height: number,
  bbox: Region,
  hull: Point2D[],
  simplicity: number,
): PrimitiveFit | null {
  if (hull.length < 3) return null;
  let best: PrimitiveFit | null = null;

  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const p of hull) {
      const u = p.x * cos + p.y * sin;
      const v = -p.x * sin + p.y * cos;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const w = maxU - minU;
    const h = maxV - minV;
    if (w < 2 || h < 2) continue;

    // Corner in world space
    const cx = ((minU + maxU) / 2) * cos - ((minV + maxV) / 2) * sin;
    // Actually reconstruct top-left of rotated rect in world:
    // point at (minU, minV) in local
    const ox = minU * cos - minV * sin;
    const oy = minU * sin + minV * cos;
    const deg = (angle * 180) / Math.PI;

    const iou = iouAgainst(
      pixels,
      width,
      height,
      (px, py) => {
        const u = px * cos + py * sin;
        const v = -px * sin + py * cos;
        return u >= minU && u <= maxU && v >= minV && v <= maxV;
      },
      bbox,
    );
    const midU = (minU + maxU) / 2;
    const midV = (minV + maxV) / 2;
    const fit: PrimitiveFit = {
      kind: 'rect',
      iou,
      score: scoreOf('rect', iou, simplicity),
      x: ox,
      y: oy,
      width: w,
      height: h,
      rotation: deg,
      cx: midU * cos - midV * sin,
      cy: midU * sin + midV * cos,
    };

    if (!best || fit.score > best.score) best = fit;
  }
  return best;
}

function fitLine(
  pixels: number[],
  width: number,
  height: number,
  bbox: Region,
  simplicity: number,
): PrimitiveFit | null {
  const { cx, cy, mxx, myy, mxy, n } = moments(pixels, width);
  const trace = mxx + myy;
  const det = mxx * myy - mxy * mxy;
  const disc = Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
  const l1 = trace / 2 + disc;
  const l2 = Math.max(0, trace / 2 - disc);
  if (l1 < 1e-6) return null;
  const ratio = l1 / Math.max(l2, 1e-6);
  // Must be elongated
  if (ratio < 8) return null;
  const thickness = 2 * Math.sqrt(l2);
  if (thickness > Math.min(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY) * 0.45 && thickness > 6) {
    return null;
  }
  const angle = Math.atan2(2 * mxy, mxx - myy) / 2;
  // Principal axis direction
  let dx = Math.cos(angle);
  let dy = Math.sin(angle);
  // Project pixels onto axis to find extent
  let minT = Infinity;
  let maxT = -Infinity;
  for (const p of pixels) {
    const x = (p % width) - cx;
    const y = ((p / width) | 0) - cy;
    const t = x * dx + y * dy;
    if (t < minT) minT = t;
    if (t > maxT) maxT = t;
  }
  const x1 = cx + dx * minT;
  const y1 = cy + dy * minT;
  const x2 = cx + dx * maxT;
  const y2 = cy + dy * maxT;
  const sw = Math.max(1, thickness);

  const iou = iouAgainst(
    pixels,
    width,
    height,
    (px, py) => {
      // Distance to segment
      const vx = x2 - x1;
      const vy = y2 - y1;
      const len2 = vx * vx + vy * vy || 1;
      let t = ((px - x1) * vx + (py - y1) * vy) / len2;
      t = Math.max(0, Math.min(1, t));
      const qx = x1 + t * vx;
      const qy = y1 + t * vy;
      return Math.hypot(px - qx, py - qy) <= sw / 2 + 0.5;
    },
    bbox,
  );
  return {
    kind: 'line',
    iou,
    score: scoreOf('line', iou, simplicity),
    x1,
    y1,
    x2,
    y2,
    strokeWidth: sw,
  };
}

/** Ramer–Douglas–Peucker */
export function rdp(points: Point2D[], epsilon: number): Point2D[] {
  if (points.length <= 2) return [...points];
  let maxD = 0;
  let idx = 0;
  const first = points[0];
  const last = points[points.length - 1];
  const vx = last.x - first.x;
  const vy = last.y - first.y;
  const len2 = vx * vx + vy * vy || 1;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const t = ((p.x - first.x) * vx + (p.y - first.y) * vy) / len2;
    const qx = first.x + t * vx;
    const qy = first.y + t * vy;
    const d = Math.hypot(p.x - qx, p.y - qy);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > epsilon) {
    const left = rdp(points.slice(0, idx + 1), epsilon);
    const right = rdp(points.slice(idx), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

function pointInTriangle(p: Point2D, a: Point2D, b: Point2D, c: Point2D): boolean {
  const sign = (p1: Point2D, p2: Point2D, p3: Point2D) =>
    (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  const b1 = sign(p, a, b) < 0;
  const b2 = sign(p, b, c) < 0;
  const b3 = sign(p, c, a) < 0;
  return b1 === b2 && b2 === b3;
}

function fitTriangle(
  pixels: number[],
  width: number,
  height: number,
  bbox: Region,
  hull: Point2D[],
  simplicity: number,
): PrimitiveFit | null {
  if (hull.length < 3) return null;
  // Pick 3 hull vertices that maximize area
  let bestPts: [Point2D, Point2D, Point2D] | null = null;
  let bestArea = 0;
  const n = hull.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const a = hull[i];
        const b = hull[j];
        const c = hull[k];
        const area = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
        if (area > bestArea) {
          bestArea = area;
          bestPts = [a, b, c];
        }
      }
    }
  }
  if (!bestPts || bestArea < 4) return null;
  const [a, b, c] = bestPts;
  const iou = iouAgainst(
    pixels,
    width,
    height,
    (x, y) => pointInTriangle({ x, y }, a, b, c),
    bbox,
  );
  return {
    kind: 'triangle',
    iou,
    score: scoreOf('triangle', iou, simplicity),
    points: [a, b, c],
  };
}

function pointInPoly(x: number, y: number, pts: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x;
    const yi = pts[i].y;
    const xj = pts[j].x;
    const yj = pts[j].y;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function fitPolygon(
  pixels: number[],
  width: number,
  height: number,
  bbox: Region,
  contour: Point2D[],
  maxVertices: number,
  simplicity: number,
): PrimitiveFit | null {
  if (contour.length < 3) return null;
  // Grow epsilon until vertex count <= maxVertices
  let eps = 0.5;
  let simplified = rdp(contour, eps);
  // Close loop: RDP on open contour — ensure first≈last handled by caller
  for (let attempt = 0; attempt < 20 && simplified.length > maxVertices; attempt++) {
    eps *= 1.4;
    simplified = rdp(contour, eps);
  }
  if (simplified.length < 3) return null;
  // Drop last if closed duplicate
  if (
    simplified.length > 1 &&
    Math.hypot(
      simplified[0].x - simplified[simplified.length - 1].x,
      simplified[0].y - simplified[simplified.length - 1].y,
    ) < 1
  ) {
    simplified = simplified.slice(0, -1);
  }
  const costBump = Math.max(0, (simplified.length - 4) * 0.015);
  const iou = iouAgainst(
    pixels,
    width,
    height,
    (x, y) => pointInPoly(x, y, simplified),
    bbox,
  );
  return {
    kind: 'polygon',
    iou,
    score: scoreOf('polygon', iou, simplicity) - costBump,
    points: simplified,
  };
}

/**
 * Fit the best primitive for a region using occlusion-aware mask (self + descendants).
 */
export function fitRegion(
  map: RegionMap,
  regionId: number,
  options: Partial<FitOptions> = {},
): PrimitiveFit | null {
  const opts = { ...DEFAULT_FIT, ...options };
  const region = map.regions.get(regionId);
  if (!region || region.area < 4) return null;

  const { width, height, labels } = map;
  const pixels = occlusionPixels(map, regionId);
  if (pixels.length < 4) return null;

  // Synthetic bbox from occlusion pixels
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (const p of pixels) {
    const x = p % width;
    const y = (p / width) | 0;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const bboxProxy = { ...region, minX, minY, maxX, maxY, area: pixels.length };

  const contour = traceBoundary(region, width, labels);
  // For occlusion-aware, expand contour via hull of all occlusion pixels sample
  const samplePts: Point2D[] = [];
  const step = Math.max(1, Math.floor(pixels.length / 400));
  for (let i = 0; i < pixels.length; i += step) {
    const p = pixels[i];
    samplePts.push({ x: (p % width) + 0.5, y: ((p / width) | 0) + 0.5 });
  }
  const hull = convexHull(samplePts.length ? samplePts : contour);

  const candidates: (PrimitiveFit | null)[] = [
    fitCircle(pixels, width, height, bboxProxy, opts.simplicity),
    fitEllipse(pixels, width, height, bboxProxy, opts.simplicity),
    fitAABB(pixels, width, height, bboxProxy, opts.simplicity),
    fitRotatedRect(pixels, width, height, bboxProxy, hull, opts.simplicity),
    fitLine(pixels, width, height, bboxProxy, opts.simplicity),
    fitTriangle(pixels, width, height, bboxProxy, hull, opts.simplicity),
    fitPolygon(pixels, width, height, bboxProxy, contour.length > 3 ? contour : hull, opts.maxVertices, opts.simplicity),
  ];

  let best: PrimitiveFit | null = null;
  for (const c of candidates) {
    if (!c) continue;
    if (c.iou < opts.minIoU && c.kind !== 'polygon') continue;
    if (!best || c.score > best.score) best = c;
  }
  // Fallback: always allow best polygon / aabb even below minIoU
  if (!best) {
    for (const c of candidates) {
      if (!c) continue;
      if (!best || c.score > best.score) best = c;
    }
  }
  return best;
}

/** Fit all top-level and nested regions; return list sorted by area descending. */
export function fitAllRegions(
  map: RegionMap,
  options: Partial<FitOptions> = {},
): { regionId: number; fit: PrimitiveFit; area: number; colorIndex: number }[] {
  const results: { regionId: number; fit: PrimitiveFit; area: number; colorIndex: number }[] = [];
  for (const region of map.regions.values()) {
    const fit = fitRegion(map, region.id, options);
    if (!fit) continue;
    results.push({
      regionId: region.id,
      fit,
      area: region.area,
      colorIndex: region.colorIndex,
    });
  }
  results.sort((a, b) => b.area - a.area);
  return results;
}
