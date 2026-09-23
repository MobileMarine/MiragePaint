import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { DrawingService } from '../../core/services/drawing.service';
import { Point2D, Shape } from '../../core/models/shape';
import { ShapeLayerComponent } from '../shape-layer/shape-layer.component';
import { boundsForShape } from '../../core/render/geometry';
import { getAngle } from '../../core/math/polar';

type DragMode = 'draw' | 'pan' | 'move' | 'scale' | 'rotate' | null;
type ScaleHandle = 'nw' | 'ne' | 'se' | 'sw';

const OPPOSITE_HANDLE: Record<ScaleHandle, ScaleHandle> = {
  nw: 'se',
  ne: 'sw',
  se: 'nw',
  sw: 'ne',
};

function cornerLocal(
  handle: ScaleHandle,
  b: { x: number; y: number; w: number; h: number },
): Point2D {
  switch (handle) {
    case 'nw':
      return { x: b.x, y: b.y };
    case 'ne':
      return { x: b.x + b.w, y: b.y };
    case 'se':
      return { x: b.x + b.w, y: b.y + b.h };
    case 'sw':
      return { x: b.x, y: b.y + b.h };
  }
}

/** Apply translate(rotate(scale(p))) matching SVG transformAttr order. */
function localToWorld(
  p: Point2D,
  t: { x: number; y: number; scaleX: number; scaleY: number; rotation: number },
): Point2D {
  const sx = p.x * t.scaleX;
  const sy = p.y * t.scaleY;
  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: t.x + sx * cos - sy * sin,
    y: t.y + sx * sin + sy * cos,
  };
}

@Component({
  selector: 'app-viewport',
  standalone: true,
  imports: [ShapeLayerComponent],
  templateUrl: './viewport.component.html',
  styleUrl: './viewport.component.scss',
})
export class ViewportComponent implements AfterViewInit, OnDestroy {
  readonly drawing = inject(DrawingService);

  @ViewChild('svgRoot', { static: true }) svgRoot!: ElementRef<SVGSVGElement>;
  @ViewChild('stage', { static: true }) stage!: ElementRef<SVGGElement>;
  @ViewChild('host', { static: true }) host!: ElementRef<HTMLElement>;

  readonly viewSize = signal({ w: 800, h: 600 });

  private dragMode: DragMode = null;
  private startWorld: Point2D = { x: 0, y: 0 };
  private pointerDownScreen: Point2D = { x: 0, y: 0 };
  private panOrigin: Point2D = { x: 0, y: 0 };
  private moveOrigin: Point2D = { x: 0, y: 0 };
  private shapeOrigin = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };
  private scaleHandle: ScaleHandle | null = null;
  private scaleBounds = { x: 0, y: 0, w: 1, h: 1 };
  private scaleAnchorWorld: Point2D = { x: 0, y: 0 };
  private spaceDown = false;
  private resizeObserver?: ResizeObserver;

  get svgElement(): SVGSVGElement {
    return this.svgRoot.nativeElement;
  }

  ngAfterViewInit(): void {
    this.resizeObserver = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      this.viewSize.set({ w: Math.max(1, cr.width), h: Math.max(1, cr.height) });
    });
    this.resizeObserver.observe(this.host.nativeElement);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  onContextMenu(ev: Event): void {
    ev.preventDefault();
  }

  onPointerDown(ev: PointerEvent): void {
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    this.pointerDownScreen = { x: ev.clientX, y: ev.clientY };

    const target = ev.target as Element;
    const world = this.screenToWorld(this.pointerDownScreen);

    // Right mouse button or middle / Space / Alt = pan
    if (ev.button === 2 || ev.button === 1 || this.spaceDown || (ev.button === 0 && ev.altKey)) {
      this.dragMode = 'pan';
      this.panOrigin = { ...this.drawing.pan() };
      return;
    }

    if (this.drawing.tool() === 'select') {
      const handle = target.getAttribute?.('data-handle');
      if (handle === 'rotate') {
        this.dragMode = 'rotate';
        this.startWorld = world;
        const sel = this.drawing.selectedShape();
        if (sel) this.shapeOrigin = { ...sel.transform };
        return;
      }
      if (handle && ['nw', 'ne', 'se', 'sw'].includes(handle)) {
        this.dragMode = 'scale';
        this.startWorld = world;
        this.scaleHandle = handle as ScaleHandle;
        const sel = this.drawing.selectedShape();
        if (sel) {
          this.shapeOrigin = { ...sel.transform };
          this.scaleBounds = boundsForShape(sel);
          const fixed = cornerLocal(OPPOSITE_HANDLE[this.scaleHandle], this.scaleBounds);
          this.scaleAnchorWorld = localToWorld(fixed, this.shapeOrigin);
        }
        return;
      }

      const shapeEl = target.closest?.('[data-shape-id]');
      const id = shapeEl?.getAttribute('data-shape-id');
      if (id) {
        this.drawing.selectShape(id, { toggle: ev.ctrlKey || ev.metaKey });
        if (!(ev.ctrlKey || ev.metaKey) || this.drawing.selectedIds().includes(id)) {
          this.dragMode = 'move';
          this.startWorld = world;
          const sel = this.drawing.selectedShape();
          if (sel) {
            this.shapeOrigin = { ...sel.transform };
            this.moveOrigin = { x: sel.transform.x, y: sel.transform.y };
          }
        }
        return;
      }

      this.drawing.selectShape(null);
      return;
    }

    if (ev.button !== 0) return;

    this.dragMode = 'draw';
    this.startWorld = world;
    this.drawing.beginStroke(world);
  }

  onPointerMove(ev: PointerEvent): void {
    if (!this.dragMode) return;
    const screen = { x: ev.clientX, y: ev.clientY };
    const world = this.screenToWorld(screen);

    if (this.dragMode === 'pan') {
      this.drawing.setPan({
        x: this.panOrigin.x + (screen.x - this.pointerDownScreen.x),
        y: this.panOrigin.y + (screen.y - this.pointerDownScreen.y),
      });
      return;
    }

    if (this.dragMode === 'draw') {
      this.drawing.continueStroke(world, this.startWorld);
      return;
    }

    if (this.dragMode === 'move') {
      const dx = world.x - this.startWorld.x;
      const dy = world.y - this.startWorld.y;
      this.drawing.updateSelectedTransform(
        { x: this.moveOrigin.x + dx, y: this.moveOrigin.y + dy },
        false,
      );
      return;
    }

    if (this.dragMode === 'scale') {
      const sel = this.drawing.selectedShape();
      const handle = this.scaleHandle;
      if (!sel || !handle) return;

      const F = cornerLocal(OPPOSITE_HANDLE[handle], this.scaleBounds);
      const D = cornerLocal(handle, this.scaleBounds);
      const rad = (this.shapeOrigin.rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      // Mouse relative to fixed opposite corner, in unrotated local axes
      const dx = world.x - this.scaleAnchorWorld.x;
      const dy = world.y - this.scaleAnchorWorld.y;
      const localDx = dx * cos + dy * sin;
      const localDy = -dx * sin + dy * cos;

      const spanX = D.x - F.x;
      const spanY = D.y - F.y;
      const minS = 0.05;
      let sx1 =
        Math.abs(spanX) > 1e-6 ? localDx / spanX : this.shapeOrigin.scaleX;
      let sy1 =
        Math.abs(spanY) > 1e-6 ? localDy / spanY : this.shapeOrigin.scaleY;
      if (Math.abs(sx1) < minS) sx1 = Math.sign(sx1 || 1) * minS;
      if (Math.abs(sy1) < minS) sy1 = Math.sign(sy1 || 1) * minS;

      // Keep opposite corner fixed in world space
      const scaledFx = sx1 * F.x;
      const scaledFy = sy1 * F.y;
      const tx1 = this.scaleAnchorWorld.x - (scaledFx * cos - scaledFy * sin);
      const ty1 = this.scaleAnchorWorld.y - (scaledFx * sin + scaledFy * cos);

      this.drawing.updateSelectedTransform(
        { x: tx1, y: ty1, scaleX: sx1, scaleY: sy1 },
        false,
      );
      return;
    }

    if (this.dragMode === 'rotate') {
      const sel = this.drawing.selectedShape();
      if (!sel) return;
      const b = boundsForShape(sel);
      const cx = sel.transform.x + b.x + b.w / 2;
      const cy = sel.transform.y + b.y + b.h / 2;
      this.drawing.updateSelectedTransform(
        { rotation: getAngle({ x: cx, y: cy }, world) },
        false,
      );
    }
  }

  onPointerUp(ev: PointerEvent): void {
    if (this.dragMode === 'draw') {
      const world = this.screenToWorld({ x: ev.clientX, y: ev.clientY });
      this.drawing.endStroke(world, this.startWorld);
    } else if (
      this.dragMode === 'move' ||
      this.dragMode === 'scale' ||
      this.dragMode === 'rotate'
    ) {
      this.drawing.commitTransform();
    }
    this.dragMode = null;
    this.scaleHandle = null;
  }

  onWheel(ev: WheelEvent): void {
    ev.preventDefault();
    const rect = this.host.nativeElement.getBoundingClientRect();
    this.drawing.zoomAt(ev.deltaY < 0 ? 1.1 : 1 / 1.1, {
      x: ev.clientX - rect.left,
      y: ev.clientY - rect.top,
    });
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(ev: KeyboardEvent): void {
    if (ev.code === 'Space') {
      this.spaceDown = true;
      ev.preventDefault();
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
      ev.preventDefault();
      if (ev.shiftKey) this.drawing.redo();
      else this.drawing.undo();
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') {
      ev.preventDefault();
      this.drawing.redo();
    }
    if (ev.key === 'Delete' || ev.key === 'Backspace') {
      const tag = (ev.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      this.drawing.deleteSelected();
    }
    if (ev.key === 'Escape') {
      this.drawing.selectShape(null);
      this.drawing.setTool('select');
    }
  }

  @HostListener('window:keyup', ['$event'])
  onKeyUp(ev: KeyboardEvent): void {
    if (ev.code === 'Space') this.spaceDown = false;
  }

  trackShape(_: number, s: Shape): string {
    return s.id;
  }

  selectShape(id: string, ev?: MouseEvent): void {
    this.drawing.selectShape(id, { toggle: !!(ev && (ev.ctrlKey || ev.metaKey)) });
  }

  private screenToWorld(screen: Point2D): Point2D {
    const svg = this.svgRoot.nativeElement;
    const pt = svg.createSVGPoint();
    pt.x = screen.x;
    pt.y = screen.y;
    const ctm = this.stage.nativeElement.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }
}
