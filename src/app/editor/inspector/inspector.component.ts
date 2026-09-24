import { DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DrawingService } from '../../core/services/drawing.service';
import { fireworkTrailLimits } from '../../core/generators/firework';
import {
  CirclesParams,
  CircleLineParams,
  FillMode,
  FireworkParams,
  FireworkScheme,
  FireworkVariant,
  MultiStarParams,
  OctopusParams,
  RainbowMode,
  RainbowParams,
  RandomStarParams,
  Shape,
  ShapeType,
  StrokeMode,
  SunflowerParams,
  ToolId,
} from '../../core/models/shape';
import { COLOR_PRESETS, RAINBOW_COLORS } from '../../core/style/presets';
import { FIREWORK_NEON_POOL, pickFillStops } from '../../core/style/firework-palettes';

/** Tools that expose type-specific inspector params before/after placing. */
const PARAM_TOOLS = new Set<ToolId>([
  'octopus',
  'multiStar',
  'randomStar',
  'circleLine',
  'circles',
  'sunflower',
  'firework',
  'rainbow',
]);

const TYPE_LABELS: Record<string, string> = {
  freehand: 'Freihand',
  line: 'Linie',
  rect: 'Rechteck',
  ellipse: 'Ellipse',
  triangle: 'Dreieck',
  heart: 'Herz',
  pentagon: 'Fünfeck',
  hexagon: 'Sechseck',
  polygon: 'Polygon',
  centerLines: 'CenterLines',
  gradient: 'Verlauf',
  gradientCircle: 'GradientCircle',
  octopus: 'Octopus',
  multiStar: 'MultiStar',
  randomStar: 'RandomStar',
  circleLine: 'CircleLine',
  circles: 'Circles',
  sunflower: 'Sonnenblume',
  firework: 'Feuerwerk',
  rainbow: 'Regenbogen',
  importedVector: 'Import',
  vectorPath: 'Pfad',
  group: 'Gruppe',
};

@Component({
  selector: 'app-inspector',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  templateUrl: './inspector.component.html',
  styleUrl: './inspector.component.scss',
})
export class InspectorComponent {
  readonly drawing = inject(DrawingService);
  readonly presets = COLOR_PRESETS;

  readonly selected = computed(() => this.drawing.selectedShape());

  /** Selected shape type, or active draw tool when it has params. */
  readonly focusType = computed<ShapeType | ToolId | null>(() => {
    const s = this.selected();
    if (s) return s.type;
    const tool = this.drawing.tool();
    return PARAM_TOOLS.has(tool) ? tool : null;
  });

  readonly showFirework = computed(
    () => this.selected()?.type === 'firework' || this.drawing.tool() === 'firework',
  );

  readonly fwParams = computed((): FireworkParams => {
    const s = this.selected();
    if (s?.type === 'firework') {
      const p = s.params as FireworkParams;
      const limits = fireworkTrailLimits(p.variant);
      const trails =
        p.trails ??
        (p.bursts != null ? Math.round(p.bursts * limits.def) : limits.def);
      return { ...p, trails, dotTrails: p.dotTrails ?? false };
    }
    const ep = this.drawing.effectParams().firework;
    return {
      seed: 0,
      radius: 40,
      wind: ep.wind ?? 0,
      variant: ep.variant,
      scheme: ep.scheme,
      trails: ep.trails ?? fireworkTrailLimits(ep.variant).def,
      dotTrails: ep.dotTrails ?? false,
    };
  });

  readonly fwTrailLimits = computed(() =>
    fireworkTrailLimits(this.fwParams().variant),
  );

  /** Whether this inspector block matches the active tool/selection. */
  isFocusBlock(id: string): boolean {
    const focus = this.focusType();
    if (!focus) return false;
    if (id === 'transform') return !!this.selected();
    return id === focus;
  }

  /**
   * Neon/Random need a fill surface. Hide for stroke-only tools/shapes
   * (line, freehand, centerLines, firework has its own scheme UI).
   */
  readonly supportsNeonRandomFill = computed(() => {
    const s = this.selected();
    const type = s?.type ?? this.drawing.tool();
    const strokeOnly = new Set([
      'line',
      'freehand',
      'centerLines',
      'firework',
      'vectorPath',
    ]);
    return !strokeOnly.has(type);
  });

  /** CSS background for the fill swatch (size of a color input). */
  readonly fillPreviewCss = computed(() => {
    const mode = this.drawing.fillMode();
    const angle = this.drawing.fillAngle();
    if (mode === 'none') {
      return 'repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 0 0 / 8px 8px';
    }
    if (mode === 'solid') {
      return this.drawing.fillColor();
    }
    const stopsToCss = (colors: readonly string[]) => {
      if (!colors.length) return '#ccc';
      if (colors.length === 1) return colors[0];
      const parts = colors.map((c, i) => {
        const pct = (i / (colors.length - 1)) * 100;
        return `${c} ${pct.toFixed(1)}%`;
      });
      return `linear-gradient(${angle}deg, ${parts.join(', ')})`;
    };
    if (mode === 'gradient') {
      return stopsToCss([
        this.drawing.fillGradientFrom(),
        this.drawing.fillGradientTo(),
      ]);
    }
    if (mode === 'rainbowGradient') {
      return stopsToCss(RAINBOW_COLORS);
    }
    if (mode === 'rainbowStripes') {
      const n = RAINBOW_COLORS.length;
      const parts: string[] = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 100;
        const b = ((i + 1) / n) * 100;
        parts.push(`${RAINBOW_COLORS[i]} ${a.toFixed(1)}%`, `${RAINBOW_COLORS[i]} ${b.toFixed(1)}%`);
      }
      return `linear-gradient(${angle}deg, ${parts.join(', ')})`;
    }
    if (mode === 'neon' || mode === 'random') {
      const stops =
        this.drawing.fillPaletteStops() ??
        [this.drawing.fillGradientFrom(), this.drawing.fillGradientTo()];
      return stopsToCss(stops.length >= 2 ? stops : FIREWORK_NEON_POOL[0]);
    }
    return this.drawing.fillColor();
  });

  /** Top = front (reverse of shapes array). typeIndex = Einfüge-Nr. je Typ. */
  readonly layerEntries = computed(() => {
    const shapes = this.drawing.shapes();
    const counts = new Map<string, number>();
    const numbered = shapes.map((s, arrayIndex) => {
      const typeIndex = (counts.get(s.type) ?? 0) + 1;
      counts.set(s.type, typeIndex);
      return { shape: s, arrayIndex, typeIndex };
    });
    return numbered.reverse();
  });

  private dragFromArrayIndex: number | null = null;

  typeLabel(s: Shape): string {
    return TYPE_LABELS[s.type] ?? s.type;
  }

  typeNumber(typeIndex: number): string {
    return `#${typeIndex}`;
  }

  isCollapsed(id: string): boolean {
    return this.drawing.isSectionCollapsed(id);
  }

  toggle(id: string): void {
    this.drawing.toggleSection(id);
  }

  selectLayer(id: string): void {
    this.drawing.selectShape(id);
  }

  onLayerDragStart(arrayIndex: number, ev: DragEvent): void {
    this.dragFromArrayIndex = arrayIndex;
    ev.dataTransfer?.setData('text/plain', String(arrayIndex));
    if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
  }

  onLayerDragOver(ev: DragEvent): void {
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
  }

  onLayerDrop(toArrayIndex: number, ev: DragEvent): void {
    ev.preventDefault();
    const from =
      this.dragFromArrayIndex ??
      Number(ev.dataTransfer?.getData('text/plain'));
    this.dragFromArrayIndex = null;
    if (Number.isNaN(from)) return;
    this.drawing.reorderShape(from, toArrayIndex);
  }

  onStroke(v: string): void {
    this.drawing.strokeColor.set(v);
    this.drawing.strokePresetId.set(null);
    if (this.selected()) this.drawing.updateSelectedStyle({ stroke: v });
  }

  onStrokeEnd(v: string): void {
    this.drawing.strokeEndColor.set(v);
    this.drawing.strokePresetId.set(null);
    if (this.selected()) this.drawing.updateSelectedStyle({ strokeEnd: v });
  }

  onFill(v: string): void {
    this.drawing.fillColor.set(v);
    if (this.selected()) this.drawing.updateSelectedStyle({ fill: v });
  }

  onWidth(v: string | number): void {
    const n = Number(v);
    this.drawing.strokeWidth.set(n);
    if (this.selected()) this.drawing.updateSelectedStyle({ strokeWidth: n });
  }

  onOpacity(v: string | number): void {
    const n = Math.min(1, Math.max(0, Number(v)));
    this.drawing.opacity.set(n);
    if (this.selected()) this.drawing.updateSelectedStyle({ opacity: n });
  }

  onStrokeMode(mode: StrokeMode): void {
    this.drawing.strokeMode.set(mode);
    if (this.selected()) this.drawing.updateSelectedStyle({ strokeMode: mode });
  }

  onFillMode(mode: FillMode): void {
    this.drawing.fillMode.set(mode);
    const patch: Partial<import('../../core/models/shape').StyleProps> = { fillMode: mode };
    if (mode === 'gradient') {
      patch.fillGradient = {
        angle: this.drawing.fillAngle(),
        from: this.drawing.fillGradientFrom(),
        to: this.drawing.fillGradientTo(),
        presetId: this.drawing.fillPresetId() ?? undefined,
      };
    } else if (mode === 'rainbowGradient' || mode === 'rainbowStripes') {
      patch.fillGradient = {
        angle: this.drawing.fillAngle(),
        from: this.drawing.fillGradientFrom(),
        to: this.drawing.fillGradientTo(),
      };
    } else if (mode === 'neon' || mode === 'random') {
      this.applyNeonRandomPalette(mode, patch);
    } else if (mode === 'none') {
      patch.fill = 'none';
      patch.fillGradient = undefined;
      this.drawing.fillPaletteStops.set(null);
    } else if (mode === 'solid') {
      patch.fill = this.drawing.fillColor();
      patch.fillGradient = undefined;
      this.drawing.fillPaletteStops.set(null);
    }
    if (this.selected()) this.drawing.updateSelectedStyle(patch);
  }

  rerollFillPalette(): void {
    const mode = this.drawing.fillMode();
    if (mode !== 'neon' && mode !== 'random') return;
    const patch: Partial<import('../../core/models/shape').StyleProps> = { fillMode: mode };
    this.applyNeonRandomPalette(mode, patch);
    if (this.selected()) this.drawing.updateSelectedStyle(patch);
  }

  private applyNeonRandomPalette(
    mode: 'neon' | 'random',
    patch: Partial<import('../../core/models/shape').StyleProps>,
  ): void {
    const seed = (Math.random() * 0xffffffff) >>> 0;
    const stops = pickFillStops(mode, seed);
    const from = stops[0];
    const to = stops[stops.length - 1];
    this.drawing.fillGradientFrom.set(from);
    this.drawing.fillGradientTo.set(to);
    this.drawing.fillPaletteStops.set(stops);
    patch.fill = from;
    patch.fillGradient = {
      angle: this.drawing.fillAngle(),
      from,
      to,
      stops,
    };
  }

  onFillPreset(id: string): void {
    this.drawing.applyFillPreset(id || null);
  }

  onStrokePreset(id: string): void {
    this.drawing.applyStrokePreset(id || null);
  }

  onFillAngle(v: string | number): void {
    const n = Number(v);
    this.drawing.fillAngle.set(n);
    const s = this.selected();
    if (s) {
      this.drawing.updateSelectedStyle({
        fillGradient: {
          angle: n,
          from: this.drawing.fillGradientFrom(),
          to: this.drawing.fillGradientTo(),
          presetId: this.drawing.fillPresetId() ?? undefined,
          stops: this.drawing.fillPaletteStops() ?? undefined,
        },
      });
    }
  }

  onStrokeAngle(v: string | number): void {
    const n = Number(v);
    this.drawing.strokeAngle.set(n);
    if (this.selected()) this.drawing.updateSelectedStyle({ strokeAngle: n });
  }

  onFillGradFrom(v: string): void {
    this.drawing.fillGradientFrom.set(v);
    this.drawing.fillPresetId.set(null);
    this.syncFillGradient();
  }

  onFillGradTo(v: string): void {
    this.drawing.fillGradientTo.set(v);
    this.drawing.fillPresetId.set(null);
    this.syncFillGradient();
  }

  private syncFillGradient(): void {
    if (!this.selected()) return;
    this.drawing.updateSelectedStyle({
      fillMode: 'gradient',
      fillGradient: {
        angle: this.drawing.fillAngle(),
        from: this.drawing.fillGradientFrom(),
        to: this.drawing.fillGradientTo(),
      },
    });
  }

  onRotation(v: string | number): void {
    this.drawing.updateSelectedTransform({ rotation: Number(v) });
  }

  onScale(v: string | number): void {
    const n = Number(v);
    this.drawing.updateSelectedTransform({ scaleX: n, scaleY: n });
  }

  updateParam(key: string, value: string | number): void {
    const n =
      typeof value === 'string' && value !== '' && !Number.isNaN(Number(value))
        ? Number(value)
        : value;
    this.drawing.updateSelectedParams({ [key]: n });
  }

  updateEffectDefault(
    group:
      | 'octopus'
      | 'multiStar'
      | 'randomStar'
      | 'circleLine'
      | 'circles'
      | 'sunflower'
      | 'firework'
      | 'rainbow',
    key: string,
    value: string | number | boolean,
  ): void {
    const coerced =
      (group === 'rainbow' && key === 'mode') ||
      (group === 'firework' &&
        (key === 'variant' || key === 'scheme' || key === 'dotTrails'))
        ? value
        : typeof value === 'number' || typeof value === 'boolean'
          ? value
          : Number(value);
    this.drawing.effectParams.update((ep) => ({
      ...ep,
      [group]: { ...ep[group], [key]: coerced },
    }));
  }

  /** Patch firework on selection (if any) and always sync effect defaults. */
  patchFirework(
    partial: Partial<
      Pick<FireworkParams, 'variant' | 'scheme' | 'trails' | 'dotTrails' | 'wind'>
    >,
  ): void {
    const s = this.selected();
    if (s?.type === 'firework') {
      this.drawing.updateSelectedParams(partial);
    }
    this.drawing.effectParams.update((ep) => ({
      ...ep,
      firework: { ...ep.firework, ...partial },
    }));
  }

  setRainbowMode(mode: RainbowMode): void {
    const s = this.selected();
    if (s?.type === 'rainbow') {
      this.drawing.updateSelectedParams({ mode });
    }
    this.updateEffectDefault('rainbow', 'mode', mode);
  }

  asOctopus(p: unknown): OctopusParams {
    return p as OctopusParams;
  }
  asMulti(p: unknown): MultiStarParams {
    return p as MultiStarParams;
  }
  asRandom(p: unknown): RandomStarParams {
    return p as RandomStarParams;
  }
  asCircleLine(p: unknown): CircleLineParams {
    return p as CircleLineParams;
  }
  asCircles(p: unknown): CirclesParams {
    return p as CirclesParams;
  }
  asSunflower(p: unknown): SunflowerParams {
    return p as SunflowerParams;
  }
  asFirework(p: unknown): FireworkParams {
    return p as FireworkParams;
  }
  asRainbow(p: unknown): RainbowParams {
    return p as RainbowParams;
  }

  onFireworkVariant(v: FireworkVariant): void {
    const limits = fireworkTrailLimits(v);
    const trails = Math.min(this.fwParams().trails ?? limits.def, limits.max);
    this.patchFirework({ variant: v, trails: Math.max(limits.min, trails) });
  }

  onFireworkScheme(v: FireworkScheme): void {
    this.patchFirework({ scheme: v });
  }

  onFireworkDotTrails(v: boolean): void {
    this.patchFirework({ dotTrails: !!v });
  }

  onFireworkTrails(v: string | number): void {
    const limits = this.fwTrailLimits();
    const n = Math.max(limits.min, Math.min(limits.max, Math.round(Number(v))));
    this.patchFirework({ trails: n });
  }

  onFireworkWind(v: string | number): void {
    this.patchFirework({ wind: Number(v) });
  }
}
