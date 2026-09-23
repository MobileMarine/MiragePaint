import { Point2D } from '../models/shape';

/** Port of WooliosPaintLibrary.moduloAngle */
export function moduloAngle(angle: number): number {
  let a = angle;
  while (a >= 360) a -= 360;
  while (a < 0) a += 360;
  return a;
}

/** Port of WooliosPaintLibrary.getAngle – degrees from a → b */
export function getAngle(a: Point2D, b: Point2D): number {
  let returnWinkel = -90;
  const x = b.x - a.x;
  const y = b.y - a.y;

  if (x === 0 && y < 0) returnWinkel = -90;
  if (x > 0 && y === 0) returnWinkel = 0;
  if (x < 0 && y === 0) returnWinkel = 180;

  if (x > 0 && y > 0) returnWinkel = (Math.atan(y / x) * 180) / Math.PI;
  if (x < 0 && y > 0) returnWinkel = 90 - (Math.atan(y / -x) * 180) / Math.PI + 90;
  if (x < 0 && y < 0) returnWinkel = (Math.atan(-y / -x) * 180) / Math.PI + 180;
  if (x > 0 && y < 0) returnWinkel = 90 - (Math.atan(-y / x) * 180) / Math.PI + 270;

  return returnWinkel;
}

/** Port of WooliosPaintLibrary.rotatePos – polar to cartesian */
export function rotatePos(radius: number, angle: number): Point2D {
  angle = moduloAngle(angle);
  let xpos = radius;
  let ypos = 0;

  if (radius > 0) {
    if (angle === 90) {
      xpos = 0;
      ypos = radius;
    } else if (angle === 180) {
      xpos = -radius;
      ypos = 0;
    } else if (angle === 270) {
      xpos = 0;
      ypos = -radius;
    } else if (angle > 0 && angle < 90) {
      xpos = Math.cos((angle * Math.PI) / 180) * radius;
      ypos = Math.sin((angle * Math.PI) / 180) * radius;
    } else if (angle > 90 && angle < 180) {
      xpos = -Math.sin(((angle - 90) * Math.PI) / 180) * radius;
      ypos = Math.cos(((angle - 90) * Math.PI) / 180) * radius;
    } else if (angle > 180 && angle < 270) {
      xpos = -Math.cos(((angle - 180) * Math.PI) / 180) * radius;
      ypos = -Math.sin(((angle - 180) * Math.PI) / 180) * radius;
    } else if (angle > 270 && angle < 360) {
      xpos = Math.sin(((angle - 270) * Math.PI) / 180) * radius;
      ypos = -Math.cos(((angle - 270) * Math.PI) / 180) * radius;
    } else if (angle === 0) {
      xpos = radius;
      ypos = 0;
    }
  }

  return { x: xpos, y: ypos };
}

/** Port of WooliosPaintLibrary.rotateXY */
export function rotateXY(start: Point2D, angle: number): Point2D {
  const plusangle = getAngle({ x: 0, y: 0 }, start);
  const r = Math.sqrt(start.x * start.x + start.y * start.y);
  return rotatePos(Math.round(r), angle + plusangle);
}

export function distance(a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function lerpColor(start: string, end: string, t: number): string {
  const a = parseHex(start);
  const b = parseHex(end);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h.padEnd(6, '0').slice(0, 6);
  return {
    r: parseInt(full.slice(0, 2), 16) || 0,
    g: parseInt(full.slice(2, 4), 16) || 0,
    b: parseInt(full.slice(4, 6), 16) || 0,
  };
}

function toHex(n: number): string {
  return Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
}

/** Seeded PRNG (mulberry32) for deterministic random stars */
export function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
