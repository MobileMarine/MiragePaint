import { Component, Input } from '@angular/core';
import {
  FreehandParams,
  GroupParams,
  Shape,
  TriangleParams,
} from '../../core/models/shape';
import {
  boundsForShape,
  freehandPath,
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
