import { Component, Input } from '@angular/core';
import {
  FreehandParams,
  GroupParams,
  PolygonParams,
  RainbowParams,
  Shape,
  TriangleParams,
} from '../../core/models/shape';
import {
  boundsForShape,
  freehandPath,
  polygonPoints,
  rainbowBands,
  shapePrimitives,
  transformAttr,
  trianglePoints,
} from '../../core/render/geometry';

@Component({
  selector: 'svg:g[app-shape-layer]',
  standalone: true,
  imports: [ShapeLayerComponent],
  templateUrl: './shape-layer.component.html',
})
export class ShapeLayerComponent {
  @Input({ required: true }) shape!: Shape;
  @Input() selected = false;

  get tAttr(): string {
    return transformAttr(this.shape.transform);
  }

  get fhPath(): string {
    return freehandPath(this.shape.params as FreehandParams);
  }

  get triPts(): string {
    return trianglePoints(this.shape.params as TriangleParams);
  }

  get polyPts(): string {
    return polygonPoints(this.shape.params as PolygonParams);
  }

  get rainbowBands() {
    if (this.shape.type !== 'rainbow') return [];
    return rainbowBands(this.shape.params as RainbowParams);
  }

  get fillAttr(): string {
    if (this.shape.style.fillGradient) return `url(#fg-${this.shape.id})`;
    return this.shape.style.fill;
  }

  get hasFillGradient(): boolean {
    return !!this.shape.style.fillGradient;
  }

  get fillGrad(): { angle: number; from: string; to: string } | null {
    return this.shape.style.fillGradient ?? null;
  }

  /** Convert angle (0 = left→right) to objectBoundingBox coords */
  get fillGradCoords(): { x1: string; y1: string; x2: string; y2: string } {
    const angle = ((this.fillGrad?.angle ?? 0) * Math.PI) / 180;
    const cx = 0.5;
    const cy = 0.5;
    const dx = Math.cos(angle) * 0.5;
    const dy = Math.sin(angle) * 0.5;
    return {
      x1: `${((cx - dx) * 100).toFixed(1)}%`,
      y1: `${((cy - dy) * 100).toFixed(1)}%`,
      x2: `${((cx + dx) * 100).toFixed(1)}%`,
      y2: `${((cy + dy) * 100).toFixed(1)}%`,
    };
  }

  get primitives() {
    return shapePrimitives(this.shape);
  }

  get bounds() {
    return boundsForShape(this.shape);
  }

  get groupChildren(): Shape[] {
    if (this.shape.type !== 'group') return [];
    return (this.shape.params as GroupParams).children;
  }

  get handles() {
    const b = this.bounds;
    return [
      { id: 'nw', x: b.x, y: b.y },
      { id: 'ne', x: b.x + b.w, y: b.y },
      { id: 'se', x: b.x + b.w, y: b.y + b.h },
      { id: 'sw', x: b.x, y: b.y + b.h },
    ];
  }
}
