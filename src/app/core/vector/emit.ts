import {
  EllipseParams,
  FreehandParams,
  GroupParams,
  LineParams,
  Point2D,
  PolygonParams,
  RectParams,
  Shape,
  TriangleParams,
  createStyle,
  createTransform,
  newShapeId,
} from '../models/shape';
import { PrimitiveFit } from './fit';
import { RegionColor } from './gradient';
import { freehandStrokeSegments, shapePivot, transformAttr } from '../render/geometry';
import { buildStopsFromGradient } from '../style/presets';

export interface FittedRegion {
  fit: PrimitiveFit;
  area: number;
  color: RegionColor;
}

/**
 * Convert fitted primitives (already sorted by area desc) into native MiragePaint
 * shapes inside a single group at the origin covering [0,width]×[0,height].
 */
export function emitShapeGroup(
  fitted: FittedRegion[],
  width: number,
  height: number,
): { group: Shape; children: Shape[] } {
  const children: Shape[] = [];

  for (const item of fitted) {
    const shape = fitToShape(item.fit, item.color);
    if (shape) children.push(shape);
  }

  const group: Shape = {
    id: newShapeId(),
    type: 'group',
    style: createStyle('none', 'none', 0, 1),
    transform: createTransform(0, 0),
    params: { children } satisfies GroupParams,
  };

  return { group, children };
}

function fitToShape(fit: PrimitiveFit, color: RegionColor): Shape | null {
  const fill = color.gradient ? color.gradient.from : color.fill;
  const style = createStyle('none', fill, 0, 1);
  if (color.gradient) {
    style.fillMode = 'gradient';
    style.fillGradient = color.gradient;
  }

  switch (fit.kind) {
    case 'circle':
    case 'ellipse': {
      const cx = fit.cx ?? 0;
      const cy = fit.cy ?? 0;
      const rx = fit.rx ?? 1;
      const ry = fit.ry ?? rx;
      const rotation = fit.rotation ?? 0;
      return {
        id: newShapeId(),
        type: 'ellipse',
        style,
        transform: {
          x: cx,
          y: cy,
          rotation,
          scaleX: 1,
          scaleY: 1,
        },
        params: { cx: 0, cy: 0, rx, ry } satisfies EllipseParams,
      };
    }
    case 'rect': {
      const w = fit.width ?? 1;
      const h = fit.height ?? 1;
      const rotation = fit.rotation ?? 0;
      if (rotation && Math.abs(rotation) > 0.5) {
        // Rotated rect: place at center, local rect centered
        const cx = fit.cx ?? (fit.x ?? 0) + w / 2;
        const cy = fit.cy ?? (fit.y ?? 0) + h / 2;
        return {
          id: newShapeId(),
          type: 'rect',
          style,
          transform: {
            x: cx,
            y: cy,
            rotation,
            scaleX: 1,
            scaleY: 1,
          },
          params: { x: -w / 2, y: -h / 2, width: w, height: h } satisfies RectParams,
        };
      }
      return {
        id: newShapeId(),
        type: 'rect',
        style,
        transform: createTransform(0, 0),
        params: {
          x: fit.x ?? 0,
          y: fit.y ?? 0,
          width: w,
          height: h,
        } satisfies RectParams,
      };
    }
    case 'line': {
      const sw = fit.strokeWidth ?? 2;
      const stroke = color.fill;
      return {
        id: newShapeId(),
        type: 'line',
        style: createStyle(stroke, 'none', sw, 1),
        transform: createTransform(0, 0),
        params: {
          x1: fit.x1 ?? 0,
          y1: fit.y1 ?? 0,
          x2: fit.x2 ?? 0,
          y2: fit.y2 ?? 0,
        } satisfies LineParams,
      };
    }
    case 'triangle': {
      const pts = fit.points as [Point2D, Point2D, Point2D] | undefined;
      if (!pts || pts.length < 3) return null;
      return {
        id: newShapeId(),
        type: 'triangle',
        style,
        transform: createTransform(0, 0),
        params: { points: [pts[0], pts[1], pts[2]] } satisfies TriangleParams,
      };
    }
    case 'polygon': {
      const pts = fit.points;
      if (!pts || pts.length < 3) return null;
      return {
        id: newShapeId(),
        type: 'polygon',
        style,
        transform: createTransform(0, 0),
        params: { points: pts.map((p) => ({ x: p.x, y: p.y })), closed: true } satisfies PolygonParams,
      };
    }
    default:
      return null;
  }
}

/** Serialize shapes to a standalone SVG string for preview. */
export function shapesToSvg(
  shapes: Shape[],
  width: number,
  height: number,
  outlinesOnly = false,
): string {
  const defs: string[] = [];
  const body = shapes.map((s, i) => shapeToSvgFragment(s, i, defs, outlinesOnly)).join('');
  const defsBlock = defs.length ? `<defs>${defs.join('')}</defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet">${defsBlock}${body}</svg>`;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function shapeToSvgFragment(
  shape: Shape,
  idx: number,
  defs: string[],
  outlinesOnly: boolean,
): string {
  const t = shape.transform;
  const hasTf =
    t.x || t.y || t.rotation || t.scaleX !== 1 || t.scaleY !== 1;
  const tf = hasTf ? ` transform="${transformAttr(t, shapePivot(shape))}"` : '';
  const op = shape.style.opacity ?? 1;
  const opAttr = op < 1 ? ` opacity="${op}"` : '';

  let fill = shape.style.fill;
  const fillMode = shape.style.fillMode;
  if (shape.style.fillGradient && !outlinesOnly && fillMode === 'gradient') {
    const id = `fg${idx}`;
    const g = shape.style.fillGradient;
    const rad = (g.angle * Math.PI) / 180;
    const x1 = 50 - Math.cos(rad) * 50;
    const y1 = 50 - Math.sin(rad) * 50;
    const x2 = 50 + Math.cos(rad) * 50;
    const y2 = 50 + Math.sin(rad) * 50;
    const stops = buildStopsFromGradient(g);
    const stopXml = stops
      .map((s) => `<stop offset="${s.offset}" stop-color="${escapeAttr(s.color)}"/>`)
      .join('');
    defs.push(
      `<linearGradient id="${id}" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">${stopXml}</linearGradient>`,
    );
    fill = `url(#${id})`;
  }

  let stroke = shape.style.stroke;
  if (shape.style.strokeMode === 'gradient' && !outlinesOnly) {
    if (shape.type === 'freehand') {
      // Segments drawn in renderGeom — skip planar gradient def
      stroke = shape.style.stroke;
    } else {
      const id = `sg${idx}`;
      const g = shape.style.strokeGradient ?? {
        angle: shape.style.strokeAngle ?? 0,
        from: shape.style.stroke,
        to: shape.style.strokeEnd ?? shape.style.stroke,
      };
      const stops = buildStopsFromGradient(g);
      const stopXml = stops
        .map((s) => `<stop offset="${s.offset}" stop-color="${escapeAttr(s.color)}"/>`)
        .join('');
      if (shape.type === 'line') {
        const p = shape.params as LineParams;
        defs.push(
          `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}">${stopXml}</linearGradient>`,
        );
      } else {
        const rad = (g.angle * Math.PI) / 180;
        const x1 = 50 - Math.cos(rad) * 50;
        const y1 = 50 - Math.sin(rad) * 50;
        const x2 = 50 + Math.cos(rad) * 50;
        const y2 = 50 + Math.sin(rad) * 50;
        defs.push(
          `<linearGradient id="${id}" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">${stopXml}</linearGradient>`,
        );
      }
      stroke = `url(#${id})`;
    }
  }

  if (shape.style.strokeGlow && !outlinesOnly) {
    const glow = shape.style.strokeGlow;
    const fid = `glow${idx}`;
    defs.push(
      `<filter id="${fid}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">` +
        `<feGaussianBlur in="SourceGraphic" stdDeviation="${(glow.width / 3).toFixed(2)}" result="blur"/>` +
        `<feFlood flood-color="${escapeAttr(glow.color)}" flood-opacity="${glow.opacity}" result="color"/>` +
        `<feComposite in="color" in2="blur" operator="in" result="glow"/>` +
        `<feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`,
    );
  }

  if (fillMode === 'none') fill = 'none';
  if (fillMode === 'solid') fill = shape.style.fill;
  if (shape.style.strokeMode === 'none') stroke = 'none';

  if (outlinesOnly) {
    const outlineStroke =
      shape.style.stroke && shape.style.stroke !== 'none'
        ? shape.style.stroke
        : fill && fill !== 'none' && !fill.startsWith('url')
          ? fill
          : shape.style.fillGradient?.from ?? '#1a1a1a';
    fill = 'none';
    const sw = Math.max(1, shape.style.strokeWidth || 1.25);
    return wrap(renderGeom(shape, 'none', outlineStroke, sw), tf, opAttr);
  }

  const sw = shape.style.strokeWidth;
  const filterAttr = shape.style.strokeGlow ? ` filter="url(#glow${idx})"` : '';
  return wrap(renderGeom(shape, fill, stroke, sw), tf, opAttr + filterAttr);
}

function wrap(inner: string, tf: string, opAttr: string): string {
  if (!inner) return '';
  if (tf || opAttr) return `<g${tf}${opAttr}>${inner}</g>`;
  return inner;
}

function renderGeom(shape: Shape, fill: string, stroke: string, sw: number): string {
  const strokeAttr =
    stroke && stroke !== 'none' ? ` stroke="${escapeAttr(stroke)}" stroke-width="${sw}"` : '';
  const fillAttr = ` fill="${escapeAttr(fill)}"`;

  switch (shape.type) {
    case 'ellipse': {
      const p = shape.params as EllipseParams;
      return `<ellipse cx="${p.cx}" cy="${p.cy}" rx="${p.rx}" ry="${p.ry}"${fillAttr}${strokeAttr}/>`;
    }
    case 'rect': {
      const p = shape.params as RectParams;
      return `<rect x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}"${fillAttr}${strokeAttr}/>`;
    }
    case 'line': {
      const p = shape.params as LineParams;
      return `<line x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}" stroke="${escapeAttr(stroke || '#1a1a1a')}" stroke-width="${sw || 2}" stroke-linecap="round"/>`;
    }
    case 'freehand': {
      const segs = freehandStrokeSegments(shape.params as FreehandParams, shape.style);
      if (segs) {
        return segs
          .map(
            (s) =>
              `<path d="${escapeAttr(s.d)}" fill="none" stroke="${escapeAttr(s.color)}" stroke-width="${sw || 2}" stroke-linecap="round" stroke-linejoin="round"/>`,
          )
          .join('');
      }
      const pts = (shape.params as FreehandParams).points;
      if (pts.length < 2) return '';
      const d =
        `M ${pts[0].x} ${pts[0].y} ` + pts.slice(1).map((pt) => `L ${pt.x} ${pt.y}`).join(' ');
      return `<path d="${escapeAttr(d)}" fill="none" stroke="${escapeAttr(stroke || '#1a1a1a')}" stroke-width="${sw || 2}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    case 'triangle': {
      const pts = (shape.params as TriangleParams).points
        .map((pt) => `${pt.x},${pt.y}`)
        .join(' ');
      return `<polygon points="${pts}"${fillAttr}${strokeAttr}/>`;
    }
    case 'polygon': {
      const pts = (shape.params as PolygonParams).points.map((pt) => `${pt.x},${pt.y}`).join(' ');
      return `<polygon points="${pts}"${fillAttr}${strokeAttr}/>`;
    }
    case 'group': {
      const children = (shape.params as GroupParams).children;
      return children.map((c, i) => shapeToSvgFragment(c, i, [], false)).join('');
    }
    default:
      return '';
  }
}
