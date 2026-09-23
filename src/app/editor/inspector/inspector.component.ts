import { DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DrawingService } from '../../core/services/drawing.service';
import {
  CirclesParams,
  CircleLineParams,
  MultiStarParams,
  OctopusParams,
  RandomStarParams,
} from '../../core/models/shape';

@Component({
  selector: 'app-inspector',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  templateUrl: './inspector.component.html',
  styleUrl: './inspector.component.scss',
})
export class InspectorComponent {
  readonly drawing = inject(DrawingService);

  readonly selected = computed(() => this.drawing.selectedShape());

  onStroke(v: string): void {
    this.drawing.strokeColor.set(v);
    if (this.selected()) this.drawing.updateSelectedStyle({ stroke: v });
  }

  onStrokeEnd(v: string): void {
    this.drawing.strokeEndColor.set(v);
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

  onRotation(v: string | number): void {
    this.drawing.updateSelectedTransform({ rotation: Number(v) });
  }

  onScale(v: string | number): void {
    const n = Number(v);
    this.drawing.updateSelectedTransform({ scaleX: n, scaleY: n });
  }

  updateParam(key: string, value: string | number): void {
    const n = typeof value === 'string' && value !== '' && !Number.isNaN(Number(value))
      ? Number(value)
      : value;
    this.drawing.updateSelectedParams({ [key]: n });
  }

  updateEffectDefault(group: 'octopus' | 'multiStar' | 'randomStar' | 'circleLine' | 'circles', key: string, value: string | number): void {
    const n = Number(value);
    this.drawing.effectParams.update((ep) => ({
      ...ep,
      [group]: { ...ep[group], [key]: n },
    }));
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
}
