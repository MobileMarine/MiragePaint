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
        const sel = this.drawing.selectedShape();
        if (sel) this.shapeOrigin = { ...sel.transform };
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
      if (!sel) return;
      const b = boundsForShape(sel);
      const cx = sel.transform.x + b.x + b.w / 2;
      const cy = sel.transform.y + b.y + b.h / 2;
      const startDist = Math.max(1, Math.hypot(this.startWorld.x - cx, this.startWorld.y - cy));
      const nowDist = Math.max(1, Math.hypot(world.x - cx, world.y - cy));
      const factor = nowDist / startDist;
      this.drawing.updateSelectedTransform(
        {
          scaleX: this.shapeOrigin.scaleX * factor,
          scaleY: this.shapeOrigin.scaleY * factor,
        },
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
