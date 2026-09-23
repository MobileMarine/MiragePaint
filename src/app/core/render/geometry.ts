import {
  CenterLinesParams,
  CirclesParams,
  CircleLineParams,
  EllipseParams,
  FreehandParams,
  GradientCircleParams,
  GradientParams,
  ImportedVectorParams,
  LineParams,
  MultiStarParams,
  OctopusParams,
  RandomStarParams,
  PolygonParams,
  RectParams,
  Shape,
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
  GenPrimitive,
} from '../generators/shapes';

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

export function transformAttr(t: Shape['transform']): string {
  return `translate(${t.x} ${t.y}) rotate(${t.rotation}) scale(${t.scaleX} ${t.scaleY})`;
}

export function shapePrimitives(shape: Shape): GenPrimitive[] {
  const stroke = shape.style.stroke;
  const end = shape.style.strokeEnd ?? stroke;

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
        stroke,
        end,
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
        stroke,
        end,
      );
    }
    case 'randomStar': {
      const p = shape.params as RandomStarParams;
      return generateRandomStar(p.arms, p.radius, p.seed, stroke);
    }
    case 'circleLine': {
      const p = shape.params as CircleLineParams;
      return generateCircleLine(p.arms, p.radius, p.startAngle, stroke);
    }
    case 'circles': {
      const p = shape.params as CirclesParams;
      return generateCircles(
        p.mode,
        p.count,
        p.sizeMultiply,
        p.offset,
        p.width,
        p.height,
        p.startAngle,
        stroke,
        end,
      );
    }
    case 'gradientCircle': {
      const p = shape.params as GradientCircleParams;
      return generateGradientCircle(-p.rx, -p.ry, p.rx * 2, p.ry * 2, stroke, end);
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
    case 'rect':
    case 'gradient': {
      const p = shape.params as RectParams | GradientParams;
      return { x: p.x, y: p.y, w: p.width || 1, h: p.height || 1 };
    }
    case 'ellipse': {
      const p = shape.params as EllipseParams;
      return { x: p.cx - p.rx, y: p.cy - p.ry, w: p.rx * 2 || 1, h: p.ry * 2 || 1 };
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
