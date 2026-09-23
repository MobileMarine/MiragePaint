import { DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DrawingService } from '../../core/services/drawing.service';
import {
  CirclesParams,
  CircleLineParams,
  FillMode,
  MultiStarParams,
  OctopusParams,
  RainbowMode,
  RainbowParams,
  RandomStarParams,
  Shape,
  StrokeMode,
  SunflowerParams,
} from '../../core/models/shape';
import { COLOR_PRESETS } from '../../core/style/presets';

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
    } else if (mode === 'none') {
      patch.fill = 'none';
    } else if (mode === 'solid') {
      patch.fill = this.drawing.fillColor();
    }
    if (this.selected()) this.drawing.updateSelectedStyle(patch);
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
    group: 'octopus' | 'multiStar' | 'randomStar' | 'circleLine' | 'circles' | 'sunflower' | 'rainbow',
    key: string,
    value: string | number,
  ): void {
    const coerced =
      group === 'rainbow' && key === 'mode'
        ? value
        : typeof value === 'number'
          ? value
          : Number(value);
    this.drawing.effectParams.update((ep) => ({
      ...ep,
      [group]: { ...ep[group], [key]: coerced },
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
  asRainbow(p: unknown): RainbowParams {
    return p as RainbowParams;
  }
}
