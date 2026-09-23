import { Injectable, computed, signal } from '@angular/core';
import {
  CirclesParams,
  CircleLineParams,
  DocumentMeta,
  DrawingDocument,
  EllipseParams,
  FreehandParams,
  GradientCircleParams,
  GradientParams,
  GroupParams,
  ImportedVectorParams,
  ImportedVectorPath,
  LineParams,
  MultiStarParams,
  OctopusParams,
  Point2D,
  RandomStarParams,
  RectParams,
  Shape,
  ShapeType,
  StyleProps,
  ToolId,
  Transform2D,
  TriangleParams,
  VectorPathParams,
  CenterLinesParams,
  createStyle,
  createTransform,
  newShapeId,
} from '../models/shape';
import { getAngle } from '../math/polar';
import { normalizeRect, triangleFromDrag } from '../generators/shapes';
import { HistoryService } from './history.service';
import { worldBoundsForShape } from '../render/geometry';

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
  readonly draft = signal<Shape | null>(null);

  readonly effectParams = signal({ ...EFFECT_DEFAULTS });

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

  constructor(private readonly history: HistoryService) {
    this.zoom.set(1);
    this.pushSnapshot(false);
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
      this.strokeColor.set(primary.style.stroke);
      this.fillColor.set(
        primary.style.fill === 'none' || primary.style.fill === 'transparent'
          ? this.fillColor()
          : primary.style.fill,
      );
      this.strokeWidth.set(primary.style.strokeWidth);
      this.opacity.set(primary.style.opacity ?? 1);
      if (primary.style.strokeEnd) this.strokeEndColor.set(primary.style.strokeEnd);
    }
  }

  deleteSelected(): void {
    const ids = new Set(this.selectedIds());
    if (!ids.size) return;
    this.shapes.update((list) => list.filter((s) => !ids.has(s.id)));
    this.selectedIds.set([]);
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
      list.map((s) => (ids.has(s.id) ? { ...s, style: { ...s.style, ...partial } } : s)),
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
    this.pushSnapshot();
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

    // Drag-based tools: store start in draft transform origin / params
    this.draft.set(this.createDragDraft(tool, id, point, style));
  }

  continueStroke(point: Point2D, start: Point2D): void {
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

    this.draft.set(this.updateDragDraft(d, start, point));
  }

  endStroke(point: Point2D, start: Point2D): void {
    const d = this.draft();
    if (!d) return;

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
      finalShape = this.updateDragDraft(d, start, point);
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
    this.meta.set({ ...DEFAULT_META, ...doc.meta });
    this.shapes.set(
      (doc.shapes ?? []).map((s) => ({
        ...s,
        style: { ...s.style, opacity: s.style?.opacity ?? 1 },
      })),
    );
    this.selectedIds.set([]);
    this.draft.set(null);
    this.history.reset();
    this.pushSnapshot(false);
  }

  private currentStyle(): StyleProps {
    return createStyle(
      this.strokeColor(),
      this.fillColor(),
      this.strokeWidth(),
      this.opacity(),
      this.strokeEndColor(),
    );
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

  private updateDragDraft(d: Shape, start: Point2D, end: Point2D): Shape {
    const angle = getAngle(start, end);
    const dist = Math.hypot(end.x - start.x, end.y - start.y);

    switch (d.type) {
      case 'line':
        return {
          ...d,
          params: { x1: start.x, y1: start.y, x2: end.x, y2: end.y } satisfies LineParams,
        };
      case 'rect': {
        const r = normalizeRect(start.x, start.y, end.x, end.y);
        return { ...d, params: r satisfies RectParams };
      }
      case 'ellipse': {
        const r = normalizeRect(start.x, start.y, end.x, end.y);
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
          params: { points: triangleFromDrag(start.x, start.y, end.x, end.y) } satisfies TriangleParams,
        };
      case 'gradient': {
        const r = normalizeRect(start.x, start.y, end.x, end.y);
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
      case 'rect':
      case 'gradient': {
        const p = shape.params as RectParams | GradientParams;
        return p.width < 2 && p.height < 2;
      }
      case 'ellipse':
      case 'gradientCircle': {
        const p = shape.params as EllipseParams | GradientCircleParams;
        return p.rx < 1 && p.ry < 1;
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
    this.shapes.set(doc.shapes);
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
