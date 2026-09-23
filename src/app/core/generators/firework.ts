import { createRng, rotatePos } from '../math/polar';
import { FireworkParams, FireworkVariant } from '../models/shape';
import { pickFireworkColors } from '../style/firework-palettes';

export interface FwStreak {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  opacity: number;
}

export interface FwSpark {
  x: number;
  y: number;
  r: number;
  color: string;
  opacity: number;
}

export interface FwSmoke {
  x: number;
  y: number;
  rx: number;
  ry: number;
  opacity: number;
}

export interface FireworkFrame {
  streaks: FwStreak[];
  sparks: FwSpark[];
  smoke: FwSmoke[];
}

function easeOutCubic(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - u, 3);
}

function variantConfig(v: FireworkVariant): {
  rays: number;
  trail: number;
  clusterChance: number;
  ringBias: number;
  droop: number;
} {
  switch (v) {
    case 'peony':
      return { rays: 48, trail: 0.35, clusterChance: 0.15, ringBias: 0, droop: 0.05 };
    case 'chrysanthemum':
      return { rays: 64, trail: 0.7, clusterChance: 0.2, ringBias: 0, droop: 0.12 };
    case 'willow':
      return { rays: 40, trail: 1.1, clusterChance: 0.05, ringBias: 0, droop: 0.55 };
    case 'palm':
      return { rays: 28, trail: 0.9, clusterChance: 0.1, ringBias: 0, droop: 0.35 };
    case 'cluster':
      return { rays: 36, trail: 0.4, clusterChance: 0.85, ringBias: 0, droop: 0.08 };
    case 'ring':
      return { rays: 52, trail: 0.25, clusterChance: 0.05, ringBias: 0.85, droop: 0.02 };
    case 'crossette':
      return { rays: 32, trail: 0.45, clusterChance: 0.55, ringBias: 0, droop: 0.1 };
    default:
      return { rays: 48, trail: 0.4, clusterChance: 0.2, ringBias: 0, droop: 0.1 };
  }
}

/**
 * Evaluate firework at animation progress t (0..1). Peak freeze = t=1.
 * Local coords centered at origin (transform places the burst).
 */
export function evaluateFirework(params: FireworkParams, t = 1): FireworkFrame {
  const progress = easeOutCubic(t <= 0 ? 0 : t);
  const rng = createRng(params.seed);
  const cfg = variantConfig(params.variant);
  const { colors, trail } = pickFireworkColors(params.scheme, params.seed);
  const radius = Math.max(20, params.radius);
  const wind = Math.max(-1, Math.min(1, params.wind));
  const bursts = Math.max(1, Math.min(3, Math.floor(params.bursts)));
  const smokeAmt = Math.max(0, Math.min(1, params.smoke));

  const streaks: FwStreak[] = [];
  const sparks: FwSpark[] = [];
  const smoke: FwSmoke[] = [];

  // Launch streak (from below toward center), fades as burst opens
  const launchLen = radius * 0.55;
  const launchT = Math.min(1, progress * 1.4);
  const launchOpacity = Math.max(0, 1 - progress * 1.2) * 0.85;
  if (launchOpacity > 0.02) {
    streaks.push({
      x1: wind * 8,
      y1: launchLen * (1 - launchT * 0.15),
      x2: wind * 4 * launchT,
      y2: launchLen * (1 - launchT),
      color: trail,
      width: 2.2,
      opacity: launchOpacity,
    });
  }

  const open = progress;
  for (let b = 0; b < bursts; b++) {
    const burstSeed = createRng(params.seed + b * 9973);
    const bx = (burstSeed() - 0.5) * radius * 0.22 * (bursts > 1 ? 1 : 0);
    const by = (burstSeed() - 0.5) * radius * 0.18 * (bursts > 1 ? 1 : 0);
    const burstR = radius * (0.75 + burstSeed() * 0.35) * (bursts > 1 ? 0.7 + burstSeed() * 0.35 : 1);
    const nRays = Math.round(cfg.rays * (0.75 + burstSeed() * 0.5));
    const colorA = colors[Math.floor(burstSeed() * colors.length)];
    const colorB = colors[Math.floor(burstSeed() * colors.length)];

    for (let i = 0; i < nRays; i++) {
      const angle = (i / nRays) * 360 + burstSeed() * 12;
      let distFactor = 0.75 + burstSeed() * 0.35;
      if (cfg.ringBias > 0.5) {
        distFactor = 0.92 + burstSeed() * 0.08;
      }
      const reach = burstR * distFactor * open;
      const age = open;
      const droop = cfg.droop * age * age * burstR * 0.35;
      const windX = wind * age * reach * 0.55;
      const tip = rotatePos(reach, angle);
      const tipX = bx + tip.x + windX;
      const tipY = by + tip.y + droop;

      const trailLen = cfg.trail * reach * (0.35 + burstSeed() * 0.5);
      const base = rotatePos(Math.max(0, reach - trailLen), angle);
      const baseX = bx + base.x + windX * 0.65;
      const baseY = by + base.y + droop * 0.55;

      const col = burstSeed() < 0.5 ? colorA : colorB;
      const streakOp = 0.55 + burstSeed() * 0.4;
      streaks.push({
        x1: baseX,
        y1: baseY,
        x2: tipX,
        y2: tipY,
        color: col,
        width: 1.1 + burstSeed() * 1.6,
        opacity: streakOp * Math.min(1, open * 1.4),
      });

      sparks.push({
        x: tipX,
        y: tipY,
        r: 1.2 + burstSeed() * 2.4,
        color: col,
        opacity: (0.7 + burstSeed() * 0.3) * Math.min(1, open * 1.5),
      });

      // Crossette / cluster sub-bursts near tip
      if (burstSeed() < cfg.clusterChance * open) {
        const subN = params.variant === 'crossette' ? 4 : 3 + Math.floor(burstSeed() * 4);
        const subR = reach * (0.12 + burstSeed() * 0.18);
        for (let s = 0; s < subN; s++) {
          const sa = angle + (s / subN) * 360 + burstSeed() * 40;
          const sp = rotatePos(subR * open, sa);
          const sx = tipX + sp.x + wind * 4 * open;
          const sy = tipY + sp.y + droop * 0.2;
          const sc = colors[Math.floor(burstSeed() * colors.length)];
          streaks.push({
            x1: tipX,
            y1: tipY,
            x2: sx,
            y2: sy,
            color: sc,
            width: 0.8 + burstSeed(),
            opacity: 0.65 * open,
          });
          sparks.push({
            x: sx,
            y: sy,
            r: 0.8 + burstSeed() * 1.5,
            color: sc,
            opacity: 0.75 * open,
          });
        }
      }
    }
  }

  // Smoke puffs drifting with wind
  const smokeCount = Math.round(8 + smokeAmt * 28);
  for (let i = 0; i < smokeCount; i++) {
    const a = rng() * 360;
    const d = rng() * radius * 0.85 * open;
    const p = rotatePos(d, a);
    const age = 0.3 + rng() * 0.7;
    const wx = wind * age * d * 0.7;
    const wy = age * d * 0.15 * cfg.droop;
    smoke.push({
      x: p.x + wx,
      y: p.y + wy,
      rx: 6 + rng() * 18 * smokeAmt,
      ry: 4 + rng() * 12 * smokeAmt,
      opacity: smokeAmt * (0.08 + rng() * 0.14) * Math.min(1, open * 1.2),
    });
  }

  // Soft core flash at peak
  if (open > 0.2) {
    sparks.push({
      x: wind * 6 * open,
      y: 0,
      r: 3 + radius * 0.04 * open,
      color: '#ffffff',
      opacity: 0.55 * open,
    });
  }

  return { streaks, sparks, smoke };
}
