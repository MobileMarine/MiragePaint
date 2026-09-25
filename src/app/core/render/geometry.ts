import {
  CenterLinesParams,
  CirclesParams,
  CircleLineParams,
  EllipseParams,
  FreehandParams,
  GradientCircleParams,
  GradientParams,
  HeartParams,
  ImportedVectorParams,
  LineParams,
  MultiStarParams,
  OctopusParams,
  Point2D,
  RandomStarParams,
  PolygonParams,
  RainbowParams,
  RectParams,
  RegularPolygonParams,
  Shape,
  StarParams,
  StyleProps,
  SunflowerParams,
  FireworkParams,
  TriangleParams,
  VectorPathParams,
  GroupParams,
} from '../models/shape';
import {
  generateCircleLine,
  generateCircles,
  generateGradientCircle,
  generateMultiStar,
  generateOctopus,
  generateRandomStar,
  heartPath,
  regularPolygonPoints,
  starPolygonPoints,
  sunflowerLayout,
  GenPrimitive,
} from '../generators/shapes';
import { colorAt, PaletteMode, RAINBOW_COLORS } from '../style/presets';

export { RAINBOW_COLORS, heartPath, regularPolygonPoints, starPolygonPoints, sunflowerLayout };

export function freehandPath(params: FreehandParams): string {
  if (!params.points.length) return '';
  const [first, ...rest] = params.points;
  return `M ${first.x} ${first.y} ` + rest.map((p) => `L ${p.x} ${p.y}`).join(' ');
}

/** Point on a polyline at arc-length distance `dist` (clamped to [0, total]). */
function pointAtArc(
  pts: Point2D[],
  cum: number[],
  total: number,
  dist: number,
): Point2D {
  const t = Math.min(total, Math.max(0, dist));
  let i = 1;
  while (i < cum.length && cum[i] < t) i++;
  const i0 = Math.max(1, i) - 1;
  const i1 = Math.min(pts.length - 1, i0 + 1);
  const segLen = cum[i1] - cum[i0];
  const u = segLen < 1e-9 ? 0 : (t - cum[i0]) / segLen;
  return {
    x: pts[i0].x + (pts[i1].x - pts[i0].x) * u,
    y: pts[i0].y + (pts[i1].y - pts[i0].y) * u,
  };
}

/**
 * Dense polyline path slice between arc lengths d0..d1 (inclusive endpoints).
 * Keeps all intermediate vertices so gradient color bands follow the mouse path.
 */
function polylineSlice(
  pts: Point2D[],
  cum: number[],
  total: number,
  d0: number,
  d1: number,
): string {
  const a = Math.min(d0, d1);
  const b = Math.max(d0, d1);
  const start = pointAtArc(pts, cum, total, a);
  const end = pointAtArc(pts, cum, total, b);
  const parts: string[] = [`M ${start.x} ${start.y}`];
  for (let i = 1; i < pts.length - 1; i++) {
    if (cum[i] > a && cum[i] < b) {
      parts.push(`L ${pts[i].x} ${pts[i].y}`);
    }
  }
  parts.push(`L ${end.x} ${end.y}`);
  return parts.join(' ');
}

/** Colored path segments so stroke gradient follows freehand arc length. */
export function freehandStrokeSegments(
  params: FreehandParams,
  style: StyleProps,
): { d: string; color: string }[] | null {
  if (style.strokeMode !== 'gradient') return null;
  const pts = params.points;
  if (pts.length < 2) return null;

  const g = style.strokeGradient;
  const palette =
    g?.stops && g.stops.length >= 2
      ? g.stops
      : [g?.from ?? style.stroke, g?.to ?? style.strokeEnd ?? style.stroke];
  const stepped = !!g?.stepped;
  const n = stepped
    ? Math.max(2, Math.round(g?.steps ?? 8))
    : Math.min(64, Math.max(12, pts.length - 1));

  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    cum.push(cum[i - 1] + Math.hypot(dx, dy));
  }
  const total = cum[cum.length - 1];
  if (total < 1e-6) return null;

  const out: { d: string; color: string }[] = [];
  for (let i = 0; i < n; i++) {
    const d0 = (i / n) * total;
    const d1 = ((i + 1) / n) * total;
    const color = colorAt(i, n, stepped ? 'stepped' : 'gradient', palette[0], palette[palette.length - 1], palette, stepped, n);
    out.push({ d: polylineSlice(pts, cum, total, d0, d1), color });
  }
  return out;
}

export function trianglePoints(params: TriangleParams): string {
  return params.points.map((p) => `${p.x},${p.y}`).join(' ');
}

export function polygonPoints(params: PolygonParams): string {
  return params.points.map((p) => `${p.x},${p.y}`).join(' ');
}

export function regularPolyPointsAttr(params: RegularPolygonParams, sides: number): string {
  return regularPolygonPoints(params.cx, params.cy, params.radius, sides, params.rotation)
    .map((p) => `${p.x},${p.y}`)
    .join(' ');
}

export function starPointsAttr(params: StarParams): string {
  const inner = (params.innerRatio ?? 0.45) * params.radius;
  return starPolygonPoints(
    params.cx,
    params.cy,
    params.radius,
    inner,
    params.points,
    params.rotation,
  )
    .map((p) => `${p.x},${p.y}`)
    .join(' ');
}

export function heartPathAttr(params: HeartParams): string {
  return heartPath(params.x, params.y, params.width, params.height);
}

export interface RainbowBand {
  d: string;
  color: string;
  width: number;
}

function lerpHex(a: string, b: string, t: number): string {
  const parse = (h: string) => {
    const s = h.replace('#', '');
    return [
      parseInt(s.slice(0, 2), 16),
      parseInt(s.slice(2, 4), 16),
      parseInt(s.slice(4, 6), 16),
    ] as const;
  };
  const ca = parse(a);
  const cb = parse(b);
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
  return `#${[r, g, bl].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

function rainbowArcPath(
  cx: number,
  cy: number,
  r: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string {
  if (r < 0.5) return '';
  // Semicircle from p1 to p2 (sweep=1). large-arc=0 → 180° or less.
  return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
}

/**
 * Build stroke bands for a rainbow semicircle.
 * Stripes = discrete classic colors; gradient = many lerped bands.
 */
export function rainbowBands(params: RainbowParams): RainbowBand[] {
  const dx = params.x2 - params.x1;
  const dy = params.y2 - params.y1;
  const dist = Math.hypot(dx, dy);
  if (dist < 2) return [];

  const cx = (params.x1 + params.x2) / 2;
  const cy = (params.y1 + params.y2) / 2;
  const outerR = dist / 2;
  const bandW = Math.max(4, params.bandWidth);
  const innerR = Math.max(1, outerR - bandW);

  const colors =
    params.mode === 'stripes'
      ? [...RAINBOW_COLORS]
      : (() => {
          const steps = 36;
          const out: string[] = [];
          const n = RAINBOW_COLORS.length;
          for (let i = 0; i < steps; i++) {
            const u = i / Math.max(1, steps - 1);
            const f = u * (n - 1);
            const i0 = Math.floor(f);
            const i1 = Math.min(n - 1, i0 + 1);
            out.push(lerpHex(RAINBOW_COLORS[i0], RAINBOW_COLORS[i1], f - i0));
          }
          return out;
        })();

  const count = colors.length;
  const slice = (outerR - innerR) / count;
  const bands: RainbowBand[] = [];

  for (let i = 0; i < count; i++) {
    // Outer red → inner violet
    const r = outerR - (i + 0.5) * slice;
    if (r < 1) continue;
    // Scale endpoints onto this radius circle
    const ux = (params.x1 - cx) / outerR;
    const uy = (params.y1 - cy) / outerR;
    const vx = (params.x2 - cx) / outerR;
    const vy = (params.y2 - cy) / outerR;
    const ax = cx + ux * r;
    const ay = cy + uy * r;
    const bx = cx + vx * r;
    const by = cy + vy * r;
    const d = rainbowArcPath(cx, cy, r, ax, ay, bx, by);
    if (!d) continue;
    bands.push({
      d,
      color: colors[i],
      width: Math.max(1.2, slice * (params.mode === 'gradient' ? 1.15 : 1.05)),
    });
  }
  return bands;
}

export function transformAttr(
  t: Shape['transform'],
  pivot: { x: number; y: number } = { x: 0, y: 0 },
): string {
  const { x: cx, y: cy } = pivot;
  // Rotate/scale around shape center (pivot), then translate
  return `translate(${t.x} ${t.y}) translate(${cx} ${cy}) rotate(${t.rotation}) scale(${t.scaleX} ${t.scaleY}) translate(${-cx} ${-cy})`;
}

/** Local bounds center used as rotation/scale pivot. */
export function shapePivot(shape: Shape): { x: number; y: number } {
  const b = boundsForShape(shape);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

/** Map local point through transform with center pivot. */
export function localToWorldPoint(
  p: Point2D,
  t: Shape['transform'],
  pivot: { x: number; y: number },
): Point2D {
  const lx = (p.x - pivot.x) * t.scaleX;
  const ly = (p.y - pivot.y) * t.scaleY;
  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: t.x + pivot.x + lx * cos - ly * sin,
    y: t.y + pivot.y + lx * sin + ly * cos,
  };
}

/** Resolve palette mode for multi-primitive generators. */
export function effectPaletteMode(style: StyleProps): PaletteMode {
  if (style.fillMode === 'gradient') {
    return style.fillGradient?.stepped ? 'stepped' : 'gradient';
  }
  if (style.strokeMode === 'gradient') {
    return style.strokeGradient?.stepped ? 'stepped' : 'gradient';
  }
  return 'solid';
}

export function effectPaletteColors(style: StyleProps): {
  from: string;
  to: string;
  stops?: string[];
  stepped?: boolean;
  steps?: number;
} {
  if (style.fillMode === 'gradient' && style.fillGradient) {
    return {
      from: style.fillGradient.from,
      to: style.fillGradient.to,
      stops: style.fillGradient.stops,
      stepped: style.fillGradient.stepped,
      steps: style.fillGradient.steps,
    };
  }
  if (style.strokeGradient) {
    return {
      from: style.strokeGradient.from,
      to: style.strokeGradient.to,
      stops: style.strokeGradient.stops,
      stepped: style.strokeGradient.stepped,
      steps: style.strokeGradient.steps,
    };
  }
  return {
    from: style.stroke,
    to: style.strokeEnd ?? style.stroke,
  };
}

export function circlesUseFill(style: StyleProps): boolean {
  return style.fillMode === 'solid' || style.fillMode === 'gradient';
}

/** Stroke color for line i of n (insertion order), matching MultiStar palette rules. */
export function lineColorAt(style: StyleProps, i: number, n: number): string {
  const mode = effectPaletteMode(style);
  const { from, to, stops, stepped, steps } = effectPaletteColors(style);
  const palFrom = mode === 'solid' ? style.stroke : from;
  const palTo = mode === 'solid' ? style.stroke : to;
  return colorAt(i, Math.max(1, n), mode, palFrom, palTo, stops, stepped, steps);
}

export function shapePrimitives(shape: Shape): GenPrimitive[] {
  const stroke = shape.style.stroke;
  const end = shape.style.strokeEnd ?? stroke;
  const mode = effectPaletteMode(shape.style);
  const pal = effectPaletteColors(shape.style);
  const palFrom = mode === 'solid' ? stroke : pal.from;
  const palTo = mode === 'solid' ? stroke : pal.to;
  const palExtra = {
    stops: pal.stops,
    stepped: pal.stepped,
    steps: pal.steps,
  };

  switch (shape.type) {
    case 'octopus': {
      const p = shape.params as OctopusParams;
      return generateOctopus(
        p.arms,
        p.circles,
        p.curve,
        p.radiusX,
        p.radiusY,
        p.startAngle,
        palFrom,
        palTo,
        mode,
        palExtra,
      );
    }
    case 'multiStar': {
      const p = shape.params as MultiStarParams;
      return generateMultiStar(
        p.arms,
        p.radius,
        p.stages,
        p.step,
        p.mode,
        p.startAngle,
        palFrom,
        palTo,
        mode,
        palExtra,
      );
    }
    case 'randomStar': {
      const p = shape.params as RandomStarParams;
      return generateRandomStar(p.arms, p.radius, p.seed, palFrom, palTo, mode, palExtra);
    }
    case 'circleLine': {
      const p = shape.params as CircleLineParams;
      return generateCircleLine(p.arms, p.radius, p.startAngle, palFrom, palTo, mode, palExtra);
    }
    case 'circles': {
      const p = shape.params as CirclesParams;
      const filled = circlesUseFill(shape.style);
      const cFrom = filled && mode === 'solid' ? shape.style.fill || stroke : palFrom;
      const cTo = filled && mode === 'solid' ? shape.style.fill || stroke : palTo;
      return generateCircles(
        p.mode,
        p.count,
        p.sizeMultiply,
        p.offset,
        p.width,
        p.height,
        p.startAngle,
        cFrom,
        cTo,
        mode,
        filled,
        palExtra,
      );
    }
    case 'gradientCircle': {
      const p = shape.params as GradientCircleParams;
      return generateGradientCircle(-p.rx, -p.ry, p.rx * 2, p.ry * 2, palFrom, palTo, mode, palExtra);
    }
    case 'gradient': {
      const p = shape.params as GradientParams;
      return [
        {
          kind: 'rect',
          x: p.x,
          y: p.y,
          width: p.width,
          height: p.height,
          fill: 'url(#grad-' + shape.id + ')',
          gradient: { start: stroke, end },
        },
      ];
    }
    default:
      return [];
  }
}

export function boundsForShape(shape: Shape): { x: number; y: number; w: number; h: number } {
  switch (shape.type) {
    case 'line': {
      const p = shape.params as LineParams;
      const x = Math.min(p.x1, p.x2);
      const y = Math.min(p.y1, p.y2);
      return { x, y, w: Math.abs(p.x2 - p.x1) || 1, h: Math.abs(p.y2 - p.y1) || 1 };
    }
    case 'rainbow': {
      const p = shape.params as RainbowParams;
      const cx = (p.x1 + p.x2) / 2;
      const cy = (p.y1 + p.y2) / 2;
      const r = Math.hypot(p.x2 - p.x1, p.y2 - p.y1) / 2 + (p.bandWidth || 0) / 2;
      return { x: cx - r, y: cy - r, w: r * 2 || 1, h: r * 2 || 1 };
    }
    case 'rect':
    case 'gradient':
    case 'heart': {
      const p = shape.params as RectParams | GradientParams | HeartParams;
      return { x: p.x, y: p.y, w: p.width || 1, h: p.height || 1 };
    }
    case 'ellipse': {
      const p = shape.params as EllipseParams;
      return { x: p.cx - p.rx, y: p.cy - p.ry, w: p.rx * 2 || 1, h: p.ry * 2 || 1 };
    }
    case 'pentagon':
    case 'hexagon': {
      const p = shape.params as RegularPolygonParams;
      const r = p.radius || 1;
      return { x: p.cx - r, y: p.cy - r, w: r * 2, h: r * 2 };
    }
    case 'star': {
      const p = shape.params as StarParams;
      const r = p.radius || 1;
      return { x: p.cx - r, y: p.cy - r, w: r * 2, h: r * 2 };
    }
    case 'triangle': {
      const pts = (shape.params as TriangleParams).points;
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x || 1, h: Math.max(...ys) - y || 1 };
    }
    case 'polygon': {
      const pts = (shape.params as PolygonParams).points;
      if (!pts.length) return { x: 0, y: 0, w: 1, h: 1 };
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x || 1, h: Math.max(...ys) - y || 1 };
    }
    case 'freehand': {
      const pts = (shape.params as FreehandParams).points;
      if (!pts.length) return { x: 0, y: 0, w: 1, h: 1 };
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x || 1, h: Math.max(...ys) - y || 1 };
    }
    case 'centerLines': {
      const rays = (shape.params as CenterLinesParams).rays;
      let max = 40;
      for (const r of rays) max = Math.max(max, Math.hypot(r.x, r.y));
      return { x: -max, y: -max, w: max * 2, h: max * 2 };
    }
    case 'gradientCircle': {
      const p = shape.params as GradientCircleParams;
      return { x: -p.rx, y: -p.ry, w: p.rx * 2 || 1, h: p.ry * 2 || 1 };
    }
    case 'octopus': {
      const p = shape.params as OctopusParams;
      const r = Math.max(p.radiusX, p.radiusY) * (2 + p.circles * 0.15);
      return { x: -r, y: -r, w: r * 2, h: r * 2 };
    }
    case 'multiStar': {
      const p = shape.params as MultiStarParams;
      const r = p.radius + p.stages * p.step;
      return { x: -r, y: -r, w: r * 2, h: r * 2 };
    }
    case 'randomStar':
    case 'circleLine': {
      const p = shape.params as RandomStarParams | CircleLineParams;
      return { x: -p.radius, y: -p.radius, w: p.radius * 2, h: p.radius * 2 };
    }
    case 'circles': {
      const p = shape.params as CirclesParams;
      const r = p.count * p.width * Math.max(p.offset, 0.1) + p.width * 4;
      return { x: -r, y: -r, w: r * 2, h: r * 2 };
    }
    case 'sunflower': {
      const p = shape.params as SunflowerParams;
      const r = p.radius || 1;
      return { x: -r, y: -r, w: r * 2, h: r * 2 };
    }
    case 'firework': {
      const p = shape.params as FireworkParams;
      const fountain = p.variant === 'fountain';
      const r = (p.radius || 1) * (1.25 + Math.abs(p.wind || 0) * 0.45);
      // Fountain sprays mostly upward (−y)
      if (fountain) {
        return { x: -r * 0.55, y: -r * 1.15, w: r * 1.1, h: r * 1.35 };
      }
      return { x: -r, y: -r, w: r * 2, h: r * 2 };
    }
    case 'importedVector': {
      const p = shape.params as ImportedVectorParams;
      return { x: 0, y: 0, w: p.width || 1, h: p.height || 1 };
    }
    case 'vectorPath': {
      const p = shape.params as VectorPathParams;
      return { x: 0, y: 0, w: p.width || 1, h: p.height || 1 };
    }
    case 'group': {
      const children = (shape.params as GroupParams).children;
      if (!children.length) return { x: 0, y: 0, w: 1, h: 1 };
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const c of children) {
        const b = boundsForShape(c);
        const x = c.transform.x + b.x * c.transform.scaleX;
        const y = c.transform.y + b.y * c.transform.scaleY;
        const w = Math.abs(b.w * c.transform.scaleX);
        const h = Math.abs(b.h * c.transform.scaleY);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + w);
        maxY = Math.max(maxY, y + h);
      }
      return {
        x: minX,
        y: minY,
        w: Math.max(1, maxX - minX),
        h: Math.max(1, maxY - minY),
      };
    }
    default:
      return { x: -50, y: -50, w: 100, h: 100 };
  }
}

/** Axis-aligned world bounds of a shape including transform. */
export function worldBoundsForShape(shape: Shape): { x: number; y: number; w: number; h: number } {
  const b = boundsForShape(shape);
  const t = shape.transform;
  const pivot = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const pad = (shape.style.strokeWidth || 0) / 2;
  const corners: Point2D[] = [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of corners) {
    const w = localToWorldPoint(c, t, pivot);
    minX = Math.min(minX, w.x);
    minY = Math.min(minY, w.y);
    maxX = Math.max(maxX, w.x);
    maxY = Math.max(maxY, w.y);
  }
  return {
    x: minX - pad,
    y: minY - pad,
    w: Math.max(1, maxX - minX + pad * 2),
    h: Math.max(1, maxY - minY + pad * 2),
  };
}

export function contentBounds(
  shapes: Shape[],
  padding = 24,
): { x: number; y: number; w: number; h: number } {
  if (!shapes.length) {
    return { x: 0, y: 0, w: 800, h: 600 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of shapes) {
    const b = worldBoundsForShape(s);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return {
    x: minX - padding,
    y: minY - padding,
    w: Math.max(1, maxX - minX + padding * 2),
    h: Math.max(1, maxY - minY + padding * 2),
  };
}
