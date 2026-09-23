export type ToolId =
  | 'select'
  | 'freehand'
  | 'line'
  | 'rect'
  | 'ellipse'
  | 'triangle'
  | 'heart'
  | 'pentagon'
  | 'hexagon'
  | 'centerLines'
  | 'gradient'
  | 'gradientCircle'
  | 'octopus'
  | 'multiStar'
  | 'randomStar'
  | 'circleLine'
  | 'circles'
  | 'sunflower'
  | 'firework'
  | 'rainbow';

export interface Point2D {
  x: number;
  y: number;
}

export interface Transform2D {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

export type FillMode =
  | 'none'
  | 'solid'
  | 'gradient'
  | 'rainbowGradient'
  | 'rainbowStripes'
  | 'neon'
  | 'random';
export type StrokeMode = 'none' | 'solid' | 'gradient';

export interface FillGradient {
  angle: number;
  from: string;
  to: string;
  presetId?: string;
  /** Multi-stop colors for neon / random (and similar) fills */
  stops?: string[];
}

export interface StyleProps {
  stroke: string;
  fill: string;
  strokeWidth: number;
  /** 0–1 overall shape transparency */
  opacity: number;
  strokeEnd?: string;
  strokeMode: StrokeMode;
  /** Verlaufswinkel Kante in Grad, 0 = links→rechts */
  strokeAngle?: number;
  fillMode: FillMode;
  /** Optional linear fill gradient (angle in degrees, 0 = left→right) */
  fillGradient?: FillGradient;
}

export interface FreehandParams {
  points: Point2D[];
}

export interface LineParams {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface RectParams {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EllipseParams {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface TriangleParams {
  points: [Point2D, Point2D, Point2D];
}

/** Axis-aligned heart bounding box. */
export interface HeartParams {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Regular n-gon centered at (cx, cy). */
export interface RegularPolygonParams {
  cx: number;
  cy: number;
  radius: number;
  /** Rotation in degrees */
  rotation: number;
}

export interface PolygonParams {
  points: Point2D[];
  closed: boolean;
}

export interface CenterLinesParams {
  cx: number;
  cy: number;
  rays: Point2D[];
}

export interface GradientParams {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GradientCircleParams {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface OctopusParams {
  arms: number;
  circles: number;
  curve: number;
  radiusX: number;
  radiusY: number;
  startAngle: number;
}

export interface MultiStarParams {
  arms: number;
  radius: number;
  stages: number;
  step: number;
  mode: 1 | 2 | 3 | 4;
  startAngle: number;
}

export interface RandomStarParams {
  arms: number;
  radius: number;
  seed: number;
}

export interface CircleLineParams {
  arms: number;
  radius: number;
  startAngle: number;
}

export interface CirclesParams {
  mode: 1 | 2 | 3;
  count: number;
  sizeMultiply: number;
  offset: number;
  width: number;
  height: number;
  startAngle: number;
}

export interface SunflowerParams {
  petals: number;
  radius: number;
  seedRings: number;
  startAngle: number;
}

export type FireworkVariant =
  | 'peony'
  | 'chrysanthemum'
  | 'willow'
  | 'palm'
  | 'cluster'
  | 'ring'
  | 'crossette'
  | 'fountain';

export type FireworkScheme =
  | 'neon'
  | 'random'
  | 'rainbow'
  | 'pinkLilac'
  | 'gold'
  | 'bluePink'
  | 'yellowRed'
  | 'purpleGreen'
  | 'whiteGold'
  | 'aquaMagenta';

export interface FireworkParams {
  seed: number;
  radius: number;
  wind: number;
  variant: FireworkVariant;
  scheme: FireworkScheme;
  bursts: number;
  /** @deprecated Unused — kept for older documents */
  smoke?: number;
  /** @deprecated Unused — kept for older documents */
  glow?: number;
  /** Transient 0..1 while animating draft; treated as 1 when omitted. */
  animT?: number;
}

/** Classic rainbow along a semicircle from (x1,y1) to (x2,y2). */
export type RainbowMode = 'gradient' | 'stripes';

export interface RainbowParams {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  mode: RainbowMode;
  /** Total thickness of the rainbow band */
  bandWidth: number;
}

export interface ImportedVectorPath {
  d: string;
  fill: string;
  gradient?: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    c1: string;
    c2: string;
  };
}

export interface ImportedVectorParams {
  paths: ImportedVectorPath[];
  width: number;
  height: number;
}

export interface VectorPathParams {
  d: string;
  fill: string;
  width: number;
  height: number;
  gradient?: ImportedVectorPath['gradient'];
}

export interface GroupParams {
  children: Shape[];
}

export type ShapeParams =
  | FreehandParams
  | LineParams
  | RectParams
  | EllipseParams
  | TriangleParams
  | HeartParams
  | RegularPolygonParams
  | PolygonParams
  | CenterLinesParams
  | GradientParams
  | GradientCircleParams
  | OctopusParams
  | MultiStarParams
  | RandomStarParams
  | CircleLineParams
  | CirclesParams
  | SunflowerParams
  | FireworkParams
  | RainbowParams
  | ImportedVectorParams
  | VectorPathParams
  | GroupParams;

/** Drawable tools plus import/group types (not toolbar tools). */
export type ShapeType =
  | Exclude<ToolId, 'select'>
  | 'importedVector'
  | 'vectorPath'
  | 'group'
  | 'polygon';

export type DrawableTool = Exclude<ToolId, 'select'>;

export interface Shape {
  id: string;
  type: ShapeType;
  style: StyleProps;
  transform: Transform2D;
  params: ShapeParams;
}

export interface DocumentMeta {
  name: string;
  /** Optional export background; empty = transparent */
  background: string;
}

export interface DrawingDocument {
  version: 1;
  meta: DocumentMeta;
  shapes: Shape[];
}

export function createTransform(x = 0, y = 0): Transform2D {
  return { x, y, rotation: 0, scaleX: 1, scaleY: 1 };
}

export function createStyle(
  stroke = '#1a1a1a',
  fill = 'none',
  strokeWidth = 2,
  opacity = 1,
  strokeEnd?: string,
): StyleProps {
  const fillNone = !fill || fill === 'none';
  const strokeNone = !stroke || stroke === 'none';
  return {
    stroke,
    fill,
    strokeWidth,
    opacity,
    strokeEnd,
    strokeMode: strokeNone ? 'none' : 'solid',
    strokeAngle: 0,
    fillMode: fillNone ? 'none' : 'solid',
  };
}

/** Normalize style from older documents / partial data. */
export function normalizeStyle(style: Partial<StyleProps> | undefined | null): StyleProps {
  const base = createStyle(
    style?.stroke ?? '#1a1a1a',
    style?.fill ?? 'none',
    style?.strokeWidth ?? 2,
    style?.opacity ?? 1,
    style?.strokeEnd,
  );
  if (!style) return base;

  const fillNone = !style.fill || style.fill === 'none';
  const strokeNone = !style.stroke || style.stroke === 'none';

  return {
    ...base,
    ...style,
    opacity: style.opacity ?? 1,
    strokeMode: style.strokeMode ?? (strokeNone ? 'none' : 'solid'),
    strokeAngle: style.strokeAngle ?? 0,
    fillMode:
      style.fillMode ??
      (style.fillGradient ? 'gradient' : fillNone ? 'none' : 'solid'),
    fillGradient: style.fillGradient
      ? {
          angle: style.fillGradient.angle ?? 0,
          from: style.fillGradient.from ?? style.fill ?? '#c45c26',
          to: style.fillGradient.to ?? style.strokeEnd ?? style.stroke ?? '#1a1a1a',
          presetId: style.fillGradient.presetId,
        }
      : undefined,
  };
}

export function newShapeId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
