import { createRng } from '../math/polar';
import { FireworkScheme } from '../models/shape';

/** Impressive neon / classic firework color pools. */
export const FIREWORK_NEON_POOL: readonly string[][] = [
  ['#ff2bd6', '#7a00ff', '#00f0ff'],
  ['#39ff14', '#00e5ff', '#ffffff'],
  ['#ff006e', '#ffbe0b', '#fb5607'],
  ['#00f5d4', '#9b5de5', '#f15bb5'],
  ['#ffea00', '#ff6d00', '#ffffff'],
  ['#4cc9f0', '#f72585', '#b5179e'],
  ['#80ffdb', '#72efdd', '#56cfe1'],
];

export const FIREWORK_SCHEME_COLORS: Record<
  Exclude<FireworkScheme, 'random' | 'neon'>,
  { colors: string[]; trail: string }
> = {
  gold: { colors: ['#ffe566', '#ffc300', '#ff8c00', '#fff8dc'], trail: '#ffd60a' },
  bluePink: { colors: ['#4cc9f0', '#4361ee', '#f72585', '#ff99c8'], trail: '#a0c4ff' },
  yellowRed: { colors: ['#ffea00', '#ffbe0b', '#e63946', '#ff6b35'], trail: '#ffd166' },
  purpleGreen: { colors: ['#9b5de5', '#7b2cbf', '#39ff14', '#80ffdb'], trail: '#c77dff' },
  whiteGold: { colors: ['#ffffff', '#fff8dc', '#ffe566', '#e0e0e0'], trail: '#fff3b0' },
  aquaMagenta: { colors: ['#00f5d4', '#00bbf9', '#f15bb5', '#fee440'], trail: '#90e0ef' },
};

export interface FireworkColorPick {
  colors: string[];
  trail: string;
}

export function pickFireworkColors(scheme: FireworkScheme, seed: number): FireworkColorPick {
  const rng = createRng(seed ^ 0xf1fe);
  if (scheme === 'neon') {
    const palette = FIREWORK_NEON_POOL[Math.floor(rng() * FIREWORK_NEON_POOL.length)];
    return { colors: [...palette], trail: palette[0] };
  }
  if (scheme === 'random') {
    // Mix pair schemes + neon for variety
    const keys = Object.keys(FIREWORK_SCHEME_COLORS) as (keyof typeof FIREWORK_SCHEME_COLORS)[];
    if (rng() < 0.45) {
      const palette = FIREWORK_NEON_POOL[Math.floor(rng() * FIREWORK_NEON_POOL.length)];
      return { colors: [...palette], trail: palette[Math.floor(rng() * palette.length)] };
    }
    const key = keys[Math.floor(rng() * keys.length)];
    const s = FIREWORK_SCHEME_COLORS[key];
    return { colors: [...s.colors], trail: s.trail };
  }
  const s = FIREWORK_SCHEME_COLORS[scheme];
  return { colors: [...s.colors], trail: s.trail };
}

export function schemeFromFillMode(fillMode: string): FireworkScheme {
  if (fillMode === 'neon') return 'neon';
  if (fillMode === 'random') return 'random';
  return 'gold';
}
