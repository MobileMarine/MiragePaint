import { Point2D } from '../models/shape';
import { createRng, lerpColor, rotatePos, rotateXY } from '../math/polar';

export interface GenLine {
  kind: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
}

export interface GenEllipse {
  kind: 'ellipse';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  fill: string;
  stroke?: string;
}

export interface GenRect {
  kind: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  gradient?: { start: string; end: string };
}

export type GenPrimitive = GenLine | GenEllipse | GenRect;

export function generateOctopus(
  arms: number,
  circleCount: number,
  curve: number,
  radiusX: number,
  radiusY: number,
  startAngle: number,
  startColor: string,
  endColor: string,
): GenPrimitive[] {
  const out: GenPrimitive[] = [];
  const drehWinkel = 360 / Math.max(1, arms);
  const same = startColor === endColor;

  if (same) {
    out.push({
      kind: 'ellipse',
      cx: radiusX / 2,
      cy: radiusY / 2,
      rx: radiusX / 2,
      ry: radiusY / 2,
      fill: startColor,
    });
  } else {
    out.push(...generateGradientCircle(0, 0, radiusX, radiusY, startColor, endColor));
  }

  for (let i = 0; i < arms; i++) {
    let xstep = 0;
    for (let j = 1; j <= circleCount; j++) {
      xstep += radiusX / Math.max(1, Math.floor(j * 1.3));
      const newpos = rotatePos(xstep, startAngle + i * drehWinkel + curve * j);
      const rx = radiusX / (j + 1);
      const ry = radiusY / (j + 1);
      if (same) {
        out.push({
          kind: 'ellipse',
          cx: newpos.x + rx / 2,
          cy: newpos.y + ry / 2,
          rx: rx / 2,
          ry: ry / 2,
          fill: startColor,
        });
      } else {
        out.push(
          ...generateGradientCircle(newpos.x, newpos.y, 1 + rx, 1 + ry, startColor, endColor),
        );
      }
    }
  }
  return out;
}

export function generateGradientCircle(
  xpos: number,
  ypos: number,
  xr: number,
  yr: number,
  startColor: string,
  endColor: string,
): GenEllipse[] {
  const out: GenEllipse[] = [];
  const mradius = Math.max(xr, yr);
  if (mradius <= 0) return out;
  const xrel = xr / mradius;
  const yrel = yr / mradius;

  // Sample every few steps for performance while keeping the look
  const step = Math.max(1, Math.floor(mradius / 40));
  for (let i = mradius; i >= 0; i -= step) {
    const t = i / mradius;
    out.push({
      kind: 'ellipse',
      cx: xpos + xr / 2,
      cy: ypos + yr / 2,
      rx: i * xrel,
      ry: i * yrel,
      fill: lerpColor(startColor, endColor, t),
    });
  }
  return out;
}

export function generateCircleLine(
  arms: number,
  radius: number,
  startAngle: number,
  stroke: string,
): GenLine[] {
  const out: GenLine[] = [];
  const rotAngle = 360 / Math.max(1, arms);
  for (let i = 0; i < arms; i++) {
    const p = rotatePos(radius, startAngle + i * rotAngle);
    out.push({ kind: 'line', x1: 0, y1: 0, x2: p.x, y2: p.y, stroke });
  }
  return out;
}

export function generateCircles(
  mode: 1 | 2 | 3,
  count: number,
  sizeMultiply: number,
  offset: number,
  w: number,
  h: number,
  startAngle: number,
  startColor: string,
  endColor: string,
): GenEllipse[] {
  const out: GenEllipse[] = [];
  let sizeW = w;
  let sizeH = h;

  for (let i = 0; i < count; i++) {
    const newpos = rotatePos(Math.round(i * w * offset), startAngle);
    const color = lerpColor(startColor, endColor, count <= 1 ? 0 : i / count);

    if (mode === 1) {
      const rx = sizeMultiply * w;
      const ry = sizeMultiply * h;
      out.push({
        kind: 'ellipse',
        cx: newpos.x,
        cy: newpos.y,
        rx,
        ry,
        fill: 'none',
        stroke: color,
      });
    } else {
      sizeW *= sizeMultiply;
      sizeH *= sizeMultiply;
      out.push({
        kind: 'ellipse',
        cx: newpos.x,
        cy: newpos.y,
        rx: sizeW / 2,
        ry: sizeW / 2,
        fill: 'none',
        stroke: color,
      });
    }
  }
  return out;
}

export function generateRandomStar(
  arms: number,
  radius: number,
  seed: number,
  stroke: string,
): GenLine[] {
  const rng = createRng(seed);
  const out: GenLine[] = [];
  const rotAngle = 360 / Math.max(1, arms);
  for (let i = 0; i < arms; i++) {
    const randomRadius = Math.round(radius * rng() + 1);
    const p = rotatePos(randomRadius, i * rotAngle);
    out.push({ kind: 'line', x1: 0, y1: 0, x2: p.x, y2: p.y, stroke });
  }
  return out;
}

export function generateMultiStar(
  arms: number,
  radius: number,
  stages: number,
  step: number,
  mode: 1 | 2 | 3 | 4,
  startAngle: number,
  startColor: string,
  endColor: string,
): GenLine[] {
  const out: GenLine[] = [];
  const rotAngle = 360 / Math.max(1, arms);
  const colorAt = (i: number) =>
    lerpColor(startColor, endColor, stages <= 0 ? 0 : i / stages);

  if (mode === 1) {
    for (let i = stages; i > 0; i--) {
      const c = colorAt(i);
      out.push(
        { kind: 'line', x1: i * step, y1: 0, x2: 0, y2: i * step, stroke: c },
        { kind: 'line', x1: -i * step, y1: 0, x2: 0, y2: i * step, stroke: c },
        { kind: 'line', x1: i * step, y1: 0, x2: 0, y2: -i * step, stroke: c },
        { kind: 'line', x1: -i * step, y1: 0, x2: 0, y2: -i * step, stroke: c },
      );
    }
  } else if (mode === 2) {
    for (let i = stages; i > 0; i--) {
      const c = colorAt(i);
      out.push(
        { kind: 'line', x1: radius, y1: 0, x2: 0, y2: i * step, stroke: c },
        { kind: 'line', x1: -radius, y1: 0, x2: 0, y2: i * step, stroke: c },
        { kind: 'line', x1: radius, y1: 0, x2: 0, y2: -i * step, stroke: c },
        { kind: 'line', x1: -radius, y1: 0, x2: 0, y2: -i * step, stroke: c },
        { kind: 'line', x1: 0, y1: radius, x2: i * step, y2: 0, stroke: c },
        { kind: 'line', x1: 0, y1: -radius, x2: i * step, y2: 0, stroke: c },
        { kind: 'line', x1: 0, y1: radius, x2: -i * step, y2: 0, stroke: c },
        { kind: 'line', x1: 0, y1: -radius, x2: -i * step, y2: 0, stroke: c },
      );
    }
  } else if (mode === 3) {
    for (let j = 0; j < 4; j++) {
      for (let i = stages; i >= 0; i--) {
        const c = colorAt(i);
        const p1 = rotateXY({ x: radius, y: 0 }, startAngle + j * 90);
        const p2 = rotateXY({ x: 0, y: i * step }, startAngle + j * 90);
        out.push({ kind: 'line', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, stroke: c });
        const p3 = rotateXY({ x: 0, y: i * step }, startAngle + 180 + j * 90);
        out.push({ kind: 'line', x1: p1.x, y1: p1.y, x2: p3.x, y2: p3.y, stroke: c });
      }
    }
  } else {
    for (let j = 0; j < arms; j++) {
      for (let i = stages; i >= 0; i--) {
        const c = colorAt(i);
        const p1 = rotateXY({ x: radius, y: 0 }, startAngle + j * rotAngle);
        const mid = rotatePos(i * step, rotAngle / 2);
        const p2 = rotateXY(mid, startAngle + j * rotAngle);
        out.push({ kind: 'line', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, stroke: c });
        const p3 = rotateXY(mid, startAngle + j * rotAngle - rotAngle);
        out.push({ kind: 'line', x1: p1.x, y1: p1.y, x2: p3.x, y2: p3.y, stroke: c });
      }
    }
  }
  return out;
}

export function normalizeRect(x1: number, y1: number, x2: number, y2: number) {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  return { x, y, width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
}

export function triangleFromDrag(x1: number, y1: number, x2: number, y2: number): [Point2D, Point2D, Point2D] {
  const midX = (x1 + x2) / 2;
  return [
    { x: midX, y: y1 },
    { x: x2, y: y2 },
    { x: x1, y: y2 },
  ];
}
