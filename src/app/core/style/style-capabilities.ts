import { ShapeType, ToolId } from '../models/shape';

export interface StyleCapabilities {
  stroke: boolean;
  fill: boolean;
}

const STROKE_ONLY = new Set<string>([
  'line',
  'freehand',
  'centerLines',
  'circleLine',
  'multiStar',
  'randomStar',
]);

const OWN_SCHEME = new Set<string>(['firework', 'rainbow']);

const FILL_AND_STROKE = new Set<string>([
  'rect',
  'ellipse',
  'triangle',
  'heart',
  'pentagon',
  'star',
  'polygon',
  'circles',
  'sunflower',
  'octopus',
  'gradient',
  'gradientCircle',
  'importedVector',
  'vectorPath',
  'group',
]);

/**
 * Whether Kante / Füllung UI and style channels apply for a tool or shape type.
 * `select` / null → both true (editor defaults).
 */
export function styleCapabilities(type: ShapeType | ToolId | null | undefined): StyleCapabilities {
  if (!type || type === 'select') {
    return { stroke: true, fill: true };
  }
  if (OWN_SCHEME.has(type)) {
    return { stroke: false, fill: false };
  }
  if (STROKE_ONLY.has(type)) {
    return { stroke: true, fill: false };
  }
  if (FILL_AND_STROKE.has(type)) {
    return { stroke: true, fill: true };
  }
  // Fallback: show both
  return { stroke: true, fill: true };
}

export function supportsStroke(type: ShapeType | ToolId | null | undefined): boolean {
  return styleCapabilities(type).stroke;
}

export function supportsFill(type: ShapeType | ToolId | null | undefined): boolean {
  return styleCapabilities(type).fill;
}
