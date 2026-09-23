export type ToolId =
  | 'select'
  | 'freehand'
  | 'line'
  | 'rect'
  | 'ellipse'
  | 'triangle'
  | 'centerLines'
  | 'gradient'
  | 'gradientCircle'
  | 'octopus'
  | 'multiStar'
  | 'randomStar'
  | 'circleLine'
  | 'circles';

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

export interface FillGradient {
  angle: number;
  from: string;
  to: string;
}

export interface StyleProps {
  stroke: string;
  fill: string;
  strokeWidth: number;
  /** 0–1 overall shape transparency */
  opacity: number;
  strokeEnd?: string;
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
  | PolygonParams
  | CenterLinesParams
  | GradientParams
  | GradientCircleParams
  | OctopusParams
  | MultiStarParams
  | RandomStarParams
  | CircleLineParams
  | CirclesParams
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
  return { stroke, fill, strokeWidth, opacity, strokeEnd };
}

export function newShapeId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
