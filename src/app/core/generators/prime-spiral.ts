import { Point2D } from '../models/shape';
import { GenLine } from './shapes';
import { colorAt, PaletteMode } from '../style/presets';

export const PRIME_SPIRAL_ANGLE_PRESETS = [90, 72, 120, 137.5, 45] as const;

/** Sieve of Eratosthenes — primes ≤ n (from Priminator). */
export function sieveOfEratosthenes(n: number): number[] {
  const limit = Math.max(2, Math.floor(n));
  const prime = new Array<boolean>(limit + 1).fill(true);
  prime[0] = false;
  prime[1] = false;
  for (let p = 2; p * p <= limit; p++) {
    if (prime[p]) {
      for (let i = p * p; i <= limit; i += p) prime[i] = false;
    }
  }
  const primes: number[] = [];
  for (let i = 2; i <= limit; i++) {
    if (prime[i]) primes.push(i);
  }
  return primes;
}

/** Consecutive step lengths 1..count (fractal / square spiral family). */
export function sequenceSteps(count: number): number[] {
  const n = Math.max(2, Math.floor(count));
  const out: number[] = [];
  for (let i = 1; i <= n; i++) out.push(i);
  return out;
}

/**
 * Polyline spiral: each step length advances in current direction,
 * then direction += rotationDeg (Priminator getPrimesSpiralByDegree).
 */
export function spiralByDegree(steps: readonly number[], rotationDeg: number): Point2D[] {
  if (!steps.length) return [];
  const points: Point2D[] = [];
  let x = 0;
  let y = 0;
  let direction = 0;
  points.push({ x, y });
  for (const len of steps) {
    const rad = (direction * Math.PI) / 180;
    x += Math.cos(rad) * len;
    y -= Math.sin(rad) * len;
    points.push({ x, y });
    direction = (direction + rotationDeg) % 360;
  }
  return points;
}

function computeBounds(points: Point2D[]): { minX: number; minY: number; w: number; h: number } {
  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, w: Math.max(1e-6, maxX - minX), h: Math.max(1e-6, maxY - minY) };
}

/** Scale/center spiral into local coords so max extent ≈ 2*radius. */
export function fitSpiralToRadius(points: Point2D[], radius: number): Point2D[] {
  if (points.length < 2) return points;
  const r = Math.max(8, radius);
  const b = computeBounds(points);
  const scale = (2 * r) / Math.max(b.w, b.h);
  const cx = b.minX + b.w / 2;
  const cy = b.minY + b.h / 2;
  return points.map((p) => ({
    x: (p.x - cx) * scale,
    y: (p.y - cy) * scale,
  }));
}

export type SpiralKind = 'primes' | 'sequence';

export function spiralStepLengths(kind: SpiralKind, limit: number): number[] {
  if (kind === 'primes') return sieveOfEratosthenes(limit);
  return sequenceSteps(limit);
}

/**
 * Colored line segments for prime/fractal spiral, local origin, fitted to radius.
 */
export function generateSpiralLines(
  kind: SpiralKind,
  limit: number,
  rotationDeg: number,
  radius: number,
  startColor: string,
  endColor: string,
  paletteMode: PaletteMode = 'gradient',
  extra?: { stops?: string[]; stepped?: boolean; steps?: number },
  startAngle = 0,
): GenLine[] {
  const steps = spiralStepLengths(kind, limit);
  if (steps.length < 1) return [];
  const raw = spiralByDegree(steps, rotationDeg);
  let pts = fitSpiralToRadius(raw, radius);
  if (startAngle) {
    const rad = (startAngle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    pts = pts.map((p) => ({
      x: p.x * cos - p.y * sin,
      y: p.x * sin + p.y * cos,
    }));
  }
  const n = Math.max(1, pts.length - 1);
  const out: GenLine[] = [];
  for (let i = 1; i < pts.length; i++) {
    out.push({
      kind: 'line',
      x1: pts[i - 1].x,
      y1: pts[i - 1].y,
      x2: pts[i].x,
      y2: pts[i].y,
      stroke: colorAt(
        i - 1,
        n,
        paletteMode,
        startColor,
        endColor,
        extra?.stops,
        extra?.stepped,
        extra?.steps,
      ),
    });
  }
  return out;
}
