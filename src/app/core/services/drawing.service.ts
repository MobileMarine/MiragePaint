import { Injectable, computed, effect, signal } from '@angular/core';
import {
  CirclesParams,
  CircleLineParams,
  DocumentMeta,
  DrawingDocument,
  EllipseParams,
  FillMode,
  FireworkParams,
  FireworkScheme,
  FireworkVariant,
  FreehandParams,
  GradientCircleParams,
  GradientParams,
  GroupParams,
  HeartParams,
  ImportedVectorParams,
  ImportedVectorPath,
  LineParams,
  MultiStarParams,
  OctopusParams,
  Point2D,
  RainbowParams,
  RandomStarParams,
  RectParams,
  RegularPolygonParams,
  Shape,
  ShapeType,
  StarParams,
  StrokeMode,
  StyleProps,
  SunflowerParams,
  ToolId,
  Transform2D,
  TriangleParams,
  VectorPathParams,
  CenterLinesParams,
  createStyle,
  createTransform,
  normalizeStyle,
  newShapeId,
} from '../models/shape';
import { getAngle } from '../math/polar';
import { normalizeRect, triangleFromDrag } from '../generators/shapes';
import { HistoryService } from './history.service';
import { UiPrefsService } from './ui-prefs.service';
import { worldBoundsForShape } from '../render/geometry';
import { COLOR_PRESETS, presetById } from '../style/presets';
import { pickFillStops } from '../style/firework-palettes';
import { regionStepCount } from '../style/region-steps';

const DEFAULT_META: DocumentMeta = {
  background: '',
  name: 'Ohne Titel',
};

const EFFECT_DEFAULTS = {
  octopus: { arms: 5, circles: 40, curve: 2, radiusX: 80, radiusY: 80 },
  multiStar: { arms: 4, radius: 200, stages: 30, step: 8, mode: 3 as const },
  randomStar: { arms: 200, radius: 300 },
  circleLine: { arms: 72, radius: 250 },
  circles: { mode: 2 as const, count: 20, sizeMultiply: 1.15, offset: 0.05, width: 40, height: 40 },
  sunflower: { petals: 18, seedRings: 4 },
  firework: {
    variant: 'chrysanthemum' as FireworkVariant,
    trails: 72,
    scheme: 'neon' as FireworkScheme,
    dotTrails: false,
    wind: 0,
  },
  rainbow: { mode: 'gradient' as const, bandWidth: 48 },
  star: { points: 5, innerRatio: 0.45 },
};

@Injectable({ providedIn: 'root' })
export class DrawingService {
  readonly shapes = signal<Shape[]>([]);
  readonly selectedIds = signal<string[]>([]);
  readonly tool = signal<ToolId>('select');
  readonly zoom = signal(1);
  readonly pan = signal<Point2D>({ x: 0, y: 0 });
  readonly meta = signal<DocumentMeta>({ ...DEFAULT_META });
  readonly strokeColor = signal('#1a1a1a');
  readonly fillColor = signal('#c45c26');
  readonly strokeEndColor = signal('#1a1a1a');
  readonly strokeWidth = signal(2);
  readonly opacity = signal(1);
  readonly fillMode = signal<FillMode>('solid');
  readonly strokeMode = signal<StrokeMode>('solid');
  readonly fillPresetId = signal<string | null>(null);
  readonly strokePresetId = signal<string | null>(null);
  readonly fillAngle = signal(0);
  readonly strokeAngle = signal(0);
  readonly fillGradientFrom = signal('#c45c26');
  readonly fillGradientTo = signal('#f7c948');
  /** Cached multi-stop palette for neon / random (stable across drag redraws). */
  readonly fillPaletteStops = signal<string[] | null>(null);
  readonly strokePaletteStops = signal<string[] | null>(null);
  readonly fillStepped = signal(false);
  readonly fillSteps = signal(8);
  readonly strokeStepped = signal(false);
  readonly strokeSteps = signal(8);
  readonly strokeGlowEnabled = signal(false);
  readonly strokeGlowColor = signal('#ffffff');
  readonly strokeGlowWidth = signal(8);
  readonly strokeGlowOpacity = signal(0.55);
  readonly darkMode = signal(false);
  readonly collapsedSections = signal<Record<string, boolean>>({});
  readonly draft = signal<Shape | null>(null);

  readonly effectParams = signal({ ...EFFECT_DEFAULTS });

  readonly colorPresets = COLOR_PRESETS;

  readonly selectedId = computed(() => this.selectedIds()[0] ?? null);

  readonly selectedShape = computed(() => {
    const id = this.selectedId();
    return this.shapes().find((s) => s.id === id) ?? null;
  });

  readonly selectedShapes = computed(() => {
    const ids = new Set(this.selectedIds());
    return this.shapes().filter((s) => ids.has(s.id));
  });

  readonly canGroup = computed(() => this.selectedIds().length >= 2);

  readonly canUngroup = computed(() => {
    const s = this.selectedShape();
    if (!s || this.selectedIds().length !== 1) return false;
    if (s.type === 'group') return true;
    if (s.type === 'importedVector') {
      return (s.params as ImportedVectorParams).paths.length > 1;
    }
    return false;
  });

  readonly canUndo = computed(() => this.history.canUndo());
  readonly canRedo = computed(() => this.history.canRedo());

  private fireworkRaf = 0;
  private fireworkAnimStart = 0;
  private fireworkAwaitCommit = false;

  constructor(
    private readonly history: HistoryService,
    private readonly uiPrefs: UiPrefsService,
  ) {
    this.collapsedSections.set(this.uiPrefs.defaultCollapsed());
    this.restoreUiPrefs();
    this.pushSnapshot(false);

    effect(() => {
      this.uiPrefs.save({
        zoom: this.zoom(),
        pan: this.pan(),
        tool: this.tool(),
        strokeColor: this.strokeColor(),
        strokeEndColor: this.strokeEndColor(),
        fillColor: this.fillColor(),
        strokeWidth: this.strokeWidth(),
        opacity: this.opacity(),
        fillMode: this.fillMode(),
        strokeMode: this.strokeMode(),
        fillPresetId: this.fillPresetId(),
        strokePresetId: this.strokePresetId(),
        fillAngle: this.fillAngle(),
        strokeAngle: this.strokeAngle(),
        fillGradientFrom: this.fillGradientFrom(),
        fillGradientTo: this.fillGradientTo(),
        effectParams: this.effectParams(),
        collapsedSections: this.collapsedSections(),
        darkMode: this.darkMode(),
      });
    });

    effect(() => {
      document.documentElement.classList.toggle('dark', this.darkMode());
    });
  }

  private restoreUiPrefs(): void {
    const p = this.uiPrefs.load();
    if (!p) return;
    if (typeof p.zoom === 'number') this.zoom.set(Math.min(8, Math.max(0.1, p.zoom)));
    if (p.pan && typeof p.pan.x === 'number' && typeof p.pan.y === 'number') {
      this.pan.set({ x: p.pan.x, y: p.pan.y });
    }
    if (p.tool === 'gradient' || p.tool === 'gradientCircle') {
      this.tool.set('rect');
    } else if (p.tool) {
      this.tool.set(p.tool);
    }
    if (p.strokeColor) this.strokeColor.set(p.strokeColor);
    if (p.strokeEndColor) this.strokeEndColor.set(p.strokeEndColor);
    if (p.fillColor) this.fillColor.set(p.fillColor);
    if (typeof p.strokeWidth === 'number') this.strokeWidth.set(p.strokeWidth);
    if (typeof p.opacity === 'number') this.opacity.set(p.opacity);
    if (p.fillMode) {
      const legacy = p.fillMode as string;
      if (
        legacy === 'rainbowGradient' ||
        legacy === 'rainbowStripes' ||
        legacy === 'neon' ||
        legacy === 'random'
      ) {
        this.fillMode.set('gradient');
        const presetId =
          legacy === 'rainbowGradient' || legacy === 'rainbowStripes'
            ? 'rainbow'
            : legacy;
        this.fillPresetId.set(presetId);
        this.fillStepped.set(legacy === 'rainbowStripes');
        if (legacy === 'rainbowStripes') this.fillSteps.set(6);
      } else if (legacy === 'none' || legacy === 'solid' || legacy === 'gradient') {
        this.fillMode.set(legacy);
        if (p.fillPresetId === 'rainbow-stripes') {
          this.fillPresetId.set('rainbow');
          this.fillStepped.set(true);
          this.fillSteps.set(6);
        } else if (p.fillPresetId !== undefined) {
          this.fillPresetId.set(p.fillPresetId);
        }
      }
    } else if (p.fillPresetId === 'rainbow-stripes') {
      this.fillPresetId.set('rainbow');
      this.fillStepped.set(true);
      this.fillSteps.set(6);
    } else if (p.fillPresetId !== undefined) {
      this.fillPresetId.set(p.fillPresetId);
    }
    if (p.strokeMode) {
      const sm = p.strokeMode as string;
      if (sm === 'none' || sm === 'solid' || sm === 'gradient') {
        this.strokeMode.set(sm);
      }
    }
    if (p.strokePresetId !== undefined) this.strokePresetId.set(p.strokePresetId);
    if (typeof p.fillAngle === 'number') this.fillAngle.set(p.fillAngle);
    if (typeof p.strokeAngle === 'number') this.strokeAngle.set(p.strokeAngle);
    if (p.fillGradientFrom) this.fillGradientFrom.set(p.fillGradientFrom);
    if (p.fillGradientTo) this.fillGradientTo.set(p.fillGradientTo);
    if (p.effectParams && typeof p.effectParams === 'object') {
      this.effectParams.set({ ...EFFECT_DEFAULTS, ...(p.effectParams as typeof EFFECT_DEFAULTS) });
    }
    if (p.collapsedSections) {
      this.collapsedSections.set({
        ...this.uiPrefs.defaultCollapsed(),
        ...p.collapsedSections,
      });
    }
    if (typeof p.darkMode === 'boolean') this.darkMode.set(p.darkMode);
  }

  toggleDarkMode(): void {
    this.darkMode.update((v) => !v);
  }

  toggleSection(id: string): void {
    this.collapsedSections.update((m) => ({ ...m, [id]: !m[id] }));
  }

  isSectionCollapsed(id: string): boolean {
    return !!this.collapsedSections()[id];
  }

  setTool(tool: ToolId): void {
    this.tool.set(tool);
    if (tool !== 'select') {
      this.selectedIds.set([]);
    }
  }

  setZoom(z: number): void {
    this.zoom.set(Math.min(8, Math.max(0.1, z)));
  }

  zoomAt(factor: number, screenPoint: Point2D): void {
    const oldZ = this.zoom();
    const newZ = Math.min(8, Math.max(0.1, oldZ * factor));
    if (newZ === oldZ) return;
    const pan = this.pan();
    // Keep world under screenPoint stable: world = (screen - pan) / zoom
    const worldX = (screenPoint.x - pan.x) / oldZ;
    const worldY = (screenPoint.y - pan.y) / oldZ;
    this.zoom.set(newZ);
    this.pan.set({
      x: screenPoint.x - worldX * newZ,
      y: screenPoint.y - worldY * newZ,
    });
  }

  zoomBy(factor: number): void {
    this.setZoom(this.zoom() * factor);
  }

  setPan(p: Point2D): void {
    this.pan.set(p);
  }

  clearDocument(): void {
    this.stopFireworkAnim();
    this.fireworkAwaitCommit = false;
    this.shapes.set([]);
    this.selectedIds.set([]);
    this.draft.set(null);
    this.meta.update((m) => ({ ...m, name: 'Ohne Titel' }));
    this.pushSnapshot();
  }

  addImportedVector(
    paths: { d: string; fill: string; gradient?: ImportedVectorPath['gradient'] }[],
    width: number,
    height: number,
    at?: Point2D,
  ): string {
    const id = newShapeId();
    const x = at?.x ?? -width / 2;
    const y = at?.y ?? -height / 2;
    const shape: Shape = {
      id,
      type: 'importedVector',
      style: createStyle('none', 'none', 0, 1),
      transform: createTransform(x, y),
      params: { paths, width, height },
    };
    this.shapes.update((list) => [...list, shape]);
    this.selectedIds.set([id]);
    this.tool.set('select');
    this.pushSnapshot();
    return id;
  }

  /** Add a group of native shapes (from shape recognition) centered at `at`. */
  addShapeGroup(children: Shape[], width: number, height: number, at?: Point2D): string {
    const id = newShapeId();
    const x = at?.x ?? -width / 2;
    const y = at?.y ?? -height / 2;
    const cloned = children.map((c) => ({
      ...structuredClone(c),
      id: newShapeId(),
    }));
    const shape: Shape = {
      id,
      type: 'group',
      style: createStyle('none', 'none', 0, 1),
      transform: createTransform(x, y),
      params: { children: cloned } satisfies GroupParams,
    };
    this.shapes.update((list) => [...list, shape]);
    this.selectedIds.set([id]);
    this.tool.set('select');
    this.pushSnapshot();
    return id;
  }

  selectShape(id: string | null, opts?: { toggle?: boolean }): void {
    this.tool.set('select');
    if (!id) {
      this.selectedIds.set([]);
      return;
    }
    if (opts?.toggle) {
      const cur = this.selectedIds();
      if (cur.includes(id)) {
        this.selectedIds.set(cur.filter((x) => x !== id));
      } else {
        this.selectedIds.set([...cur, id]);
      }
    } else {
      this.selectedIds.set([id]);
    }
    const primary = this.selectedShape();
    if (primary) {
      const st = normalizeStyle(primary.style);
      this.strokeColor.set(st.stroke);
      this.fillColor.set(
        st.fill === 'none' || st.fill === 'transparent' ? this.fillColor() : st.fill,
      );
      this.strokeWidth.set(st.strokeWidth);
      this.opacity.set(st.opacity ?? 1);
      if (st.strokeEnd) this.strokeEndColor.set(st.strokeEnd);
      this.strokeMode.set(st.strokeMode);
      this.fillMode.set(st.fillMode);
      this.strokeAngle.set(st.strokeAngle ?? 0);
      if (st.fillGradient) {
        this.fillAngle.set(st.fillGradient.angle);
        this.fillGradientFrom.set(st.fillGradient.from);
        this.fillGradientTo.set(st.fillGradient.to);
        this.fillPresetId.set(st.fillGradient.presetId ?? null);
        this.fillPaletteStops.set(st.fillGradient.stops ?? null);
        this.fillStepped.set(!!st.fillGradient.stepped);
        if (st.fillGradient.steps != null) this.fillSteps.set(st.fillGradient.steps);
      } else {
        this.fillPaletteStops.set(null);
        this.fillStepped.set(false);
      }
      if (st.strokeGradient) {
        this.strokePresetId.set(st.strokeGradient.presetId ?? null);
        this.strokePaletteStops.set(st.strokeGradient.stops ?? null);
        this.strokeStepped.set(!!st.strokeGradient.stepped);
        if (st.strokeGradient.steps != null) this.strokeSteps.set(st.strokeGradient.steps);
      } else {
        this.strokePaletteStops.set(null);
        this.strokeStepped.set(false);
      }
      if (st.strokeGlow) {
        this.strokeGlowEnabled.set(true);
        this.strokeGlowColor.set(st.strokeGlow.color);
        this.strokeGlowWidth.set(st.strokeGlow.width);
        this.strokeGlowOpacity.set(st.strokeGlow.opacity);
      } else {
        this.strokeGlowEnabled.set(false);
      }
    }
  }

  reorderShape(fromIndex: number, toIndex: number): void {
    const list = [...this.shapes()];
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= list.length ||
      toIndex >= list.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const [item] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, item);
    this.shapes.set(list);
    this.pushSnapshot();
  }

  applyFillPreset(presetId: string | null): void {
    this.fillPresetId.set(presetId);
    const p = presetById(presetId);
    if (!p) return;
    const stops = p.stops && p.stops.length >= 2 ? [...p.stops] : [p.from, p.to];
    this.fillGradientFrom.set(stops[0]);
    this.fillGradientTo.set(stops[stops.length - 1]);
    this.fillPaletteStops.set(stops);
    this.fillStepped.set(!!p.stepped);
    if (p.steps != null) this.fillSteps.set(p.steps);
    else if (p.stepped) this.fillSteps.set(stops.length);
    this.fillMode.set('gradient');
    if (p.kind === 'neon' || p.kind === 'random') {
      const seed = (Math.random() * 0xffffffff) >>> 0;
      const rolled = pickFillStops(p.kind, seed);
      this.fillPaletteStops.set(rolled);
      this.fillGradientFrom.set(rolled[0]);
      this.fillGradientTo.set(rolled[rolled.length - 1]);
    }
    if (this.selectedShape()) {
      this.updateSelectedStyle(this.buildFillGradientPatch());
    }
  }

  applyStrokePreset(presetId: string | null): void {
    this.strokePresetId.set(presetId);
    if (!presetId) {
      this.strokePaletteStops.set(null);
      return;
    }
    const p = presetById(presetId);
    if (!p) return;
    let stops = p.stops && p.stops.length >= 2 ? [...p.stops] : [p.from, p.to];
    if (p.kind === 'neon' || p.kind === 'random') {
      const seed = (Math.random() * 0xffffffff) >>> 0;
      stops = pickFillStops(p.kind, seed);
    }
    this.strokeColor.set(stops[0]);
    this.strokeEndColor.set(stops[stops.length - 1]);
    this.strokePaletteStops.set(stops);
    this.strokeStepped.set(!!p.stepped);
    if (p.steps != null) this.strokeSteps.set(p.steps);
    else if (p.stepped) this.strokeSteps.set(stops.length);
    this.strokeMode.set('gradient');
    if (this.selectedShape()) {
      this.updateSelectedStyle(this.buildStrokeGradientPatch());
    }
  }

  /** Rebuild fill gradient style patch from current signals. */
  buildFillGradientPatch(): Partial<StyleProps> {
    const stops = this.fillPaletteStops();
    return {
      fillMode: 'gradient',
      fill: stops?.[0] ?? this.fillGradientFrom(),
      fillGradient: {
        angle: this.fillAngle(),
        from: this.fillGradientFrom(),
        to: this.fillGradientTo(),
        presetId: this.fillPresetId() ?? undefined,
        stops: stops && stops.length >= 2 ? stops : undefined,
        stepped: this.fillStepped(),
        steps: this.fillSteps(),
      },
    };
  }

  buildStrokeGradientPatch(): Partial<StyleProps> {
    const stops = this.strokePaletteStops();
    return {
      strokeMode: 'gradient',
      stroke: this.strokeColor(),
      strokeEnd: this.strokeEndColor(),
      strokeAngle: this.strokeAngle(),
      strokeGradient: {
        angle: this.strokeAngle(),
        from: this.strokeColor(),
        to: this.strokeEndColor(),
        presetId: this.strokePresetId() ?? undefined,
        stops: stops && stops.length >= 2 ? stops : undefined,
        stepped: this.strokeStepped(),
        steps: this.strokeSteps(),
      },
    };
  }

  deleteSelected(): void {
    const ids = new Set(this.selectedIds());
    if (!ids.size) return;
    this.shapes.update((list) => list.filter((s) => !ids.has(s.id)));
    this.selectedIds.set([]);
    this.pushSnapshot();
  }

  /** Clone selection with a small offset; selects the clones. */
  duplicateSelected(): void {
    const selected = this.selectedShapes();
    if (!selected.length) return;
    this.duplicateShapes(selected);
  }

  /** Clone a single shape by id (used from the layers list). */
  duplicateShape(id: string): void {
    const shape = this.shapes().find((s) => s.id === id);
    if (!shape) return;
    this.duplicateShapes([shape]);
  }

  private duplicateShapes(selected: Shape[]): void {
    const offset = 24;
    const clones = selected.map((s) => ({
      ...structuredClone(s),
      id: newShapeId(),
      transform: {
        ...s.transform,
        x: s.transform.x + offset,
        y: s.transform.y + offset,
      },
    }));
    this.shapes.update((list) => [...list, ...clones]);
    this.selectedIds.set(clones.map((c) => c.id));
    this.pushSnapshot();
  }

  groupSelected(): void {
    const selected = this.selectedShapes();
    if (selected.length < 2) return;

    let minX = Infinity;
    let minY = Infinity;
    for (const s of selected) {
      const b = worldBoundsForShape(s);
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
    }

    const children = selected.map((s) => ({
      ...structuredClone(s),
      id: newShapeId(),
      transform: {
        ...s.transform,
        x: s.transform.x - minX,
        y: s.transform.y - minY,
      },
    }));

    const groupId = newShapeId();
    const group: Shape = {
      id: groupId,
      type: 'group',
      style: createStyle('none', 'none', 0, 1),
      transform: createTransform(minX, minY),
      params: { children } satisfies GroupParams,
    };

    const remove = new Set(selected.map((s) => s.id));
    this.shapes.update((list) => [...list.filter((s) => !remove.has(s.id)), group]);
    this.selectedIds.set([groupId]);
    this.pushSnapshot();
  }

  ungroupSelected(): void {
    const s = this.selectedShape();
    if (!s || this.selectedIds().length !== 1) return;

    if (s.type === 'group') {
      const children = (s.params as GroupParams).children;
      const released = children.map((c) => ({
        ...structuredClone(c),
        id: newShapeId(),
        transform: {
          ...c.transform,
          x: s.transform.x + c.transform.x * s.transform.scaleX,
          y: s.transform.y + c.transform.y * s.transform.scaleY,
          scaleX: c.transform.scaleX * s.transform.scaleX,
          scaleY: c.transform.scaleY * s.transform.scaleY,
          rotation: c.transform.rotation + s.transform.rotation,
        },
      }));
      this.shapes.update((list) => [...list.filter((x) => x.id !== s.id), ...released]);
      this.selectedIds.set(released.map((r) => r.id));
      this.pushSnapshot();
      return;
    }

    if (s.type === 'importedVector') {
      const p = s.params as ImportedVectorParams;
      if (p.paths.length <= 1) return;
      const released = p.paths.map((path) => {
        const id = newShapeId();
        return {
          id,
          type: 'vectorPath' as const,
          style: { ...s.style },
          transform: { ...s.transform },
          params: {
            d: path.d,
            fill: path.fill,
            width: p.width,
            height: p.height,
            gradient: path.gradient,
          } satisfies VectorPathParams,
        };
      });
      this.shapes.update((list) => [...list.filter((x) => x.id !== s.id), ...released]);
      this.selectedIds.set(released.map((r) => r.id));
      this.pushSnapshot();
    }
  }

  updateSelectedStyle(partial: Partial<StyleProps>): void {
    const ids = new Set(this.selectedIds());
    if (!ids.size) return;
    this.shapes.update((list) =>
      list.map((s) => {
        if (!ids.has(s.id)) return s;
        const style = { ...s.style, ...partial };
        // Explicitly drop gradient data when switching to solid/none
        if (partial.fillMode === 'solid' || partial.fillMode === 'none') {
          delete style.fillGradient;
        }
        return { ...s, style };
      }),
    );
    this.pushSnapshot();
  }

  updateSelectedParams(partial: Record<string, unknown>): void {
    const id = this.selectedId();
    if (!id) return;
    this.shapes.update((list) =>
      list.map((s) =>
        s.id === id ? { ...s, params: { ...s.params, ...partial } as Shape['params'] } : s,
      ),
    );
    this.syncRegionBoundGradientSteps(id);
    this.pushSnapshot();
  }

  /** Keep stepped gradient band count in sync with region-linked shape params. */
  private syncRegionBoundGradientSteps(shapeId: string): void {
    const shape = this.shapes().find((s) => s.id === shapeId);
    if (!shape) return;
    const n = regionStepCount(shape, undefined, undefined, shape.style.fillGradient?.presetId);
    if (n == null) return;

    const stylePatch: Partial<StyleProps> = {};
    if (shape.style.fillMode === 'gradient' && shape.style.fillGradient) {
      this.fillStepped.set(true);
      this.fillSteps.set(n);
      stylePatch.fillGradient = { ...shape.style.fillGradient, stepped: true, steps: n };
    }
    if (shape.style.strokeMode === 'gradient' && shape.style.strokeGradient) {
      this.strokeStepped.set(true);
      this.strokeSteps.set(n);
      stylePatch.strokeGradient = { ...shape.style.strokeGradient, stepped: true, steps: n };
    }
    if (Object.keys(stylePatch).length) {
      this.shapes.update((list) =>
        list.map((s) =>
          s.id === shapeId ? { ...s, style: { ...s.style, ...stylePatch } } : s,
        ),
      );
    }
  }

  updateSelectedTransform(partial: Partial<Transform2D>, commit = true): void {
    const ids = this.selectedIds();
    if (!ids.length) return;
    // Move all selected by same delta when translating; scale/rotate primary only for simplicity
    if (partial.x !== undefined || partial.y !== undefined) {
      const primary = this.selectedShape();
      if (!primary) return;
      const dx = (partial.x ?? primary.transform.x) - primary.transform.x;
      const dy = (partial.y ?? primary.transform.y) - primary.transform.y;
      const idSet = new Set(ids);
      this.shapes.update((list) =>
        list.map((s) =>
          idSet.has(s.id)
            ? {
                ...s,
                transform: {
                  ...s.transform,
                  x: s.transform.x + dx,
                  y: s.transform.y + dy,
                  ...(ids[0] === s.id
                    ? {
                        rotation: partial.rotation ?? s.transform.rotation,
                        scaleX: partial.scaleX ?? s.transform.scaleX,
                        scaleY: partial.scaleY ?? s.transform.scaleY,
                      }
                    : {}),
                },
              }
            : s,
        ),
      );
    } else {
      const id = ids[0];
      this.shapes.update((list) =>
        list.map((s) =>
          s.id === id ? { ...s, transform: { ...s.transform, ...partial } } : s,
        ),
      );
    }
    if (commit) this.pushSnapshot();
  }

  commitTransform(): void {
    this.pushSnapshot();
  }

  beginStroke(point: Point2D): void {
    const tool = this.tool();
    if (tool === 'select') return;

    const style = this.currentStyle();
    const id = newShapeId();

    if (tool === 'freehand') {
      this.draft.set({
        id,
        type: 'freehand',
        style,
        transform: createTransform(),
        params: { points: [point] } satisfies FreehandParams,
      });
      return;
    }

    if (tool === 'centerLines') {
      this.draft.set({
        id,
        type: 'centerLines',
        style,
        transform: createTransform(point.x, point.y),
        params: { cx: 0, cy: 0, rays: [] } satisfies CenterLinesParams,
      });
      return;
    }

    if (tool === 'firework') {
      this.stopFireworkAnim();
      const ep = this.effectParams().firework;
      const scheme =
        this.fillPresetId() === 'neon' || this.fillPresetId() === 'random'
          ? (this.fillPresetId() as FireworkScheme)
          : ep.scheme;
      this.draft.set({
        id,
        type: 'firework',
        style,
        transform: createTransform(point.x, point.y),
        params: {
          seed: (Math.random() * 0xffffffff) >>> 0,
          radius: 40,
          wind: ep.wind ?? 0,
          variant: ep.variant,
          scheme,
          trails: ep.trails ?? 72,
          dotTrails: ep.dotTrails ?? false,
          animT: 0,
        } satisfies FireworkParams,
      });
      this.fireworkAwaitCommit = false;
      this.startFireworkAnim();
      return;
    }

    // Drag-based tools: store start in draft transform origin / params
    this.draft.set(this.createDragDraft(tool, id, point, style));
  }

  continueStroke(point: Point2D, start: Point2D, opts?: { constrainEqual?: boolean }): void {
    const d = this.draft();
    if (!d) return;

    if (d.type === 'freehand') {
      const params = d.params as FreehandParams;
      const last = params.points[params.points.length - 1];
      if (last && Math.hypot(point.x - last.x, point.y - last.y) < 1.5) return;
      this.draft.set({
        ...d,
        params: { points: [...params.points, point] },
      });
      return;
    }

    if (d.type === 'centerLines') {
      const local = { x: point.x - start.x, y: point.y - start.y };
      const params = d.params as CenterLinesParams;
      this.draft.set({
        ...d,
        params: { ...params, rays: [...params.rays, local] },
      });
      return;
    }

    if (d.type === 'firework') {
      const p = d.params as FireworkParams;
      const dist = Math.hypot(point.x - start.x, point.y - start.y);
      const wind = Math.max(-1, Math.min(1, (point.x - start.x) / Math.max(50, dist))) * 0.7;
      this.draft.set({
        ...d,
        params: {
          ...p,
          radius: Math.max(24, dist),
          wind,
        },
      });
      return;
    }

    this.draft.set(this.updateDragDraft(d, start, point, !!opts?.constrainEqual));
  }

  endStroke(point: Point2D, start: Point2D, opts?: { constrainEqual?: boolean }): void {
    const d = this.draft();
    if (!d) return;

    if (d.type === 'firework') {
      this.continueStroke(point, start);
      const cur = this.draft();
      const p = cur?.type === 'firework' ? (cur.params as FireworkParams) : null;
      this.fireworkAwaitCommit = true;
      if (p && (p.animT ?? 0) >= 1) {
        this.commitFireworkDraft();
      }
      return;
    }

    let finalShape = d;

    if (d.type === 'freehand') {
      const params = d.params as FreehandParams;
      if (params.points.length < 2) {
        this.draft.set(null);
        return;
      }
    } else if (d.type === 'centerLines') {
      const params = d.params as CenterLinesParams;
      if (params.rays.length < 1) {
        this.draft.set(null);
        return;
      }
    } else {
      finalShape = this.updateDragDraft(d, start, point, !!opts?.constrainEqual);
      if (this.isDegenerate(finalShape)) {
        this.draft.set(null);
        return;
      }
    }

    this.shapes.update((list) => [...list, finalShape]);
    this.draft.set(null);
    this.selectedIds.set([finalShape.id]);
    this.pushSnapshot();
  }

  private startFireworkAnim(): void {
    this.stopFireworkAnim();
    this.fireworkAnimStart = performance.now();
    const duration = 1100;
    const tick = (now: number) => {
      const d = this.draft();
      if (!d || d.type !== 'firework') {
        this.fireworkRaf = 0;
        return;
      }
      const t = Math.min(1, (now - this.fireworkAnimStart) / duration);
      const p = d.params as FireworkParams;
      this.draft.set({ ...d, params: { ...p, animT: t } });
      if (t >= 1) {
        this.fireworkRaf = 0;
        if (this.fireworkAwaitCommit) this.commitFireworkDraft();
        return;
      }
      this.fireworkRaf = requestAnimationFrame(tick);
    };
    this.fireworkRaf = requestAnimationFrame(tick);
  }

  private stopFireworkAnim(): void {
    if (this.fireworkRaf) {
      cancelAnimationFrame(this.fireworkRaf);
      this.fireworkRaf = 0;
    }
  }

  private commitFireworkDraft(): void {
    const d = this.draft();
    if (!d || d.type !== 'firework') {
      this.fireworkAwaitCommit = false;
      return;
    }
    const p = d.params as FireworkParams;
    if (p.radius < 16) {
      this.draft.set(null);
      this.fireworkAwaitCommit = false;
      this.stopFireworkAnim();
      return;
    }
    const { animT: _a, ...rest } = p;
    const final: Shape = {
      ...d,
      params: { ...rest, animT: undefined } satisfies FireworkParams,
    };
    this.stopFireworkAnim();
    this.shapes.update((list) => [...list, final]);
    this.draft.set(null);
    this.selectedIds.set([final.id]);
    this.fireworkAwaitCommit = false;
    this.pushSnapshot();
  }

  undo(): void {
    const prev = this.history.undo();
    if (prev) this.restoreSnapshot(prev);
  }

  redo(): void {
    const next = this.history.redo();
    if (next) this.restoreSnapshot(next);
  }

  toDocument(): DrawingDocument {
    return {
      version: 1,
      meta: this.meta(),
      shapes: this.shapes(),
    };
  }

  loadDocument(doc: DrawingDocument): void {
    this.stopFireworkAnim();
    this.fireworkAwaitCommit = false;
    this.meta.set({ ...DEFAULT_META, ...doc.meta });
    this.shapes.set(
      (doc.shapes ?? []).map((s) => ({
        ...s,
        style: normalizeStyle(s.style),
      })),
    );
    this.selectedIds.set([]);
    this.draft.set(null);
    this.history.reset();
    this.pushSnapshot(false);
  }

  private currentStyle(): StyleProps {
    const fillMode = this.fillMode();
    const strokeMode = this.strokeMode();
    const style = createStyle(
      this.strokeColor(),
      fillMode === 'none' ? 'none' : this.fillColor(),
      this.strokeWidth(),
      this.opacity(),
      this.strokeEndColor(),
    );
    style.strokeMode = strokeMode;
    style.strokeAngle = this.strokeAngle();
    style.fillMode = fillMode === 'none' || fillMode === 'solid' || fillMode === 'gradient'
      ? fillMode
      : 'solid';

    if (strokeMode === 'gradient') {
      Object.assign(style, this.buildStrokeGradientPatch());
    }
    if (this.strokeGlowEnabled()) {
      style.strokeGlow = {
        color: this.strokeGlowColor(),
        width: this.strokeGlowWidth(),
        opacity: this.strokeGlowOpacity(),
      };
    }

    if (fillMode === 'gradient') {
      let stops = this.fillPaletteStops();
      const preset = presetById(this.fillPresetId());
      if ((preset?.kind === 'neon' || preset?.kind === 'random') && !stops?.length) {
        const seed = (Math.random() * 0xffffffff) >>> 0;
        stops = pickFillStops(preset.kind, seed);
        this.fillPaletteStops.set(stops);
        this.fillGradientFrom.set(stops[0]);
        this.fillGradientTo.set(stops[stops.length - 1]);
      }
      Object.assign(style, this.buildFillGradientPatch());
      if (stops?.length) style.fill = stops[0];
    }
    return style;
  }

  private createDragDraft(
    tool: Exclude<ShapeType, 'importedVector' | 'vectorPath' | 'group' | 'polygon'>,
    id: string,
    start: Point2D,
    style: StyleProps,
  ): Shape {
    const ep = this.effectParams();
    const angle = 0;

    switch (tool) {
      case 'line':
        return {
          id,
          type: 'line',
          style,
          transform: createTransform(),
          params: { x1: start.x, y1: start.y, x2: start.x, y2: start.y } satisfies LineParams,
        };
      case 'rect':
        return {
          id,
          type: 'rect',
          style: { ...style, fill: style.fill === 'none' ? 'transparent' : style.fill },
          transform: createTransform(),
          params: { x: start.x, y: start.y, width: 0, height: 0 } satisfies RectParams,
        };
      case 'ellipse':
        return {
          id,
          type: 'ellipse',
          style: { ...style, fill: style.fill === 'none' ? 'transparent' : style.fill },
          transform: createTransform(),
          params: { cx: start.x, cy: start.y, rx: 0, ry: 0 } satisfies EllipseParams,
        };
      case 'triangle':
        return {
          id,
          type: 'triangle',
          style: { ...style, fill: style.fill === 'none' ? 'transparent' : style.fill },
          transform: createTransform(),
          params: {
            points: [
              { x: start.x, y: start.y },
              { x: start.x, y: start.y },
              { x: start.x, y: start.y },
            ],
          } satisfies TriangleParams,
        };
      case 'heart':
        return {
          id,
          type: 'heart',
          style: { ...style, fill: style.fill === 'none' ? 'transparent' : style.fill },
          transform: createTransform(),
          params: { x: start.x, y: start.y, width: 0, height: 0 } satisfies HeartParams,
        };
      case 'pentagon':
        return {
          id,
          type: 'pentagon',
          style: { ...style, fill: style.fill === 'none' ? 'transparent' : style.fill },
          transform: createTransform(),
          params: {
            cx: start.x,
            cy: start.y,
            radius: 0,
            rotation: -90,
          } satisfies RegularPolygonParams,
        };
      case 'hexagon':
        return {
          id,
          type: 'hexagon',
          style: { ...style, fill: style.fill === 'none' ? 'transparent' : style.fill },
          transform: createTransform(),
          params: {
            cx: start.x,
            cy: start.y,
            radius: 0,
            rotation: -90,
          } satisfies RegularPolygonParams,
        };
      case 'star': {
        const sp = this.effectParams().star;
        return {
          id,
          type: 'star',
          style: { ...style, fill: style.fill === 'none' ? 'transparent' : style.fill },
          transform: createTransform(),
          params: {
            cx: start.x,
            cy: start.y,
            radius: 0,
            rotation: -90,
            points: Math.max(3, Math.min(24, Math.round(sp.points ?? 5))),
            innerRatio: sp.innerRatio ?? 0.45,
          } satisfies StarParams,
        };
      }
      case 'gradient':
        return {
          id,
          type: 'gradient',
          style,
          transform: createTransform(),
          params: { x: start.x, y: start.y, width: 0, height: 0 } satisfies GradientParams,
        };
      case 'gradientCircle':
        return {
          id,
          type: 'gradientCircle',
          style,
          transform: createTransform(start.x, start.y),
          params: { cx: 0, cy: 0, rx: 0, ry: 0 } satisfies GradientCircleParams,
        };
      case 'octopus':
        return {
          id,
          type: 'octopus',
          style,
          transform: createTransform(start.x, start.y),
          params: {
            ...ep.octopus,
            startAngle: angle,
          } satisfies OctopusParams,
        };
      case 'multiStar':
        return {
          id,
          type: 'multiStar',
          style,
          transform: createTransform(start.x, start.y),
          params: { ...ep.multiStar, startAngle: angle } satisfies MultiStarParams,
        };
      case 'randomStar':
        return {
          id,
          type: 'randomStar',
          style,
          transform: createTransform(start.x, start.y),
          params: {
            arms: ep.randomStar.arms,
            radius: ep.randomStar.radius,
            seed: (Math.random() * 0xffffffff) >>> 0,
          } satisfies RandomStarParams,
        };
      case 'circleLine':
        return {
          id,
          type: 'circleLine',
          style,
          transform: createTransform(start.x, start.y),
          params: { ...ep.circleLine, startAngle: angle } satisfies CircleLineParams,
        };
      case 'circles':
        return {
          id,
          type: 'circles',
          style,
          transform: createTransform(start.x, start.y),
          params: { ...ep.circles, startAngle: angle } satisfies CirclesParams,
        };
      case 'sunflower':
        return {
          id,
          type: 'sunflower',
          style,
          transform: createTransform(start.x, start.y),
          params: {
            petals: ep.sunflower.petals,
            seedRings: ep.sunflower.seedRings,
            radius: 40,
            startAngle: angle,
          } satisfies SunflowerParams,
        };
      case 'rainbow': {
        const bandWidth = Math.max(
          12,
          ep.rainbow.bandWidth ?? style.strokeWidth * 8,
        );
        return {
          id,
          type: 'rainbow',
          style: { ...style, stroke: 'none', fill: 'none' },
          transform: createTransform(),
          params: {
            x1: start.x,
            y1: start.y,
            x2: start.x,
            y2: start.y,
            mode: ep.rainbow.mode,
            bandWidth,
          } satisfies RainbowParams,
        };
      }
      default:
        return {
          id,
          type: 'line',
          style,
          transform: createTransform(),
          params: { x1: start.x, y1: start.y, x2: start.x, y2: start.y },
        };
    }
  }

  private updateDragDraft(
    d: Shape,
    start: Point2D,
    end: Point2D,
    constrainEqual = false,
  ): Shape {
    const useEqual =
      constrainEqual &&
      (d.type === 'rect' ||
        d.type === 'ellipse' ||
        d.type === 'triangle' ||
        d.type === 'heart');
    const tip = useEqual ? equalAspectEnd(start, end) : end;
    const angle = getAngle(start, tip);
    const dist = Math.hypot(tip.x - start.x, tip.y - start.y);

    switch (d.type) {
      case 'line':
        return {
          ...d,
          params: { x1: start.x, y1: start.y, x2: end.x, y2: end.y } satisfies LineParams,
        };
      case 'rect': {
        const r = normalizeRect(start.x, start.y, tip.x, tip.y);
        return { ...d, params: r satisfies RectParams };
      }
      case 'ellipse': {
        const r = normalizeRect(start.x, start.y, tip.x, tip.y);
        return {
          ...d,
          params: {
            cx: r.x + r.width / 2,
            cy: r.y + r.height / 2,
            rx: r.width / 2,
            ry: r.height / 2,
          } satisfies EllipseParams,
        };
      }
      case 'triangle':
        return {
          ...d,
          params: {
            points: triangleFromDrag(start.x, start.y, tip.x, tip.y),
          } satisfies TriangleParams,
        };
      case 'heart': {
        const r = normalizeRect(start.x, start.y, tip.x, tip.y);
        return { ...d, params: r satisfies HeartParams };
      }
      case 'pentagon':
      case 'hexagon':
        return {
          ...d,
          params: {
            cx: start.x,
            cy: start.y,
            radius: Math.max(2, dist),
            rotation: -90,
          } satisfies RegularPolygonParams,
        };
      case 'star': {
        const prev = d.params as StarParams;
        return {
          ...d,
          params: {
            ...prev,
            cx: start.x,
            cy: start.y,
            radius: Math.max(2, dist),
            rotation: -90,
          } satisfies StarParams,
        };
      }
      case 'gradient': {
        const r = normalizeRect(start.x, start.y, tip.x, tip.y);
        return { ...d, params: r satisfies GradientParams };
      }
      case 'gradientCircle':
        return {
          ...d,
          params: { cx: 0, cy: 0, rx: dist, ry: dist } satisfies GradientCircleParams,
        };
      case 'octopus': {
        const p = d.params as OctopusParams;
        const scale = Math.max(20, dist);
        return {
          ...d,
          params: {
            ...p,
            radiusX: scale * 0.35,
            radiusY: scale * 0.35,
            startAngle: angle,
          },
        };
      }
      case 'multiStar': {
        const p = d.params as MultiStarParams;
        return {
          ...d,
          params: { ...p, radius: Math.max(20, dist), startAngle: angle },
        };
      }
      case 'randomStar': {
        const p = d.params as RandomStarParams;
        return { ...d, params: { ...p, radius: Math.max(20, dist) } };
      }
      case 'circleLine': {
        const p = d.params as CircleLineParams;
        return {
          ...d,
          params: { ...p, radius: Math.max(20, dist), startAngle: angle },
        };
      }
      case 'circles': {
        const p = d.params as CirclesParams;
        return {
          ...d,
          params: {
            ...p,
            width: Math.max(10, dist * 0.15),
            height: Math.max(10, dist * 0.15),
            startAngle: angle,
          },
        };
      }
      case 'sunflower': {
        const p = d.params as SunflowerParams;
        return {
          ...d,
          params: {
            ...p,
            radius: Math.max(20, dist),
            startAngle: angle,
          },
        };
      }
      case 'rainbow': {
        const p = d.params as RainbowParams;
        // Band thickness scales gently with span so short drags stay readable
        const bandWidth = Math.max(12, Math.min(dist * 0.22, d.style.strokeWidth * 14));
        return {
          ...d,
          params: {
            ...p,
            x1: start.x,
            y1: start.y,
            x2: end.x,
            y2: end.y,
            bandWidth,
          } satisfies RainbowParams,
        };
      }
      default:
        return d;
    }
  }

  private isDegenerate(shape: Shape): boolean {
    switch (shape.type) {
      case 'line': {
        const p = shape.params as LineParams;
        return Math.hypot(p.x2 - p.x1, p.y2 - p.y1) < 2;
      }
      case 'rainbow': {
        const p = shape.params as RainbowParams;
        return Math.hypot(p.x2 - p.x1, p.y2 - p.y1) < 8;
      }
      case 'rect':
      case 'gradient':
      case 'heart': {
        const p = shape.params as RectParams | GradientParams | HeartParams;
        return p.width < 2 && p.height < 2;
      }
      case 'ellipse':
      case 'gradientCircle': {
        const p = shape.params as EllipseParams | GradientCircleParams;
        return p.rx < 1 && p.ry < 1;
      }
      case 'pentagon':
      case 'hexagon': {
        const p = shape.params as RegularPolygonParams;
        return p.radius < 2;
      }
      case 'star': {
        const p = shape.params as StarParams;
        return p.radius < 2;
      }
      case 'sunflower': {
        const p = shape.params as SunflowerParams;
        return p.radius < 8;
      }
      default:
        return false;
    }
  }

  private snapshot(): DrawingDocument {
    return this.toDocument();
  }

  private restoreSnapshot(doc: DrawingDocument): void {
    this.meta.set(doc.meta);
    this.shapes.set((doc.shapes ?? []).map((s) => ({ ...s, style: normalizeStyle(s.style) })));
    this.selectedIds.set([]);
    this.draft.set(null);
  }

  private pushSnapshot(record = true): void {
    if (record) {
      this.history.push(this.snapshot());
    } else {
      this.history.seed(this.snapshot());
    }
  }
}

/** Square/circle drag: same |dx| and |dy| from start, keeping quadrant. */
function equalAspectEnd(start: Point2D, end: Point2D): Point2D {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  const sx = dx < 0 ? -1 : 1;
  const sy = dy < 0 ? -1 : 1;
  return { x: start.x + sx * side, y: start.y + sy * side };
}
