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
  RandomStarParams,
  PolygonParams,
  RainbowParams,
  RectParams,
  RegularPolygonParams,
  Shape,
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
  sunflowerLayout,
  GenPrimitive,
} from '../generators/shapes';
import { colorAt, PaletteMode, RAINBOW_COLORS } from '../style/presets';

export { RAINBOW_COLORS, heartPath, regularPolygonPoints, sunflowerLayout };

export function freehandPath(params: FreehandParams): string {
  if (!params.points.length) return '';
  const [first, ...rest] = params.points;
  return `M ${first.x} ${first.y} ` + rest.map((p) => `L ${p.x} ${p.y}`).join(' ');
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

export function transformAttr(t: Shape['transform']): string {
  return `translate(${t.x} ${t.y}) rotate(${t.rotation}) scale(${t.scaleX} ${t.scaleY})`;
}

/** Resolve palette mode for multi-primitive generators. */
export function effectPaletteMode(style: StyleProps): PaletteMode {
  const fm = style.fillMode;
  if (fm === 'rainbowGradient' || fm === 'rainbowStripes' || fm === 'gradient') return fm;
  if (style.strokeMode === 'gradient') return 'gradient';
  return 'solid';
}

export function effectPaletteColors(style: StyleProps): { from: string; to: string } {
  if (style.fillMode === 'gradient' && style.fillGradient) {
    return { from: style.fillGradient.from, to: style.fillGradient.to };
  }
  return {
    from: style.stroke,
    to: style.strokeEnd ?? style.stroke,
  };
}

export function circlesUseFill(style: StyleProps): boolean {
  const fm = style.fillMode;
  return fm === 'solid' || fm === 'gradient' || fm === 'rainbowGradient' || fm === 'rainbowStripes';
}

/** Stroke color for line i of n (insertion order), matching MultiStar palette rules. */
export function lineColorAt(style: StyleProps, i: number, n: number): string {
  const mode = effectPaletteMode(style);
  const { from, to } = effectPaletteColors(style);
  const palFrom = mode === 'solid' ? style.stroke : from;
  const palTo = mode === 'solid' ? style.stroke : to;
  return colorAt(i, Math.max(1, n), mode, palFrom, palTo);
}

export function shapePrimitives(shape: Shape): GenPrimitive[] {
  const stroke = shape.style.stroke;
  const end = shape.style.strokeEnd ?? stroke;
  const mode = effectPaletteMode(shape.style);
  const { from, to } = effectPaletteColors(shape.style);
  const palFrom = mode === 'solid' ? stroke : from;
  const palTo = mode === 'solid' ? stroke : to;

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
      );
    }
    case 'randomStar': {
      const p = shape.params as RandomStarParams;
      return generateRandomStar(p.arms, p.radius, p.seed, palFrom, palTo, mode);
    }
    case 'circleLine': {
      const p = shape.params as CircleLineParams;
      return generateCircleLine(p.arms, p.radius, p.startAngle, palFrom, palTo, mode);
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
      );
    }
    case 'gradientCircle': {
      const p = shape.params as GradientCircleParams;
      return generateGradientCircle(-p.rx, -p.ry, p.rx * 2, p.ry * 2, palFrom, palTo, mode);
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
      const r = (p.radius || 1) * (1.15 + Math.abs(p.wind || 0) * 0.4);
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

/** Axis-aligned world bounds of a shape including transform (approx., ignores rotation). */
export function worldBoundsForShape(shape: Shape): { x: number; y: number; w: number; h: number } {
  const b = boundsForShape(shape);
  const t = shape.transform;
  const pad = (shape.style.strokeWidth || 0) / 2;
  const x = t.x + b.x * t.scaleX - pad;
  const y = t.y + b.y * t.scaleY - pad;
  const w = Math.abs(b.w * t.scaleX) + pad * 2;
  const h = Math.abs(b.h * t.scaleY) + pad * 2;

  if (!t.rotation) return { x, y, w: Math.max(1, w), h: Math.max(1, h) };

  // Expand to cover rotated AABB
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const rw = w * cos + h * sin;
  const rh = w * sin + h * cos;
  return { x: cx - rw / 2, y: cy - rh / 2, w: Math.max(1, rw), h: Math.max(1, rh) };
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
