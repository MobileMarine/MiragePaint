import {
  CenterLinesParams,
  CirclesParams,
  CircleLineParams,
  FireworkParams,
  MultiStarParams,
  RandomStarParams,
  Shape,
  SunflowerParams,
  ToolId,
} from '../models/shape';
import { fireworkTrailLimits } from '../generators/firework';

export type EffectParamsSlice = {
  circles?: { count: number };
  circleLine?: { arms: number };
  randomStar?: { arms: number };
  multiStar?: { stages: number };
  sunflower?: { petals: number };
  firework?: { trails?: number; variant?: string };
};

/**
 * Region count that locks gradient step bands for a shape or active tool.
 * Returns null when steps stay user-editable.
 */
export function regionStepCount(
  shape: Shape | null | undefined,
  tool?: ToolId,
  effectParams?: EffectParamsSlice,
  _fillPresetId?: string | null,
): number | null {
  // no fillPresetId lock — steps follow shape regions only
  if (shape) {
    switch (shape.type) {
      case 'circles':
        return Math.max(1, (shape.params as CirclesParams).count);
      case 'circleLine':
        return Math.max(1, (shape.params as CircleLineParams).arms);
      case 'randomStar':
        return Math.max(1, (shape.params as RandomStarParams).arms);
      case 'multiStar':
        return Math.max(1, (shape.params as MultiStarParams).stages);
      case 'sunflower':
        return Math.max(1, (shape.params as SunflowerParams).petals);
      case 'centerLines':
        return Math.max(1, (shape.params as CenterLinesParams).rays.length || 1);
      case 'firework': {
        const p = shape.params as FireworkParams;
        const limits = fireworkTrailLimits(p.variant);
        return Math.max(
          limits.min,
          Math.min(limits.max, Math.round(p.trails ?? limits.def)),
        );
      }
      default:
        break;
    }
  }

  if (tool && effectParams) {
    switch (tool) {
      case 'circles':
        return Math.max(1, effectParams.circles?.count ?? 1);
      case 'circleLine':
        return Math.max(1, effectParams.circleLine?.arms ?? 1);
      case 'randomStar':
        return Math.max(1, effectParams.randomStar?.arms ?? 1);
      case 'multiStar':
        return Math.max(1, effectParams.multiStar?.stages ?? 1);
      case 'sunflower':
        return Math.max(1, effectParams.sunflower?.petals ?? 1);
      case 'firework': {
        const variant = (effectParams.firework?.variant ?? 'chrysanthemum') as Parameters<
          typeof fireworkTrailLimits
        >[0];
        const limits = fireworkTrailLimits(variant);
        return Math.max(
          limits.min,
          Math.min(limits.max, Math.round(effectParams.firework?.trails ?? limits.def)),
        );
      }
      default:
        break;
    }
  }

  return null;
}
