import { Point2D } from '../models/shape';
import { createRng, rotatePos, rotateXY } from '../math/polar';
import { colorAt, PaletteMode } from '../style/presets';

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
  paletteMode: PaletteMode = 'gradient',
): GenPrimitive[] {
  const out: GenPrimitive[] = [];
  const drehWinkel = 360 / Math.max(1, arms);
  const solid = paletteMode === 'solid' || startColor === endColor;

  if (solid) {
    out.push({
      kind: 'ellipse',
      cx: radiusX / 2,
      cy: radiusY / 2,
      rx: radiusX / 2,
      ry: radiusY / 2,
      fill: startColor,
    });
  } else {
    out.push(
      ...generateGradientCircle(0, 0, radiusX, radiusY, startColor, endColor, paletteMode),
    );
  }

  for (let i = 0; i < arms; i++) {
    let xstep = 0;
    for (let j = 1; j <= circleCount; j++) {
      xstep += radiusX / Math.max(1, Math.floor(j * 1.3));
      const newpos = rotatePos(xstep, startAngle + i * drehWinkel + curve * j);
      const rx = radiusX / (j + 1);
      const ry = radiusY / (j + 1);
      if (solid) {
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
          ...generateGradientCircle(
            newpos.x,
            newpos.y,
            1 + rx,
            1 + ry,
            startColor,
            endColor,
            paletteMode,
          ),
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
  mode: PaletteMode = 'gradient',
): GenEllipse[] {
  const out: GenEllipse[] = [];
  const mradius = Math.max(xr, yr);
  if (mradius <= 0) return out;
  const xrel = xr / mradius;
  const yrel = yr / mradius;

  // Sample every few steps for performance while keeping the look
  const step = Math.max(1, Math.floor(mradius / 40));
  const indices: number[] = [];
  for (let i = mradius; i >= 0; i -= step) indices.push(i);
  const n = indices.length;
  for (let k = 0; k < n; k++) {
    const i = indices[k];
    out.push({
      kind: 'ellipse',
      cx: xpos + xr / 2,
      cy: ypos + yr / 2,
      rx: i * xrel,
      ry: i * yrel,
      fill: colorAt(k, n, mode, startColor, endColor),
    });
  }
  return out;
}

export function generateCircleLine(
  arms: number,
  radius: number,
  startAngle: number,
  startColor: string,
  endColor: string = startColor,
  mode: PaletteMode = 'solid',
): GenLine[] {
  const out: GenLine[] = [];
  const rotAngle = 360 / Math.max(1, arms);
  const n = Math.max(1, arms);
  for (let i = 0; i < arms; i++) {
    const p = rotatePos(radius, startAngle + i * rotAngle);
    out.push({
      kind: 'line',
      x1: 0,
      y1: 0,
      x2: p.x,
      y2: p.y,
      stroke: colorAt(i, n, mode, startColor, endColor),
    });
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
  paletteMode: PaletteMode = 'gradient',
  filled = false,
): GenEllipse[] {
  const out: GenEllipse[] = [];
  let sizeW = w;
  let sizeH = h;
  const n = Math.max(1, count);

  for (let i = 0; i < count; i++) {
    const newpos = rotatePos(Math.round(i * w * offset), startAngle);
    const color = colorAt(i, n, paletteMode, startColor, endColor);

    if (mode === 1) {
      const rx = sizeMultiply * w;
      const ry = sizeMultiply * h;
      out.push({
        kind: 'ellipse',
        cx: newpos.x,
        cy: newpos.y,
        rx,
        ry,
        fill: filled ? color : 'none',
        stroke: filled ? undefined : color,
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
        fill: filled ? color : 'none',
        stroke: filled ? undefined : color,
      });
    }
  }

  // Filled rings: largest first so each inter-ring band stays visible
  if (filled && mode !== 1) {
    out.reverse();
  }
  return out;
}

export function generateRandomStar(
  arms: number,
  radius: number,
  seed: number,
  startColor: string,
  endColor: string = startColor,
  mode: PaletteMode = 'solid',
): GenLine[] {
  const rng = createRng(seed);
  const out: GenLine[] = [];
  const rotAngle = 360 / Math.max(1, arms);
  const n = Math.max(1, arms);
  for (let i = 0; i < arms; i++) {
    const randomRadius = Math.round(radius * rng() + 1);
    const p = rotatePos(randomRadius, i * rotAngle);
    out.push({
      kind: 'line',
      x1: 0,
      y1: 0,
      x2: p.x,
      y2: p.y,
      stroke: colorAt(i, n, mode, startColor, endColor),
    });
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
  paletteMode: PaletteMode = 'gradient',
): GenLine[] {
  const out: GenLine[] = [];
  const rotAngle = 360 / Math.max(1, arms);
  const n = Math.max(1, stages);
  const colorFor = (i: number) => colorAt(i, n, paletteMode, startColor, endColor);

  if (mode === 1) {
    for (let i = stages; i > 0; i--) {
      const c = colorFor(i);
      out.push(
        { kind: 'line', x1: i * step, y1: 0, x2: 0, y2: i * step, stroke: c },
        { kind: 'line', x1: -i * step, y1: 0, x2: 0, y2: i * step, stroke: c },
        { kind: 'line', x1: i * step, y1: 0, x2: 0, y2: -i * step, stroke: c },
        { kind: 'line', x1: -i * step, y1: 0, x2: 0, y2: -i * step, stroke: c },
      );
    }
  } else if (mode === 2) {
    for (let i = stages; i > 0; i--) {
      const c = colorFor(i);
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
        const c = colorFor(i);
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
        const c = colorFor(i);
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

/** Regular n-gon vertices, flat-top for even n when rotation=0 (point-top for odd). */
export function regularPolygonPoints(
  cx: number,
  cy: number,
  radius: number,
  sides: number,
  rotationDeg = -90,
): Point2D[] {
  const n = Math.max(3, Math.floor(sides));
  const out: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    const a = rotationDeg + (i * 360) / n;
    const p = rotatePos(radius, a);
    out.push({ x: cx + p.x, y: cy + p.y });
  }
  return out;
}

/** Heart path fitted into axis-aligned box. */
export function heartPath(x: number, y: number, w: number, h: number): string {
  if (w < 0.5 || h < 0.5) return '';
  const x0 = x;
  const y0 = y;
  // Classic bezier heart mapped into [x,y,w,h]
  return [
    `M ${x0 + w * 0.5} ${y0 + h * 0.3}`,
    `C ${x0 + w * 0.5} ${y0 + h * 0.12}, ${x0 + w * 0.28} ${y0}, ${x0 + w * 0.12} ${y0 + h * 0.12}`,
    `C ${x0 - w * 0.02} ${y0 + h * 0.28}, ${x0 + w * 0.08} ${y0 + h * 0.55}, ${x0 + w * 0.5} ${y0 + h * 0.92}`,
    `C ${x0 + w * 0.92} ${y0 + h * 0.55}, ${x0 + w * 1.02} ${y0 + h * 0.28}, ${x0 + w * 0.88} ${y0 + h * 0.12}`,
    `C ${x0 + w * 0.72} ${y0}, ${x0 + w * 0.5} ${y0 + h * 0.12}, ${x0 + w * 0.5} ${y0 + h * 0.3}`,
    'Z',
  ].join(' ');
}

/**
 * Sunflower layout: petal angles/colors + concentric seed disks (local origin).
 */
export function sunflowerLayout(
  petals: number,
  radius: number,
  seedRings: number,
  startAngle: number,
  startColor: string,
  endColor: string,
  mode: PaletteMode = 'gradient',
): {
  petals: { angle: number; color: string }[];
  petalCy: number;
  petalRx: number;
  petalRy: number;
  seeds: GenEllipse[];
} {
  const nPetals = Math.max(6, Math.floor(petals));
  const r = Math.max(10, radius);
  const diskR = r * 0.36;
  const petalRy = r * 0.42;
  const petalRx = r * 0.14;
  const petalCy = -(diskR * 0.55 + petalRy * 0.55);

  const petalList: { angle: number; color: string }[] = [];
  for (let i = 0; i < nPetals; i++) {
    petalList.push({
      angle: startAngle + (i * 360) / nPetals,
      color: colorAt(i, nPetals, mode, startColor, endColor),
    });
  }

  const rings = Math.max(1, Math.floor(seedRings));
  const seeds: GenEllipse[] = [];
  for (let ring = rings; ring >= 0; ring--) {
    const t = rings <= 0 ? 0 : ring / rings;
    const rr = diskR * (0.2 + 0.8 * t);
    seeds.push({
      kind: 'ellipse',
      cx: 0,
      cy: 0,
      rx: rr,
      ry: rr,
      fill: colorAt(
        rings - ring,
        rings + 1,
        mode === 'solid' ? 'solid' : mode === 'rainbowStripes' ? 'rainbowStripes' : 'gradient',
        endColor,
        startColor,
      ),
    });
  }

  return { petals: petalList, petalCy, petalRx, petalRy, seeds };
}
