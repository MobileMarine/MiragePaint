import { Point2D } from '../models/shape';

export interface Region {
  id: number;
  /** Palette color index */
  colorIndex: number;
  /** Pixel count */
  area: number;
  /** Bounding box */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Centroid */
  cx: number;
  cy: number;
  /** Flat pixel indices (y * width + x) belonging to this region (after merges) */
  pixels: number[];
  /** Child region ids fully contained inside this region's bbox (approx) */
  children: number[];
  parent: number | null;
}

export interface RegionMap {
  width: number;
  height: number;
  /** Per-pixel region id, or -1 for transparent / unassigned */
  labels: Int32Array;
  regions: Map<number, Region>;
}

/**
 * 4-connected component labeling on a quantized index map.
 * Transparent (-1) pixels are ignored.
 */
export function labelConnectedComponents(
  indices: Int16Array,
  width: number,
  height: number,
): RegionMap {
  const labels = new Int32Array(width * height).fill(-1);
  const regions = new Map<number, Region>();
  let nextId = 1;
  const stack: number[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (indices[start] < 0 || labels[start] >= 0) continue;

      const colorIndex = indices[start];
      const id = nextId++;
      const pixels: number[] = [];
      let sumX = 0;
      let sumY = 0;
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;

      stack.length = 0;
      stack.push(start);
      labels[start] = id;

      while (stack.length) {
        const p = stack.pop()!;
        const px = p % width;
        const py = (p / width) | 0;
        pixels.push(p);
        sumX += px;
        sumY += py;
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;

        const neighbors = [p - 1, p + 1, p - width, p + width];
        for (const n of neighbors) {
          if (n < 0 || n >= labels.length) continue;
          const nx = n % width;
          const ny = (n / width) | 0;
          // Prevent wrap on left/right edges
          if (Math.abs(nx - px) + Math.abs(ny - py) !== 1) continue;
          if (labels[n] >= 0) continue;
          if (indices[n] !== colorIndex) continue;
          labels[n] = id;
          stack.push(n);
        }
      }

      regions.set(id, {
        id,
        colorIndex,
        area: pixels.length,
        minX,
        minY,
        maxX,
        maxY,
        cx: sumX / pixels.length,
        cy: sumY / pixels.length,
        pixels,
        children: [],
        parent: null,
      });
    }
  }

  return { width, height, labels, regions };
}

function absorbRegion(map: RegionMap, fromId: number, intoId: number): void {
  const { width, labels, regions } = map;
  const region = regions.get(fromId);
  const target = regions.get(intoId);
  if (!region || !target) return;
  for (const p of region.pixels) {
    labels[p] = intoId;
    target.pixels.push(p);
    const px = p % width;
    const py = (p / width) | 0;
    target.minX = Math.min(target.minX, px);
    target.minY = Math.min(target.minY, py);
    target.maxX = Math.max(target.maxX, px);
    target.maxY = Math.max(target.maxY, py);
  }
  const n = target.pixels.length;
  let sx = 0;
  let sy = 0;
  for (const p of target.pixels) {
    sx += p % width;
    sy += (p / width) | 0;
  }
  target.cx = sx / n;
  target.cy = sy / n;
  target.area = n;
  regions.delete(fromId);
}

/**
 * Merge neighboring regions whose palette colors are close in CIELAB
 * (absorbs anti-alias fringes into parent shapes).
 */
export function mergeSimilarColorRegions(
  map: RegionMap,
  palette: [number, number, number][],
  maxLabDist = 18,
): void {
  const { width, height, labels, regions } = map;
  // Precompute LAB for palette
  const labs = palette.map(([r, g, b]) => {
    // inline via dynamic import avoided — use approximate RGB euclidean scaled
    // Better: import rgbToLab
    return { r, g, b };
  });

  const colorClose = (a: number, b: number): boolean => {
    if (a === b) return true;
    if (a < 0 || b < 0 || a >= labs.length || b >= labs.length) return false;
    const ca = labs[a];
    const cb = labs[b];
    // Use RGB distance roughly mapped (~18 LAB ≈ 30 RGB for muted colors)
    const d = Math.hypot(ca.r - cb.r, ca.g - cb.g, ca.b - cb.b);
    return d <= maxLabDist * 1.6;
  };

  // Repeatedly merge smaller into larger neighbor if colors close
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 40) {
    changed = false;
    const sorted = [...regions.values()].sort((a, b) => a.area - b.area);
    for (const region of sorted) {
      if (!regions.has(region.id)) continue;
      const edgeCount = new Map<number, number>();
      for (const p of region.pixels) {
        const x = p % width;
        const y = (p / width) | 0;
        const neigh = [
          x > 0 ? p - 1 : -1,
          x < width - 1 ? p + 1 : -1,
          y > 0 ? p - width : -1,
          y < height - 1 ? p + width : -1,
        ];
        for (const n of neigh) {
          if (n < 0) continue;
          const nid = labels[n];
          if (nid < 0 || nid === region.id) continue;
          if (!regions.has(nid)) continue;
          edgeCount.set(nid, (edgeCount.get(nid) ?? 0) + 1);
        }
      }
      let bestId = -1;
      let bestEdge = 0;
      for (const [nid, e] of edgeCount) {
        const other = regions.get(nid)!;
        if (!colorClose(region.colorIndex, other.colorIndex)) continue;
        // Prefer merging tiny fringe into larger body
        if (other.area < region.area * 0.5) continue;
        if (e > bestEdge) {
          bestEdge = e;
          bestId = nid;
        }
      }
      if (bestId >= 0 && bestEdge >= 2) {
        absorbRegion(map, region.id, bestId);
        changed = true;
        break;
      }
    }
  }
}

/**
 * Merge regions smaller than minArea into the neighbor with the longest shared edge.
 */
export function mergeSmallRegions(map: RegionMap, minArea: number): void {
  const { width, height, labels, regions } = map;
  const sorted = [...regions.values()].sort((a, b) => a.area - b.area);

  for (const region of sorted) {
    if (!regions.has(region.id)) continue;
    if (region.area >= minArea) continue;

    // Count shared edges with neighbors
    const edgeCount = new Map<number, number>();
    for (const p of region.pixels) {
      const x = p % width;
      const y = (p / width) | 0;
      const neigh = [
        x > 0 ? p - 1 : -1,
        x < width - 1 ? p + 1 : -1,
        y > 0 ? p - width : -1,
        y < height - 1 ? p + width : -1,
      ];
      for (const n of neigh) {
        if (n < 0) continue;
        const nid = labels[n];
        if (nid < 0 || nid === region.id) continue;
        if (!regions.has(nid)) continue;
        edgeCount.set(nid, (edgeCount.get(nid) ?? 0) + 1);
      }
    }

    let bestId = -1;
    let bestEdge = 0;
    for (const [nid, e] of edgeCount) {
      if (e > bestEdge) {
        bestEdge = e;
        bestId = nid;
      }
    }
    if (bestId < 0) {
      // No neighbor — drop (make transparent)
      for (const p of region.pixels) labels[p] = -1;
      regions.delete(region.id);
      continue;
    }

    absorbRegion(map, region.id, bestId);
  }
}

/** Morphological close (dilate then erode) with 3×3 structuring element, per region. */
export function morphCloseRegions(map: RegionMap, iterations = 1): void {
  if (iterations < 1) return;
  const { width, height, labels, regions } = map;

  for (let iter = 0; iter < iterations; iter++) {
    // Dilate: any empty neighbor of a region pixel becomes that region (prefer larger)
    const dilate = new Int32Array(labels);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x;
        if (labels[p] >= 0) continue;
        let best = -1;
        let bestArea = -1;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const nid = labels[ny * width + nx];
            if (nid < 0) continue;
            const r = regions.get(nid);
            if (!r) continue;
            if (r.area > bestArea) {
              bestArea = r.area;
              best = nid;
            }
          }
        }
        if (best >= 0) dilate[p] = best;
      }
    }

    // Erode: if a pixel's 3×3 neighborhood is not fully same label, clear it (but keep if interior)
    const erode = new Int32Array(dilate);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x;
        const id = dilate[p];
        if (id < 0) continue;
        let allSame = true;
        for (let dy = -1; dy <= 1 && allSame; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
              allSame = false;
              break;
            }
            if (dilate[ny * width + nx] !== id) {
              allSame = false;
              break;
            }
          }
        }
        // Only erode newly dilated border pixels that were originally empty
        if (!allSame && labels[p] < 0) erode[p] = -1;
      }
    }

    // Rebuild region pixel lists from erode
    for (const r of regions.values()) {
      r.pixels = [];
      r.area = 0;
      r.minX = width;
      r.minY = height;
      r.maxX = 0;
      r.maxY = 0;
    }
    for (let p = 0; p < erode.length; p++) {
      labels[p] = erode[p];
      const id = erode[p];
      if (id < 0) continue;
      const r = regions.get(id);
      if (!r) continue;
      r.pixels.push(p);
      const x = p % width;
      const y = (p / width) | 0;
      r.minX = Math.min(r.minX, x);
      r.minY = Math.min(r.minY, y);
      r.maxX = Math.max(r.maxX, x);
      r.maxY = Math.max(r.maxY, y);
    }
    for (const r of [...regions.values()]) {
      if (!r.pixels.length) {
        regions.delete(r.id);
        continue;
      }
      r.area = r.pixels.length;
      let sx = 0;
      let sy = 0;
      for (const p of r.pixels) {
        sx += p % width;
        sy += (p / width) | 0;
      }
      r.cx = sx / r.area;
      r.cy = sy / r.area;
    }
  }
}

/** Moore neighborhood boundary tracing → ordered contour points. */
export function traceBoundary(region: Region, width: number, labels: Int32Array): Point2D[] {
  const { minX, minY, maxX, maxY, id } = region;
  // Find starting point: leftmost topmost pixel of region
  let startX = -1;
  let startY = -1;
  outer: for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (labels[y * width + x] === id) {
        startX = x;
        startY = y;
        break outer;
      }
    }
  }
  if (startX < 0) return [];

  // Clockwise Moore neighbors starting from west
  const dx = [-1, -1, 0, 1, 1, 1, 0, -1];
  const dy = [0, -1, -1, -1, 0, 1, 1, 1];

  const contour: Point2D[] = [];
  let x = startX;
  let y = startY;
  let dir = 0; // came from west
  const maxSteps = region.area * 8 + 64;

  for (let step = 0; step < maxSteps; step++) {
    contour.push({ x: x + 0.5, y: y + 0.5 });
    // Start search from dir-2 (previous backtrack + 1)
    let found = false;
    for (let i = 0; i < 8; i++) {
      const nd = (dir + 6 + i) % 8; // turn left from incoming
      const nx = x + dx[nd];
      const ny = y + dy[nd];
      if (nx < 0 || ny < 0 || nx >= width || ny * width + nx >= labels.length) continue;
      if (labels[ny * width + nx] === id) {
        x = nx;
        y = ny;
        dir = nd;
        found = true;
        break;
      }
    }
    if (!found) break;
    if (x === startX && y === startY && contour.length > 2) break;
  }

  return contour;
}

/** Andrew's monotone chain convex hull. */
export function convexHull(points: Point2D[]): Point2D[] {
  if (points.length <= 2) return [...points];
  const pts = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o: Point2D, a: Point2D, b: Point2D) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Point2D[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Point2D[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Build containment tree: region A is child of B if A's bbox is inside B's bbox
 * (with small padding) and A's centroid is inside B's bbox. Prefer smallest parent.
 */
export function buildContainmentTree(map: RegionMap): void {
  const list = [...map.regions.values()];
  for (const r of list) {
    r.children = [];
    r.parent = null;
  }

  for (const child of list) {
    let bestParent: Region | null = null;
    let bestArea = Infinity;
    for (const parent of list) {
      if (parent.id === child.id) continue;
      if (parent.area <= child.area) continue;
      // child bbox inside parent bbox (with 1px tolerance)
      if (
        child.minX >= parent.minX - 1 &&
        child.minY >= parent.minY - 1 &&
        child.maxX <= parent.maxX + 1 &&
        child.maxY <= parent.maxY + 1
      ) {
        // centroid also inside
        if (
          child.cx >= parent.minX &&
          child.cx <= parent.maxX &&
          child.cy >= parent.minY &&
          child.cy <= parent.maxY
        ) {
          if (parent.area < bestArea) {
            bestArea = parent.area;
            bestParent = parent;
          }
        }
      }
    }
    if (bestParent) {
      child.parent = bestParent.id;
      bestParent.children.push(child.id);
    }
  }
}

/**
 * Collect occlusion-aware pixel set: region's own pixels plus all descendants.
 * Used so a partially covered circle still fits as a full circle.
 */
export function occlusionPixels(map: RegionMap, regionId: number): number[] {
  const region = map.regions.get(regionId);
  if (!region) return [];
  const out = [...region.pixels];
  const stack = [...region.children];
  while (stack.length) {
    const cid = stack.pop()!;
    const child = map.regions.get(cid);
    if (!child) continue;
    out.push(...child.pixels);
    stack.push(...child.children);
  }
  return out;
}
