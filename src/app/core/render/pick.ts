import {
  CenterLinesParams,
  FreehandParams,
  LineParams,
  Point2D,
  Shape,
  Transform2D,
} from '../models/shape';
import { styleCapabilities } from '../style/style-capabilities';
import { boundsForShape, localToWorldPoint, shapePivot, shapePrimitives } from './geometry';

/** Max pick distance in screen pixels (converted via zoom). */
export const PICK_THRESHOLD_PX = 14;

function distPointToSegment(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = a.x + t * dx;
  const qy = a.y + t * dy;
  return Math.hypot(p.x - qx, p.y - qy);
}

function distToAabb(p: Point2D, b: { x: number; y: number; w: number; h: number }): number {
  const dx = Math.max(b.x - p.x, 0, p.x - (b.x + b.w));
  const dy = Math.max(b.y - p.y, 0, p.y - (b.y + b.h));
  return Math.hypot(dx, dy);
}

/** Inverse of localToWorldPoint. */
export function worldToLocalPoint(
  p: Point2D,
  t: Transform2D,
  pivot: { x: number; y: number },
): Point2D {
  const sx = t.scaleX || 1;
  const sy = t.scaleY || 1;
  const rad = (-t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - t.x - pivot.x;
  const dy = p.y - t.y - pivot.y;
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;
  return { x: lx / sx + pivot.x, y: ly / sy + pivot.y };
}

function minDistToWorldSegments(
  world: Point2D,
  segments: { x1: number; y1: number; x2: number; y2: number }[],
  t: Transform2D,
  pivot: { x: number; y: number },
): number {
  let best = Infinity;
  for (const s of segments) {
    const a = localToWorldPoint({ x: s.x1, y: s.y1 }, t, pivot);
    const b = localToWorldPoint({ x: s.x2, y: s.y2 }, t, pivot);
    best = Math.min(best, distPointToSegment(world, a, b));
    if (best < 0.5) return best;
  }
  return best;
}

/**
 * Approximate distance in world units from `world` to the visible geometry of `shape`.
 * 0 = on/inside the shape (for filled areas) or exactly on a stroke.
 */
export function distanceToShape(shape: Shape, world: Point2D): number {
  const pivot = shapePivot(shape);
  const t = shape.transform;
  const local = worldToLocalPoint(world, t, pivot);
  const caps = styleCapabilities(shape.type);
  const strokePad = Math.max(0, (shape.style.strokeWidth || 0) / 2);
  const scale = Math.max(1e-6, (Math.abs(t.scaleX) + Math.abs(t.scaleY)) / 2);

  const padLocal = (strokePad + 0.5) / scale;

  switch (shape.type) {
    case 'line': {
      const p = shape.params as LineParams;
      const d = distPointToSegment(world, { x: p.x1, y: p.y1 }, { x: p.x2, y: p.y2 });
      return Math.max(0, d - strokePad * scale);
    }
    case 'freehand': {
      const pts = (shape.params as FreehandParams).points;
      if (pts.length < 2) return Infinity;
      let best = Infinity;
      for (let i = 1; i < pts.length; i++) {
        best = Math.min(best, distPointToSegment(world, pts[i - 1], pts[i]));
        if (best < 0.5) break;
      }
      return Math.max(0, best - strokePad * scale);
    }
    case 'centerLines': {
      const rays = (shape.params as CenterLinesParams).rays;
      const segs = rays.map((r) => ({ x1: 0, y1: 0, x2: r.x, y2: r.y }));
      const d = minDistToWorldSegments(world, segs, t, pivot);
      return Math.max(0, d - strokePad * scale);
    }
    case 'circleLine':
    case 'multiStar':
    case 'randomStar':
    case 'primeSpiral':
    case 'fractalSpiral':
    case 'octopus':
    case 'circles':
    case 'gradientCircle': {
      const b = boundsForShape(shape);
      if (distToAabb(local, b) > padLocal + 24) {
        // Far from local AABB — cheap reject (world ≈ local*scale)
        return distToAabb(local, b) * scale;
      }
      const prims = shapePrimitives(shape);
      const segs: { x1: number; y1: number; x2: number; y2: number }[] = [];
      let bestEllipse = Infinity;
      for (const prim of prims) {
        if (prim.kind === 'line') {
          segs.push({ x1: prim.x1, y1: prim.y1, x2: prim.x2, y2: prim.y2 });
        } else if (prim.kind === 'ellipse') {
          // Approximate: distance to ellipse ring/disk in local space
          const dx = local.x - prim.cx;
          const dy = local.y - prim.cy;
          const rx = Math.max(1e-6, prim.rx);
          const ry = Math.max(1e-6, prim.ry);
          const nx = dx / rx;
          const ny = dy / ry;
          const r = Math.hypot(nx, ny);
          if (prim.fill && prim.fill !== 'none') {
            if (r <= 1) bestEllipse = 0;
            else {
              // Outside filled ellipse: approx radial excess
              const ex = prim.cx + (dx / r) * rx;
              const ey = prim.cy + (dy / r) * ry;
              bestEllipse = Math.min(bestEllipse, Math.hypot(local.x - ex, local.y - ey));
            }
          } else {
            // Stroke ring
            const ex = prim.cx + (dx / Math.max(r, 1e-6)) * rx;
            const ey = prim.cy + (dy / Math.max(r, 1e-6)) * ry;
            bestEllipse = Math.min(bestEllipse, Math.hypot(local.x - ex, local.y - ey));
          }
        }
      }
      let best = bestEllipse;
      if (segs.length) {
        best = Math.min(best, minDistToWorldSegments(world, segs, t, pivot) / scale);
      }
      if (!Number.isFinite(best)) return distToAabb(local, b) * scale;
      return Math.max(0, best * scale - strokePad * scale);
    }
    default: {
      // Area shapes: inside AABB → hit; else distance to box edge
      const b = boundsForShape(shape);
      const filled = caps.fill && shape.style.fillMode !== 'none';
      const dLocal = distToAabb(local, b);
      if (filled && dLocal === 0) return 0;
      // Near edge also counts (stroke)
      return Math.max(0, dLocal * scale - (filled ? 0 : strokePad * scale));
    }
  }
}

/**
 * Nearest shape within `maxDist` world units. Prefers later (top) shapes on ties.
 */
export function pickNearestShape(
  shapes: readonly Shape[],
  world: Point2D,
  maxDist: number,
): Shape | null {
  let best: Shape | null = null;
  let bestDist = maxDist;
  const tieEps = Math.max(0.35, maxDist * 0.08);

  for (const shape of shapes) {
    const d = distanceToShape(shape, world);
    if (d < bestDist - tieEps) {
      best = shape;
      bestDist = d;
    } else if (best && Math.abs(d - bestDist) <= tieEps) {
      // Prefer topmost when nearly equidistant
      best = shape;
      bestDist = Math.min(bestDist, d);
    } else if (!best && d <= maxDist) {
      best = shape;
      bestDist = d;
    }
  }

  return bestDist <= maxDist ? best : null;
}
