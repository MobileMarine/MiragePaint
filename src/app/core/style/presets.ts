import { lerpColor } from '../math/polar';
import { FIREWORK_NEON_POOL } from './firework-palettes';
import { StyleGradient, StyleProps } from '../models/shape';

export type ColorPresetKind = 'classic' | 'rainbow' | 'neon' | 'random';

export interface ColorPreset {
  id: string;
  label: string;
  from: string;
  to: string;
  stops?: string[];
  stepped?: boolean;
  steps?: number;
  kind?: ColorPresetKind;
}

/** Classic pride-flag rainbow stops. */
export const RAINBOW_COLORS = [
  '#E40303',
  '#FF8C00',
  '#FFED00',
  '#008026',
  '#24408E',
  '#732982',
] as const;

export const COLOR_PRESETS: ColorPreset[] = [
  { id: 'sunset', label: 'Sonnenuntergang', from: '#ff6b35', to: '#f7c948', kind: 'classic' },
  { id: 'ocean', label: 'Ozean', from: '#0b3d91', to: '#4ecdc4', kind: 'classic' },
  { id: 'pink', label: 'Pink', from: '#ffbdf3', to: '#ff00a2', kind: 'classic' },
  { id: 'forest', label: 'Wald', from: '#1b4332', to: '#95d5b2', kind: 'classic' },
  { id: 'mono', label: 'Graphit', from: '#1a1a1a', to: '#b0b0b0', kind: 'classic' },
  {
    id: 'rainbow',
    label: 'Regenbogen',
    from: RAINBOW_COLORS[0],
    to: RAINBOW_COLORS[RAINBOW_COLORS.length - 1],
    stops: [...RAINBOW_COLORS],
    kind: 'rainbow',
  },
  {
    id: 'neon',
    label: 'Neon',
    from: '#ff2bd6',
    to: '#00f0ff',
    stops: [...FIREWORK_NEON_POOL[0]],
    kind: 'neon',
  },
  {
    id: 'random',
    label: 'Random',
    from: '#ff006e',
    to: '#ffbe0b',
    stops: [...FIREWORK_NEON_POOL[2]],
    kind: 'random',
  },
];

/** @deprecated Prefer sampling via samplePalette / styleGradientColorAt */
export type PaletteMode = 'solid' | 'gradient' | 'stepped';

export function presetById(id: string | undefined | null): ColorPreset | undefined {
  if (!id) return undefined;
  return COLOR_PRESETS.find((p) => p.id === id);
}

export function presetStops(p: ColorPreset): string[] {
  if (p.stops && p.stops.length >= 2) return [...p.stops];
  return [p.from, p.to];
}

/** CSS linear-gradient preview for a preset or stop list. */
export function gradientPreviewCss(
  angle: number,
  from: string,
  to: string,
  stops?: readonly string[],
  stepped?: boolean,
  steps?: number,
): string {
  const svgStops = buildLinearStops(from, to, stops, stepped, steps);
  if (!svgStops.length) return from;
  const parts = svgStops.map((s) => `${s.color} ${s.offset}`);
  return `linear-gradient(${angle}deg, ${parts.join(', ')})`;
}

export interface SvgGradStop {
  offset: string;
  color: string;
}

/** Expand style gradient into SVG stop list (smooth or hard bands). */
export function buildLinearStops(
  from: string,
  to: string,
  stops?: readonly string[],
  stepped?: boolean,
  steps?: number,
): SvgGradStop[] {
  const palette =
    stops && stops.length >= 2 ? [...stops] : from && to ? [from, to] : [from || '#888'];
  if (palette.length === 1) {
    return [
      { offset: '0%', color: palette[0] },
      { offset: '100%', color: palette[0] },
    ];
  }

  if (stepped) {
    const bands = Math.max(2, Math.round(steps ?? palette.length));
    const out: SvgGradStop[] = [];
    for (let i = 0; i < bands; i++) {
      const t0 = i / bands;
      const t1 = (i + 1) / bands;
      // Smooth sample so N bands across a 2-color palette yield N distinct colors
      const color = samplePalette(i, bands, palette, true);
      out.push({ offset: `${(t0 * 100).toFixed(2)}%`, color });
      out.push({ offset: `${(t1 * 100).toFixed(2)}%`, color });
    }
    return out;
  }

  return palette.map((color, i) => ({
    offset: `${((i / (palette.length - 1)) * 100).toFixed(2)}%`,
    color,
  }));
}

export function buildStopsFromGradient(g: StyleGradient): SvgGradStop[] {
  return buildLinearStops(g.from, g.to, g.stops, g.stepped, g.steps);
}

/** Sample color for primitive i of n across a palette. */
export function samplePalette(
  i: number,
  n: number,
  palette: readonly string[],
  smooth: boolean,
): string {
  if (!palette.length) return '#888';
  if (palette.length === 1) return palette[0];
  if (n <= 1) return palette[0];

  if (!smooth) {
    const idx = Math.min(palette.length - 1, Math.floor((i / n) * palette.length));
    // Map band index onto palette evenly
    const band = Math.min(n - 1, Math.max(0, i));
    const palIdx = Math.min(
      palette.length - 1,
      Math.floor((band / Math.max(1, n - 1)) * (palette.length - 1) + 1e-9),
    );
    // Prefer discrete stripe mapping: i/n * palette.length
    const stripeIdx = Math.min(palette.length - 1, Math.floor((i / n) * palette.length));
    return palette[stripeIdx] ?? palette[palIdx] ?? palette[idx];
  }

  const t = Math.min(1, Math.max(0, i / (n - 1)));
  const f = t * (palette.length - 1);
  const i0 = Math.floor(f);
  const i1 = Math.min(palette.length - 1, i0 + 1);
  return lerpColor(palette[i0], palette[i1], f - i0);
}

/**
 * Farbe für Primitive i von n.
 * Legacy PaletteMode kept for generators; prefer styleGradientColorAt for new code.
 */
export function colorAt(
  i: number,
  n: number,
  mode: PaletteMode | string,
  from: string,
  to: string,
  stops?: readonly string[],
  stepped?: boolean,
  steps?: number,
): string {
  const palette =
    stops && stops.length >= 2
      ? stops
      : from && to
        ? [from, to]
        : [...FIREWORK_NEON_POOL[0]];

  if (mode === 'solid') return from;

  // Legacy mode names
  if (mode === 'rainbowStripes') {
    return samplePalette(i, n, RAINBOW_COLORS, false);
  }
  if (mode === 'rainbowGradient') {
    return samplePalette(i, n, RAINBOW_COLORS, true);
  }
  if (mode === 'neon' || mode === 'random') {
    return samplePalette(i, n, palette, true);
  }
  if (mode === 'stepped' || stepped) {
    const bands = Math.max(2, Math.round(steps ?? palette.length));
    // Map i onto bands, then pick color at band center across palette
    const band = n <= 1 ? 0 : Math.min(bands - 1, Math.floor((i / n) * bands));
    return samplePalette(band, bands, palette, false);
  }
  return samplePalette(i, n, palette, true);
}

export function styleGradientColorAt(style: StyleProps, i: number, n: number): string {
  const g = style.fillMode === 'gradient' ? style.fillGradient : undefined;
  const useStroke = !g && style.strokeMode === 'gradient';
  if (style.fillMode === 'solid' && !useStroke) {
    return style.fill && style.fill !== 'none' ? style.fill : style.stroke;
  }
  if (style.fillMode !== 'gradient' && !useStroke) {
    return style.stroke;
  }
  const grad = g ?? {
    from: style.stroke,
    to: style.strokeEnd ?? style.stroke,
    angle: style.strokeAngle ?? 0,
    stops: style.strokeGradient?.stops,
    stepped: style.strokeGradient?.stepped,
    steps: style.strokeGradient?.steps,
  };
  const palette =
    grad.stops && grad.stops.length >= 2
      ? grad.stops
      : [grad.from, grad.to];
  return colorAt(
    i,
    n,
    grad.stepped ? 'stepped' : 'gradient',
    grad.from,
    grad.to,
    palette,
    grad.stepped,
    grad.steps,
  );
}
