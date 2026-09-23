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

/** Simplicity costs — lower is preferred when IoU is similar.
 * Prefer closed angular forms (rect/polygon); circle/ellipse are expensive
 * and additionally gated by isClearlyRound().
 */
const COST: Record<FitKind, number> = {
  rect: 0.03,
  line: 0.04,
  triangle: 0.07,
  polygon: 0.09,
  circle: 0.12,
  ellipse: 0.14,
};

const CIRCLE_MIN_IOU = 0.72;
const ELLIPSE_MIN_IOU = 0.8;
/** Filled circle in AABB ≈ π/4 ≈ 0.785; squares ≈ 1.0. */
const CIRCLE_FILL_MIN = 0.62;
const CIRCLE_FILL_MAX = 0.9;

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

/** Fill ratio of pixels vs axis-aligned bbox. */
function bboxFillRatio(pixels: number[], bbox: { minX: number; minY: number; maxX: number; maxY: number }): number {
  const bw = bbox.maxX - bbox.minX + 1;
  const bh = bbox.maxY - bbox.minY + 1;
  const area = bw * bh;
  return area > 0 ? pixels.length / area : 0;
}

/**
 * Only accept circle/ellipse when the region is clearly round.
 * Uses bbox aspect + fill ratio (robust to pixelated contours) and IoU.
 * When accepted, circle is forced over rect (see fitRegion).
 */
function isClearlyCircle(
  candidate: PrimitiveFit,
  fillRatio: number,
  bboxAspect: number,
  rectIoU: number,
): boolean {
  if (candidate.kind !== 'circle') return false;
  if (candidate.iou < CIRCLE_MIN_IOU) return false;
  if (bboxAspect > 1.25) return false;
  const rx = candidate.rx ?? 1;
  const ry = candidate.ry ?? 1;
  if (Math.max(rx, ry) / Math.min(rx, ry) > 1.2) return false;
  // Angular solid square: fill ≈ 1; circle: ≈ 0.785
  if (fillRatio < CIRCLE_FILL_MIN || fillRatio > CIRCLE_FILL_MAX) return false;
  // Rect fits a square better; circle must not lose badly to a near-perfect rect
  if (rectIoU > 0.92 && candidate.iou < rectIoU - 0.02) return false;
  return true;
}

function isClearlyEllipse(
  candidate: PrimitiveFit,
  fillRatio: number,
  bboxAspect: number,
  rectIoU: number,
): boolean {
  if (candidate.kind !== 'ellipse') return false;
  if (candidate.iou < ELLIPSE_MIN_IOU) return false;
  // Thin sticks / bars are not ellipses
  if (bboxAspect >= 2.2 && fillRatio < 0.55) return false;
  // Rect almost as good → keep closed rectangular form
  if (rectIoU >= candidate.iou - 0.04) return false;
  if (fillRatio > 0.92) return false;
  return true;
}

/** Boost line / thin *rotated* rect scores for elongated sparse regions (e.g. mallets).
 * Never boost axis-aligned AABB — that fat bbox would look like a thick stick.
 */
function applyThinDiagonalBoost(
  fit: PrimitiveFit,
  fillRatio: number,
  bboxAspect: number,
): PrimitiveFit {
  const thin = fillRatio < 0.45 && bboxAspect >= 2.0;
  if (!thin) return fit;
  if (fit.kind === 'line') {
    return { ...fit, score: fit.score + 0.08 };
  }
  if (fit.kind === 'rect') {
    const rot = Math.abs(fit.rotation ?? 0);
    // Only elongated rotated rects (not AABB)
    if (rot < 0.5) return fit;
    const rw = fit.width ?? 1;
    const rh = fit.height ?? 1;
    const rectAspect = Math.max(rw, rh) / Math.min(rw, rh);
    if (rectAspect >= 3) {
      return { ...fit, score: fit.score + 0.06 };
    }
  }
  return fit;
}

/** Normalize degrees into [0, 90). */
function rectAngleMod90(deg: number): number {
  let a = deg % 90;
  if (a < 0) a += 90;
  return a;
}

/** True when rotation is effectively axis-aligned. */
function isNearAxisAligned(rotationDeg: number, snapDeg = 7): boolean {
  const a = rectAngleMod90(rotationDeg);
  return a <= snapDeg || a >= 90 - snapDeg;
}

/**
 * Prefer AABB over a barely-better slanted rect (staircasing / hull noise).
 * Near-axis rotations always collapse to AABB when IoU is comparable.
 * Solid fills (bars) strongly prefer axis-aligned.
 */
function preferAxisAlignedRect(
  aabb: PrimitiveFit | null,
  rot: PrimitiveFit | null,
  fillRatio: number,
): { aabb: PrimitiveFit | null; rot: PrimitiveFit | null } {
  if (!rot) return { aabb, rot: null };
  if (!aabb) return { aabb: null, rot };

  const rotDeg = rot.rotation ?? 0;

  // Solid upright regions: keep AABB whenever it is already a good fit
  if (fillRatio >= 0.7 && aabb.iou >= 0.78) {
    return { aabb, rot: null };
  }

  const margin = fillRatio >= 0.55 ? 0.05 : 0.025;

  if (isNearAxisAligned(rotDeg, 8)) {
    if (rot.iou < aabb.iou + margin) {
      return { aabb, rot: null };
    }
  }

  // Off-axis: require meaningful IoU gain; ties → AABB
  if (rot.iou <= aabb.iou + margin) {
    return { aabb, rot: null };
  }
  return { aabb, rot };
}

/** Short-side thickness from a rotated-rect calipers fit. */
function calipersThickness(rot: PrimitiveFit | null): number | null {
  if (!rot || rot.kind !== 'rect') return null;
  const w = rot.width ?? 0;
  const h = rot.height ?? 0;
  if (w < 1 || h < 1) return null;
  return Math.min(w, h);
}

/** Median absolute deviation of pixels from a line axis (perpendicular width). */
function medianPerpWidth(
  pixels: number[],
  width: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): number {
  const dists: number[] = [];
  for (const p of pixels) {
    const x = (p % width) - cx;
    const y = ((p / width) | 0) - cy;
    // perpendicular distance to axis through origin in local frame
    dists.push(Math.abs(-dy * x + dx * y));
  }
  if (!dists.length) return 1;
  dists.sort((a, b) => a - b);
  // Use 90th percentile span ≈ half-width; full width ≈ 2 * p90
  const idx = Math.min(dists.length - 1, Math.floor(dists.length * 0.9));
  return Math.max(1, dists[idx] * 2);
}

function bboxFromPixels(
  pixels: number[],
  width: number,
  height: number,
  region: Region,
): Region {
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
  return { ...region, minX, minY, maxX, maxY, area: pixels.length };
}

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
  calipersShortSide?: number | null,
): PrimitiveFit | null {
  const { cx, cy, mxx, myy, mxy } = moments(pixels, width);
  const trace = mxx + myy;
  const det = mxx * myy - mxy * mxy;
  const disc = Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
  const l1 = trace / 2 + disc;
  const l2 = Math.max(0, trace / 2 - disc);
  if (l1 < 1e-6) return null;
  const ratio = l1 / Math.max(l2, 1e-6);
  // Must be elongated (diagonal mallets / sticks)
  if (ratio < 5) return null;

  const angle = Math.atan2(2 * mxy, mxx - myy) / 2;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);

  // Prefer the tighter of calipers short side and median ⊥ width
  const medianW = medianPerpWidth(pixels, width, cx, cy, dx, dy);
  let thickness =
    calipersShortSide != null && calipersShortSide > 0
      ? Math.min(calipersShortSide, medianW)
      : medianW;
  const bboxMin = Math.min(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY);
  thickness = Math.min(thickness, Math.max(1, bboxMin * 0.28));
  if (thickness > bboxMin * 0.5 && thickness > 8) {
    return null;
  }

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
 * Fit the best primitive for a region using occlusion-aware mask (self + descendants),
 * except for thin/elongated regions where children (e.g. mallet heads) must not fatten the stick.
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
  const ownPixels = region.pixels;
  if (ownPixels.length < 4) return null;

  const ownBbox = bboxFromPixels(ownPixels, width, height, region);
  const ownFill = bboxFillRatio(ownPixels, ownBbox);
  const ownBw = ownBbox.maxX - ownBbox.minX + 1;
  const ownBh = ownBbox.maxY - ownBbox.minY + 1;
  const ownAspect = Math.max(ownBw, ownBh) / Math.max(1, Math.min(ownBw, ownBh));

  const occluded = occlusionPixels(map, regionId);
  // Skip occlusion for sparse/thin regions so false AABB-children (mallet heads) don't fatten sticks
  const childrenFatten =
    occluded.length > ownPixels.length * 1.12 && ownFill < 0.55;
  const thinElongated = ownAspect >= 2.5 && ownFill < 0.5;
  const useOwnOnly = thinElongated || childrenFatten;

  const pixels = useOwnOnly ? ownPixels : occluded;
  if (pixels.length < 4) return null;

  const bboxProxy = bboxFromPixels(pixels, width, height, region);
  const fillRatio = bboxFillRatio(pixels, bboxProxy);
  const bw = bboxProxy.maxX - bboxProxy.minX + 1;
  const bh = bboxProxy.maxY - bboxProxy.minY + 1;
  const bboxAspect = Math.max(bw, bh) / Math.max(1, Math.min(bw, bh));

  const contour = traceBoundary(region, width, labels);
  // Thin regions: hull from true boundary; solid regions: sample occlusion pixels
  let hull: Point2D[];
  if (fillRatio < 0.5 && contour.length > 3) {
    hull = convexHull(contour);
  } else {
    const samplePts: Point2D[] = [];
    const step = Math.max(1, Math.floor(pixels.length / 400));
    for (let i = 0; i < pixels.length; i += step) {
      const p = pixels[i];
      samplePts.push({ x: (p % width) + 0.5, y: ((p / width) | 0) + 0.5 });
    }
    hull = convexHull(samplePts.length ? samplePts : contour);
  }

  const circleFit = fitCircle(pixels, width, height, bboxProxy, opts.simplicity);
  const ellipseFit = fitEllipse(pixels, width, height, bboxProxy, opts.simplicity);
  let aabbFit = fitAABB(pixels, width, height, bboxProxy, opts.simplicity);
  let rotRectFit = fitRotatedRect(pixels, width, height, bboxProxy, hull, opts.simplicity);

  // Axis preference: drop near-axis / barely-better slanted rects
  ({ aabb: aabbFit, rot: rotRectFit } = preferAxisAlignedRect(aabbFit, rotRectFit, fillRatio));

  const shortSide = calipersThickness(rotRectFit);
  let lineFit = fitLine(pixels, width, height, bboxProxy, opts.simplicity, shortSide);
  const triFit = fitTriangle(pixels, width, height, bboxProxy, hull, opts.simplicity);
  const polyFit = fitPolygon(
    pixels,
    width,
    height,
    bboxProxy,
    contour.length > 3 ? contour : hull,
    opts.maxVertices,
    opts.simplicity,
  );

  // Prefer thin diagonal sticks as line / elongated *rotated* rect — never boost AABB
  if (rotRectFit) rotRectFit = applyThinDiagonalBoost(rotRectFit, fillRatio, bboxAspect);
  if (lineFit) lineFit = applyThinDiagonalBoost(lineFit, fillRatio, bboxAspect);

  // Drop fat AABB when calipers show a thin stick
  const rotAspect =
    rotRectFit && rotRectFit.width && rotRectFit.height
      ? Math.max(rotRectFit.width, rotRectFit.height) /
        Math.min(rotRectFit.width, rotRectFit.height)
      : 0;
  if (fillRatio < 0.45 && rotAspect >= 3) {
    aabbFit = null;
  }

  const rectIoU = Math.max(aabbFit?.iou ?? 0, rotRectFit?.iou ?? 0);
  const clearCircle =
    !!circleFit && isClearlyCircle(circleFit, fillRatio, bboxAspect, rectIoU);
  const clearEllipse =
    !clearCircle &&
    !!ellipseFit &&
    isClearlyEllipse(ellipseFit, fillRatio, bboxAspect, rectIoU);

  let candidates: (PrimitiveFit | null)[];
  if (clearCircle && circleFit) {
    const preferred = {
      ...circleFit,
      score: circleFit.iou - 0.02 * opts.simplicity,
    };
    candidates = [preferred, lineFit, triFit, polyFit];
  } else if (clearEllipse && ellipseFit) {
    candidates = [ellipseFit, lineFit, triFit, polyFit];
  } else {
    candidates = [aabbFit, rotRectFit, lineFit, triFit, polyFit];
  }

  let best: PrimitiveFit | null = null;
  for (const c of candidates) {
    if (!c) continue;
    if (c.iou < opts.minIoU && c.kind !== 'polygon' && c.kind !== 'rect') continue;
    if (!best || c.score > best.score) best = c;
  }
  if (!best) {
    for (const c of [aabbFit, rotRectFit, polyFit, lineFit, triFit, circleFit, ellipseFit]) {
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
