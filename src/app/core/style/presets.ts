import { lerpColor } from '../math/polar';
import { FIREWORK_NEON_POOL } from './firework-palettes';

export interface ColorPreset {
  id: string;
  label: string;
  from: string;
  to: string;
}

export const COLOR_PRESETS: ColorPreset[] = [
  { id: 'sunset', label: 'Sonnenuntergang', from: '#ff6b35', to: '#f7c948' },
  { id: 'ocean', label: 'Ozean', from: '#0b3d91', to: '#4ecdc4' },
  { id: 'pink', label: 'Pink', from: '#ffbdf3', to: '#ff00a2' },
  { id: 'forest', label: 'Wald', from: '#1b4332', to: '#95d5b2' },
  { id: 'mono', label: 'Graphit', from: '#1a1a1a', to: '#b0b0b0' },
];

/** Classic pride-flag rainbow stops (outer → inner for arc tool). */
export const RAINBOW_COLORS = [
  '#E40303',
  '#FF8C00',
  '#FFED00',
  '#008026',
  '#24408E',
  '#732982',
] as const;

export type PaletteMode =
  | 'solid'
  | 'gradient'
  | 'rainbowGradient'
  | 'rainbowStripes'
  | 'neon'
  | 'random';

/** Farbe für Primitive i von n je nach Modus. */
export function colorAt(
  i: number,
  n: number,
  mode: PaletteMode,
  from: string,
  to: string,
  stops?: readonly string[],
): string {
  const t = n <= 1 ? 0 : Math.min(1, Math.max(0, i / (n - 1)));
  switch (mode) {
    case 'solid':
      return from;
    case 'gradient':
      return lerpColor(from, to, t);
    case 'rainbowStripes': {
      const len = RAINBOW_COLORS.length;
      const idx = n <= 1 ? 0 : Math.min(len - 1, Math.floor((i / n) * len));
      return RAINBOW_COLORS[idx];
    }
    case 'rainbowGradient': {
      const len = RAINBOW_COLORS.length;
      const f = t * (len - 1);
      const i0 = Math.floor(f);
      const i1 = Math.min(len - 1, i0 + 1);
      return lerpColor(RAINBOW_COLORS[i0], RAINBOW_COLORS[i1], f - i0);
    }
    case 'neon':
    case 'random': {
      const palette =
        stops && stops.length >= 2
          ? stops
          : from && to
            ? [from, to]
            : [...FIREWORK_NEON_POOL[0]];
      if (!palette.length) return from;
      if (palette.length === 1) return palette[0];
      // Soft blend across palette stops
      const f = t * (palette.length - 1);
      const i0 = Math.floor(f);
      const i1 = Math.min(palette.length - 1, i0 + 1);
      return lerpColor(palette[i0], palette[i1], f - i0);
    }
    default:
      return from;
  }
}

export function presetById(id: string | undefined | null): ColorPreset | undefined {
  if (!id) return undefined;
  return COLOR_PRESETS.find((p) => p.id === id);
}
