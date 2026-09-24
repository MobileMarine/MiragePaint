import {
  CenterLinesParams,
  FreehandParams,
  GroupParams,
  ImportedVectorParams,
  Shape,
  SunflowerParams,
} from '../models/shape';
import { evaluateFirework } from '../generators/firework';
import {
  freehandStrokeSegments,
  rainbowBands,
  shapePrimitives,
  sunflowerLayout,
  effectPaletteColors,
  effectPaletteMode,
} from './geometry';

/** Traffic-light thresholds for layer complexity chips. */
export const COMPLEXITY_GREEN_MAX = 20;
export const COMPLEXITY_YELLOW_MAX = 200;

export type ComplexityLevel = 'low' | 'mid' | 'high';

export function complexityLevel(count: number): ComplexityLevel {
  if (count <= COMPLEXITY_GREEN_MAX) return 'low';
  if (count <= COMPLEXITY_YELLOW_MAX) return 'mid';
  return 'high';
}

/**
 * Count visible geometry pieces roughly matching shape-layer SVG output
 * (excluding defs / filters).
 */
export function shapeComplexityCount(shape: Shape): number {
  switch (shape.type) {
    case 'line':
    case 'rect':
    case 'ellipse':
    case 'triangle':
    case 'heart':
    case 'pentagon':
    case 'hexagon':
    case 'star':
    case 'polygon':
    case 'vectorPath':
    case 'gradient':
    case 'gradientCircle':
      return 1;

    case 'freehand': {
      const segs = freehandStrokeSegments(shape.params as FreehandParams, shape.style);
      if (segs?.length) return segs.length;
      return Math.max(1, (shape.params as FreehandParams).points.length);
    }

    case 'centerLines':
      return Math.max(0, (shape.params as CenterLinesParams).rays.length);

    case 'octopus':
    case 'multiStar':
    case 'randomStar':
    case 'circleLine':
    case 'circles':
      return Math.max(0, shapePrimitives(shape).length);

    case 'sunflower': {
      const p = shape.params as SunflowerParams;
      const mode = effectPaletteMode(shape.style);
      const pal = effectPaletteColors(shape.style);
      const palFrom = mode === 'solid' ? shape.style.stroke : pal.from;
      const palTo = mode === 'solid' ? shape.style.stroke : pal.to;
      const layout = sunflowerLayout(
        p.petals,
        p.radius,
        p.seedRings,
        p.startAngle,
        palFrom,
        palTo,
        mode,
        { stops: pal.stops, stepped: pal.stepped, steps: pal.steps },
      );
      return layout.petals.length + layout.seeds.length;
    }

    case 'firework': {
      const frame = evaluateFirework(shape.params as Parameters<typeof evaluateFirework>[0], 1);
      return (frame.streaks?.length ?? 0) + (frame.sparks?.length ?? 0);
    }

    case 'rainbow':
      return Math.max(0, rainbowBands(shape.params as Parameters<typeof rainbowBands>[0]).length);

    case 'importedVector':
      return Math.max(0, (shape.params as ImportedVectorParams).paths.length);

    case 'group': {
      const children = (shape.params as GroupParams).children ?? [];
      return children.reduce((sum, c) => sum + shapeComplexityCount(c), 0);
    }

    default:
      return 1;
  }
}
