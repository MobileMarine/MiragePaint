import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DrawingService } from '../../core/services/drawing.service';
import { fireworkTrailLimits } from '../../core/generators/firework';
import {
  CirclesParams,
  CircleLineParams,
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
  StarParams,
  StylePaintMode,
  SunflowerParams,
  ToolId,
} from '../../core/models/shape';
import {
  COLOR_PRESETS,
  gradientPreviewCss,
} from '../../core/style/presets';
import { pickFillStops } from '../../core/style/firework-palettes';
import { regionStepCount } from '../../core/style/region-steps';
import {
  complexityLevel,
  shapeComplexityCount,
} from '../../core/render/complexity';
import { StyleModeControlComponent } from './controls/style-mode-control.component';
import { PresetPickerComponent } from './controls/preset-picker.component';
import { GradientColorsRowComponent } from './controls/gradient-colors-row.component';
import { GradientStepsControlComponent } from './controls/gradient-steps-control.component';
import { StrokeGlowControlComponent } from './controls/stroke-glow-control.component';

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
  'star',
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
  star: 'Stern',
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
  imports: [
    FormsModule,
    StyleModeControlComponent,
    PresetPickerComponent,
    GradientColorsRowComponent,
    GradientStepsControlComponent,
    StrokeGlowControlComponent,
  ],
  templateUrl: './inspector.component.html',
  styleUrl: './inspector.component.scss',
})
export class InspectorComponent {
  readonly drawing = inject(DrawingService);
  readonly presets = COLOR_PRESETS;
  readonly openFillPreset = signal(false);
  readonly openStrokePreset = signal(false);

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

  /** True when this shape is selected or its draw tool is active. */
  shows(type: ToolId): boolean {
    return this.selected()?.type === type || this.drawing.tool() === type;
  }

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
   * Neon/Random presets need a fill surface. Hide reroll for stroke-only tools.
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

  readonly showFillReroll = computed(() => {
    const id = this.drawing.fillPresetId();
    return this.supportsNeonRandomFill() && (id === 'neon' || id === 'random');
  });

  readonly showStrokeReroll = computed(() => {
    const id = this.drawing.strokePresetId();
    return id === 'neon' || id === 'random';
  });

  /** Hide stroke angle when gradient follows the line path itself. */
  readonly hideStrokeAngle = computed(() => {
    const t = this.selected()?.type ?? this.drawing.tool();
    return (
      this.drawing.strokeMode() === 'gradient' && (t === 'line' || t === 'freehand')
    );
  });

  readonly fillBoundSteps = computed(() =>
    regionStepCount(
      this.selected(),
      this.drawing.tool(),
      this.drawing.effectParams(),
      this.drawing.fillPresetId(),
    ),
  );

  readonly strokeBoundSteps = computed(() =>
    regionStepCount(this.selected(), this.drawing.tool(), this.drawing.effectParams(), null),
  );

  /** CSS background for the fill mode swatch. */
  readonly fillPreviewCss = computed(() => {
    const mode = this.drawing.fillMode();
    if (mode === 'none') {
      return 'repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 0 0 / 8px 8px';
    }
    if (mode === 'solid') return this.drawing.fillColor();
    return gradientPreviewCss(
      this.drawing.fillAngle(),
      this.drawing.fillGradientFrom(),
      this.drawing.fillGradientTo(),
      this.drawing.fillPaletteStops() ?? undefined,
      this.drawing.fillStepped(),
      this.drawing.fillSteps(),
    );
  });

  /** CSS background for the stroke mode swatch. */
  readonly strokePreviewCss = computed(() => {
    const mode = this.drawing.strokeMode();
    if (mode === 'none') {
      return 'repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 0 0 / 8px 8px';
    }
    if (mode === 'solid') return this.drawing.strokeColor();
    return gradientPreviewCss(
      this.drawing.strokeAngle(),
      this.drawing.strokeColor(),
      this.drawing.strokeEndColor(),
      this.drawing.strokePaletteStops() ?? undefined,
      this.drawing.strokeStepped(),
      this.drawing.strokeSteps(),
    );
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

  layerComplexity(s: Shape): number {
    return shapeComplexityCount(s);
  }

  layerComplexityClass(s: Shape): string {
    return `layer-chip--${complexityLevel(shapeComplexityCount(s))}`;
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

  duplicateLayer(id: string, ev: Event): void {
    ev.stopPropagation();
    this.drawing.duplicateShape(id);
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
    const stops = this.drawing.strokePaletteStops();
    if (stops?.length) {
      const next = [...stops];
      next[0] = v;
      this.drawing.strokePaletteStops.set(next);
    }
    if (this.drawing.strokeMode() === 'gradient') {
      this.syncStrokeGradient();
    } else if (this.selected()) {
      this.drawing.updateSelectedStyle({ stroke: v });
    }
  }

  onStrokeEnd(v: string): void {
    this.drawing.strokeEndColor.set(v);
    this.drawing.strokePresetId.set(null);
    const stops = this.drawing.strokePaletteStops();
    if (stops?.length) {
      const next = [...stops];
      next[next.length - 1] = v;
      this.drawing.strokePaletteStops.set(next);
    }
    this.syncStrokeGradient();
  }

  onFill(v: string): void {
    this.drawing.fillColor.set(v);
    if (this.selected()) this.drawing.updateSelectedStyle({ fill: v });
  }

  onWidth(v: string | number): void {
    const n = Math.min(200, Math.max(1, Math.round(Number(v))));
    this.drawing.strokeWidth.set(n);
    if (this.selected()) this.drawing.updateSelectedStyle({ strokeWidth: n });
  }

  onOpacity(v: string | number): void {
    const n = Math.min(1, Math.max(0, Number(v)));
    this.drawing.opacity.set(n);
    if (this.selected()) this.drawing.updateSelectedStyle({ opacity: n });
  }

  /** Deckkraft as 0–100 for the spinner (±1 %). */
  opacityPercent(): number {
    return Math.round((this.selected()?.style.opacity ?? this.drawing.opacity()) * 100);
  }

  onOpacityPercent(v: string | number): void {
    this.onOpacity(Number(v) / 100);
  }

  onStrokeMode(mode: StylePaintMode): void {
    this.drawing.strokeMode.set(mode);
    if (mode === 'gradient') {
      this.syncStrokeGradient();
    } else if (this.selected()) {
      this.drawing.updateSelectedStyle({
        strokeMode: mode,
        strokeGradient: undefined,
        stroke: mode === 'none' ? 'none' : this.drawing.strokeColor(),
      });
    }
  }

  onFillMode(mode: StylePaintMode): void {
    this.drawing.fillMode.set(mode);
    if (mode === 'gradient') {
      this.syncFillGradient();
    } else if (mode === 'none') {
      this.drawing.fillPaletteStops.set(null);
      if (this.selected()) {
        this.drawing.updateSelectedStyle({ fillMode: 'none', fill: 'none', fillGradient: undefined });
      }
    } else {
      this.drawing.fillPaletteStops.set(null);
      if (this.selected()) {
        this.drawing.updateSelectedStyle({
          fillMode: 'solid',
          fill: this.drawing.fillColor(),
          fillGradient: undefined,
        });
      }
    }
  }

  syncFillGradient(): void {
    const bound = this.fillBoundSteps();
    if (bound != null) {
      this.drawing.fillSteps.set(bound);
    }
    if (this.selected()) {
      this.drawing.updateSelectedStyle(this.drawing.buildFillGradientPatch());
    }
  }

  syncStrokeGradient(): void {
    const bound = this.strokeBoundSteps();
    if (bound != null) {
      this.drawing.strokeSteps.set(bound);
    }
    if (this.selected()) {
      this.drawing.updateSelectedStyle(this.drawing.buildStrokeGradientPatch());
    }
  }

  rerollFillPalette(): void {
    const id = this.drawing.fillPresetId();
    if (id !== 'neon' && id !== 'random') return;
    const seed = (Math.random() * 0xffffffff) >>> 0;
    const stops = pickFillStops(id, seed);
    this.drawing.fillPaletteStops.set(stops);
    this.drawing.fillGradientFrom.set(stops[0]);
    this.drawing.fillGradientTo.set(stops[stops.length - 1]);
    this.syncFillGradient();
  }

  rerollStrokePalette(): void {
    const id = this.drawing.strokePresetId();
    if (id !== 'neon' && id !== 'random') return;
    const seed = (Math.random() * 0xffffffff) >>> 0;
    const stops = pickFillStops(id, seed);
    this.drawing.strokePaletteStops.set(stops);
    this.drawing.strokeColor.set(stops[0]);
    this.drawing.strokeEndColor.set(stops[stops.length - 1]);
    this.syncStrokeGradient();
  }

  onFillRerollPreset(id: string): void {
    this.openFillPreset.set(false);
    this.drawing.applyFillPreset(id);
    this.syncFillGradient();
  }

  onStrokeRerollPreset(id: string): void {
    this.openStrokePreset.set(false);
    this.drawing.applyStrokePreset(id);
    this.syncStrokeGradient();
  }

  onFillPreset(id: string): void {
    this.openFillPreset.set(false);
    this.drawing.applyFillPreset(id || null);
    this.syncFillGradient();
  }

  onStrokePreset(id: string): void {
    this.openStrokePreset.set(false);
    this.drawing.applyStrokePreset(id || null);
    this.syncStrokeGradient();
  }

  onFillGradFrom(v: string): void {
    this.drawing.fillGradientFrom.set(v);
    this.drawing.fillPresetId.set(null);
    const stops = this.drawing.fillPaletteStops();
    if (stops?.length) {
      const next = [...stops];
      next[0] = v;
      this.drawing.fillPaletteStops.set(next);
    }
    this.syncFillGradient();
  }

  onFillGradTo(v: string): void {
    this.drawing.fillGradientTo.set(v);
    this.drawing.fillPresetId.set(null);
    const stops = this.drawing.fillPaletteStops();
    if (stops?.length) {
      const next = [...stops];
      next[next.length - 1] = v;
      this.drawing.fillPaletteStops.set(next);
    }
    this.syncFillGradient();
  }

  swapFillGradientColors(): void {
    const from = this.drawing.fillGradientFrom();
    const to = this.drawing.fillGradientTo();
    this.drawing.fillGradientFrom.set(to);
    this.drawing.fillGradientTo.set(from);
    const stops = this.drawing.fillPaletteStops();
    if (stops?.length) {
      this.drawing.fillPaletteStops.set([...stops].reverse());
    }
    this.syncFillGradient();
  }

  swapStrokeGradientColors(): void {
    const from = this.drawing.strokeColor();
    const to = this.drawing.strokeEndColor();
    this.drawing.strokeColor.set(to);
    this.drawing.strokeEndColor.set(from);
    const stops = this.drawing.strokePaletteStops();
    if (stops?.length) {
      this.drawing.strokePaletteStops.set([...stops].reverse());
    }
    this.syncStrokeGradient();
  }

  onFillStepped(v: boolean): void {
    this.drawing.fillStepped.set(v);
    this.syncFillGradient();
  }

  onFillSteps(v: number): void {
    this.drawing.fillSteps.set(Math.max(2, Math.min(64, Math.round(v))));
    this.syncFillGradient();
  }

  onStrokeStepped(v: boolean): void {
    this.drawing.strokeStepped.set(v);
    this.syncStrokeGradient();
  }

  onStrokeSteps(v: number): void {
    this.drawing.strokeSteps.set(Math.max(2, Math.min(64, Math.round(v))));
    this.syncStrokeGradient();
  }

  onStrokeGlowEnabled(v: boolean): void {
    this.drawing.strokeGlowEnabled.set(v);
    this.syncStrokeGlow();
  }

  onStrokeGlowColor(v: string): void {
    this.drawing.strokeGlowColor.set(v);
    this.syncStrokeGlow();
  }

  onStrokeGlowWidth(v: number): void {
    this.drawing.strokeGlowWidth.set(Math.max(1, Math.min(80, Math.round(v))));
    this.syncStrokeGlow();
  }

  onStrokeGlowOpacity(v: number): void {
    this.drawing.strokeGlowOpacity.set(Math.min(1, Math.max(0, v)));
    this.syncStrokeGlow();
  }

  private syncStrokeGlow(): void {
    if (!this.selected()) return;
    if (!this.drawing.strokeGlowEnabled()) {
      this.drawing.updateSelectedStyle({ strokeGlow: undefined });
      return;
    }
    this.drawing.updateSelectedStyle({
      strokeGlow: {
        color: this.drawing.strokeGlowColor(),
        width: this.drawing.strokeGlowWidth(),
        opacity: this.drawing.strokeGlowOpacity(),
      },
    });
  }

  fillStepsReadonly(): boolean {
    return this.fillBoundSteps() != null;
  }

  strokeStepsReadonly(): boolean {
    return this.strokeBoundSteps() != null;
  }

  fillStepsValue(): number {
    return this.fillBoundSteps() ?? this.drawing.fillSteps();
  }

  strokeStepsValue(): number {
    return this.strokeBoundSteps() ?? this.drawing.strokeSteps();
  }

  fillStepsHint(): string {
    const n = this.fillBoundSteps();
    return n != null ? `An Regionen der Form gekoppelt (${n})` : '';
  }

  strokeStepsHint(): string {
    const n = this.strokeBoundSteps();
    return n != null ? `An Regionen der Form gekoppelt (${n})` : '';
  }

  onFillAngle(v: string | number): void {
    this.drawing.fillAngle.set(Number(v));
    this.syncFillGradient();
  }

  onStrokeAngle(v: string | number): void {
    this.drawing.strokeAngle.set(Number(v));
    this.syncStrokeGradient();
  }

  onRotation(v: string | number): void {
    const n = Math.min(360, Math.max(0, Number(v)));
    this.drawing.updateSelectedTransform({ rotation: n });
  }

  onScale(v: string | number): void {
    const n = Math.min(4, Math.max(0.1, Number(v)));
    this.drawing.updateSelectedTransform({ scaleX: n, scaleY: n });
  }

  updateParam(key: string, value: string | number): void {
    const n =
      typeof value === 'string' && value !== '' && !Number.isNaN(Number(value))
        ? Number(value)
        : value;
    this.drawing.updateSelectedParams({ [key]: n });
  }

  /**
   * Patch params on the selected shape when it matches `type`, and always
   * sync effect defaults so the next draw uses the values.
   */
  patchToolParam(
    type:
      | 'octopus'
      | 'multiStar'
      | 'randomStar'
      | 'circleLine'
      | 'circles'
      | 'sunflower'
      | 'rainbow'
      | 'star',
    key: string,
    value: string | number,
  ): void {
    let coerced: string | number =
      type === 'rainbow' && key === 'mode'
        ? value
        : typeof value === 'number'
          ? value
          : Number(value);
    if (type === 'star' && key === 'points') {
      coerced = Math.max(3, Math.min(24, Math.round(Number(coerced))));
    }
    const s = this.selected();
    if (s?.type === type) {
      this.drawing.updateSelectedParams({ [key]: coerced });
    }
    this.drawing.effectParams.update((ep) => ({
      ...ep,
      [type]: { ...ep[type], [key]: coerced },
    }));
  }

  octParams(): Pick<OctopusParams, 'arms' | 'circles' | 'curve'> {
    const s = this.selected();
    if (s?.type === 'octopus') {
      const p = s.params as OctopusParams;
      return { arms: p.arms, circles: p.circles, curve: p.curve };
    }
    return this.drawing.effectParams().octopus;
  }

  multiParams(): Pick<MultiStarParams, 'mode' | 'arms' | 'stages' | 'step'> {
    const s = this.selected();
    if (s?.type === 'multiStar') {
      const p = s.params as MultiStarParams;
      return { mode: p.mode, arms: p.arms, stages: p.stages, step: p.step };
    }
    return this.drawing.effectParams().multiStar;
  }

  randomParams(): Pick<RandomStarParams, 'arms' | 'radius'> {
    const s = this.selected();
    if (s?.type === 'randomStar') {
      const p = s.params as RandomStarParams;
      return { arms: p.arms, radius: p.radius };
    }
    return this.drawing.effectParams().randomStar;
  }

  starParams(): Pick<StarParams, 'points'> {
    const s = this.selected();
    if (s?.type === 'star') {
      return { points: (s.params as StarParams).points };
    }
    return this.drawing.effectParams().star;
  }

  circleLineParams(): Pick<CircleLineParams, 'arms'> {
    const s = this.selected();
    if (s?.type === 'circleLine') {
      return { arms: (s.params as CircleLineParams).arms };
    }
    return this.drawing.effectParams().circleLine;
  }

  circlesParams(): Pick<CirclesParams, 'count' | 'sizeMultiply'> {
    const s = this.selected();
    if (s?.type === 'circles') {
      const p = s.params as CirclesParams;
      return { count: p.count, sizeMultiply: p.sizeMultiply };
    }
    return this.drawing.effectParams().circles;
  }

  sunflowerParams(): Pick<SunflowerParams, 'petals' | 'seedRings'> {
    const s = this.selected();
    if (s?.type === 'sunflower') {
      const p = s.params as SunflowerParams;
      return { petals: p.petals, seedRings: p.seedRings };
    }
    return this.drawing.effectParams().sunflower;
  }

  rainbowParams(): { mode: RainbowMode; bandWidth: number } {
    const s = this.selected();
    if (s?.type === 'rainbow') {
      const p = s.params as RainbowParams;
      return { mode: p.mode, bandWidth: p.bandWidth };
    }
    const ep = this.drawing.effectParams().rainbow;
    return { mode: ep.mode, bandWidth: ep.bandWidth ?? 48 };
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
    this.patchToolParam('rainbow', 'mode', mode);
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
    const n = Math.min(1, Math.max(-1, Number(v)));
    this.patchFirework({ wind: n });
  }
}
