import { createRng } from '../math/polar';
import { FireworkParams, FireworkVariant } from '../models/shape';
import { pickFireworkColors } from '../style/firework-palettes';

/** Short stroke segment along a particle trail (opacity / width vary for phosphor fade). */
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

export interface FireworkFrame {
  streaks: FwStreak[];
  sparks: FwSpark[];
}

function easeOutCubic(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - u, 3);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mixHex(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return a;
  const m = (x: number, y: number) => Math.round(lerp(x, y, t));
  return `#${[m(pa.r, pb.r), m(pa.g, pb.g), m(pa.b, pb.b)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
}

function parseHex(c: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

interface VariantConfig {
  rays: number;
  /** Gravity strength (SVG +y down). */
  gravity: number;
  /** 0 = spherical burst, 1 = fountain (upward cone). */
  fountain: number;
  /** How long the luminous trail is relative to flight (0–1 samples kept). */
  trailKeep: number;
  /** Chance a particle gets dotted phosphor spark trail. */
  sparkTrailChance: number;
  /** Phosphor brightness boost in mid-trail. */
  phosphor: number;
  clusterChance: number;
  ringBias: number;
  /** Initial speed scale vs radius. */
  speed: number;
}

function variantConfig(v: FireworkVariant): VariantConfig {
  switch (v) {
    case 'peony':
      return {
        rays: 52,
        gravity: 0.55,
        fountain: 0,
        trailKeep: 0.85,
        sparkTrailChance: 0.2,
        phosphor: 0.55,
        clusterChance: 0.12,
        ringBias: 0,
        speed: 1,
      };
    case 'chrysanthemum':
      return {
        rays: 72,
        gravity: 0.65,
        fountain: 0,
        trailKeep: 1,
        sparkTrailChance: 0.35,
        phosphor: 0.85,
        clusterChance: 0.18,
        ringBias: 0,
        speed: 1.05,
      };
    case 'willow':
      return {
        rays: 44,
        gravity: 1.35,
        fountain: 0,
        trailKeep: 1,
        sparkTrailChance: 0.55,
        phosphor: 0.7,
        clusterChance: 0.05,
        ringBias: 0,
        speed: 0.95,
      };
    case 'palm':
      return {
        rays: 30,
        gravity: 0.95,
        fountain: 0,
        trailKeep: 1,
        sparkTrailChance: 0.4,
        phosphor: 0.9,
        clusterChance: 0.08,
        ringBias: 0,
        speed: 1.15,
      };
    case 'cluster':
      return {
        rays: 40,
        gravity: 0.6,
        fountain: 0,
        trailKeep: 0.75,
        sparkTrailChance: 0.25,
        phosphor: 0.5,
        clusterChance: 0.9,
        ringBias: 0,
        speed: 1,
      };
    case 'ring':
      return {
        rays: 56,
        gravity: 0.4,
        fountain: 0,
        trailKeep: 0.65,
        sparkTrailChance: 0.15,
        phosphor: 0.4,
        clusterChance: 0.05,
        ringBias: 0.9,
        speed: 1,
      };
    case 'crossette':
      return {
        rays: 36,
        gravity: 0.7,
        fountain: 0,
        trailKeep: 0.8,
        sparkTrailChance: 0.3,
        phosphor: 0.6,
        clusterChance: 0.7,
        ringBias: 0,
        speed: 1.05,
      };
    case 'fountain':
      return {
        rays: 64,
        gravity: 1.55,
        fountain: 1,
        trailKeep: 1,
        sparkTrailChance: 0.65,
        phosphor: 0.95,
        clusterChance: 0.08,
        ringBias: 0,
        speed: 1.25,
      };
    default:
      return {
        rays: 48,
        gravity: 0.7,
        fountain: 0,
        trailKeep: 0.85,
        sparkTrailChance: 0.3,
        phosphor: 0.6,
        clusterChance: 0.2,
        ringBias: 0,
        speed: 1,
      };
  }
}

interface Ballistic {
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  color: string;
  phosphor: string;
  sparkTrail: boolean;
  born: number;
}

function samplePos(
  p: Ballistic,
  u: number,
  gravity: number,
  windAccel: number,
): { x: number; y: number } {
  const t = Math.max(0, u);
  return {
    x: p.x0 + p.vx * t + 0.5 * windAccel * t * t,
    y: p.y0 + p.vy * t + 0.5 * gravity * t * t,
  };
}

/**
 * Evaluate firework at animation progress t (0..1). Peak freeze = t=1.
 * Local coords: burst/fountain origin at (0,0); SVG +y is down.
 */
export function evaluateFirework(params: FireworkParams, t = 1): FireworkFrame {
  const progress = easeOutCubic(Math.min(1, Math.max(0, t)));
  const rng = createRng(params.seed);
  const cfg = variantConfig(params.variant);
  const { colors, trail } = pickFireworkColors(params.scheme, params.seed);
  const radius = Math.max(20, params.radius);
  const wind = Math.max(-1, Math.min(1, params.wind));
  const bursts = Math.max(1, Math.min(3, Math.floor(params.bursts)));
  const isFountain = cfg.fountain > 0.5;

  // Flight time scale so tip ~radius at peak without gravity
  const flightT = 1;
  const speedBase = radius * cfg.speed;
  const gravity = cfg.gravity * radius * 1.8;
  const windAccel = wind * radius * 1.2;

  const streaks: FwStreak[] = [];
  const sparks: FwSpark[] = [];
  const particles: Ballistic[] = [];

  // Launch trail (shell rising) — skip for fountain
  if (!isFountain) {
    const launchOpacity = Math.max(0, 1 - progress * 1.25) * 0.9;
    if (launchOpacity > 0.02) {
      const segs = 10;
      for (let i = 0; i < segs; i++) {
        const a = i / segs;
        const b = (i + 1) / segs;
        const y1 = radius * 0.55 * (1 - a * progress);
        const y2 = radius * 0.55 * (1 - b * progress);
        const x1 = wind * 10 * a;
        const x2 = wind * 10 * b;
        streaks.push({
          x1,
          y1,
          x2,
          y2,
          color: mixHex(trail, '#ffffff', 0.35 * (1 - a)),
          width: 1.4 + (1 - a) * 1.4,
          opacity: launchOpacity * (0.25 + 0.75 * b),
        });
      }
    }
  }

  const burstCount = isFountain ? 1 : bursts;
  for (let b = 0; b < burstCount; b++) {
    const burstRng = createRng(params.seed + b * 9973 + 17);
    const bx = isFountain ? 0 : (burstRng() - 0.5) * radius * 0.2 * (bursts > 1 ? 1 : 0);
    const by = isFountain ? 0 : (burstRng() - 0.5) * radius * 0.16 * (bursts > 1 ? 1 : 0);
    const nRays = Math.round(cfg.rays * (0.8 + burstRng() * 0.45));

    for (let i = 0; i < nRays; i++) {
      let angleDeg: number;
      let speed: number;

      if (isFountain) {
        // Upward cone: −90° is up in SVG; spread ±28°
        const spread = 28 + burstRng() * 14;
        angleDeg = -90 + (burstRng() * 2 - 1) * spread;
        speed = speedBase * (0.55 + burstRng() * 0.7);
      } else {
        angleDeg = (i / nRays) * 360 + burstRng() * 14;
        let distFactor = 0.72 + burstRng() * 0.4;
        if (cfg.ringBias > 0.5) distFactor = 0.9 + burstRng() * 0.1;
        speed = speedBase * distFactor;
      }

      const rad = (angleDeg * Math.PI) / 180;
      const vx = Math.cos(rad) * speed;
      const vy = Math.sin(rad) * speed;
      const col = colors[Math.floor(burstRng() * colors.length)];
      const phos = mixHex(col, '#ffffff', 0.55 + burstRng() * 0.35);

      particles.push({
        x0: bx + (burstRng() - 0.5) * 3,
        y0: by + (isFountain ? burstRng() * 4 : (burstRng() - 0.5) * 3),
        vx,
        vy,
        color: col,
        phosphor: phos,
        sparkTrail: burstRng() < cfg.sparkTrailChance,
        born: 0,
      });

      // Crossette / cluster: secondary burst near mid-flight tip
      if (!isFountain && burstRng() < cfg.clusterChance * progress) {
        const midU = 0.45 + burstRng() * 0.25;
        const mid = samplePos(
          { x0: bx, y0: by, vx, vy, color: col, phosphor: phos, sparkTrail: false, born: 0 },
          midU * flightT,
          gravity,
          windAccel,
        );
        const subN = params.variant === 'crossette' ? 4 : 3 + Math.floor(burstRng() * 3);
        for (let s = 0; s < subN; s++) {
          const sa = (s / subN) * 360 + burstRng() * 50;
          const sr = ((sa * Math.PI) / 180);
          const ss = speedBase * (0.18 + burstRng() * 0.2);
          const sc = colors[Math.floor(burstRng() * colors.length)];
          particles.push({
            x0: mid.x,
            y0: mid.y,
            vx: Math.cos(sr) * ss,
            vy: Math.sin(sr) * ss,
            color: sc,
            phosphor: mixHex(sc, '#ffffff', 0.5),
            sparkTrail: burstRng() < 0.4,
            born: midU,
          });
        }
      }
    }
  }

  const samples = 16;
  for (const p of particles) {
    const lifeStart = p.born;
    const lifeEnd = progress;
    if (lifeEnd <= lifeStart + 0.02) continue;

    const localProg = (lifeEnd - lifeStart) / Math.max(1e-6, 1 - lifeStart);
    const trailStart = Math.max(lifeStart, lifeEnd - cfg.trailKeep * (lifeEnd - lifeStart));

    const pts: { x: number; y: number; u: number }[] = [];
    for (let i = 0; i <= samples; i++) {
      const f = i / samples;
      const u = lerp(trailStart, lifeEnd, f);
      const pos = samplePos(p, u * flightT, gravity, windAccel);
      pts.push({ x: pos.x, y: pos.y, u: f });
    }

    // Continuous luminous trail with age fade + mid phosphor
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const midU = (a.u + b.u) / 2;
      // Older (near trail start / center) more transparent; tip brighter
      const ageOp = Math.pow(midU, 1.15) * (0.35 + 0.65 * localProg);
      // Phosphor peak near mid-path
      const phosGate = Math.exp(-Math.pow((midU - 0.48) / 0.22, 2));
      const width = (0.7 + midU * 1.5) * (1 + cfg.phosphor * phosGate * 1.8);
      const color = mixHex(p.color, p.phosphor, cfg.phosphor * phosGate * 0.85);
      streaks.push({
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        color,
        width,
        opacity: Math.min(1, ageOp * (0.55 + cfg.phosphor * 0.35)),
      });
    }

    // Tip spark
    const tip = pts[pts.length - 1];
    sparks.push({
      x: tip.x,
      y: tip.y,
      r: 1.1 + rng() * 2.2,
      color: mixHex(p.color, '#ffffff', 0.4),
      opacity: Math.min(1, 0.55 + localProg * 0.45),
    });

    // Irregular glowing dots along parabolic path
    if (p.sparkTrail && localProg > 0.15) {
      let u = trailStart + rng() * 0.08 * (lifeEnd - trailStart);
      while (u < lifeEnd - 0.04) {
        const pos = samplePos(p, u * flightT, gravity, windAccel);
        const along = (u - trailStart) / Math.max(1e-6, lifeEnd - trailStart);
        sparks.push({
          x: pos.x + (rng() - 0.5) * 1.2,
          y: pos.y + (rng() - 0.5) * 1.2,
          r: 0.55 + rng() * 1.4,
          color: mixHex(p.phosphor, '#ffffff', rng() * 0.5),
          opacity: Math.min(1, Math.pow(along, 0.9) * (0.4 + rng() * 0.55)),
        });
        u += (0.04 + rng() * 0.12) * (lifeEnd - trailStart);
      }
    }
  }

  return { streaks, sparks };
}
