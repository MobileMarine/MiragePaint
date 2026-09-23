import { Component, Input } from '@angular/core';
import {
  FreehandParams,
  GroupParams,
  HeartParams,
  PolygonParams,
  RainbowParams,
  RegularPolygonParams,
  Shape,
  SunflowerParams,
  TriangleParams,
} from '../../core/models/shape';
import {
  boundsForShape,
  effectPaletteColors,
  effectPaletteMode,
  freehandPath,
  heartPathAttr,
  polygonPoints,
  rainbowBands,
  regularPolyPointsAttr,
  shapePrimitives,
  sunflowerLayout,
  transformAttr,
  trianglePoints,
} from '../../core/render/geometry';
import { RAINBOW_COLORS } from '../../core/style/presets';

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
    const mode = this.shape.style.fillMode;
    if (mode === 'none') return 'none';
    if (
      mode === 'gradient' ||
      mode === 'rainbowGradient' ||
      mode === 'rainbowStripes' ||
      this.shape.style.fillGradient
    ) {
      return `url(#fill-${this.shape.id})`;
    }
    return this.shape.style.fill;
  }

  get strokeAttr(): string {
    const mode = this.shape.style.strokeMode;
    if (mode === 'none') return 'none';
    if (mode === 'gradient') return `url(#stroke-${this.shape.id})`;
    return this.shape.style.stroke;
  }

  get needsFillDef(): boolean {
    const mode = this.shape.style.fillMode;
    return (
      mode === 'gradient' ||
      mode === 'rainbowGradient' ||
      mode === 'rainbowStripes' ||
      !!this.shape.style.fillGradient
    );
  }

  get needsStrokeDef(): boolean {
    return this.shape.style.strokeMode === 'gradient';
  }

  get fillGradAngle(): number {
    return this.shape.style.fillGradient?.angle ?? 0;
  }

  get strokeGradAngle(): number {
    return this.shape.style.strokeAngle ?? 0;
  }

  get fillGradFrom(): string {
    return this.shape.style.fillGradient?.from ?? this.shape.style.fill ?? '#c45c26';
  }

  get fillGradTo(): string {
    return (
      this.shape.style.fillGradient?.to ??
      this.shape.style.strokeEnd ??
      this.shape.style.stroke ??
      '#1a1a1a'
    );
  }

  gradCoords(angleDeg: number): { x1: string; y1: string; x2: string; y2: string } {
    const angle = (angleDeg * Math.PI) / 180;
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

  get fillGradCoords() {
    return this.gradCoords(this.fillGradAngle);
  }

  get strokeGradCoords() {
    return this.gradCoords(this.strokeGradAngle);
  }

  get rainbowStops(): { offset: string; color: string }[] {
    const mode = this.shape.style.fillMode;
    const colors = [...RAINBOW_COLORS];
    const n = colors.length;
    if (mode === 'rainbowStripes') {
      const stops: { offset: string; color: string }[] = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 100;
        const b = ((i + 1) / n) * 100;
        stops.push({ offset: `${a.toFixed(2)}%`, color: colors[i] });
        stops.push({ offset: `${b.toFixed(2)}%`, color: colors[i] });
      }
      return stops;
    }
    // soft rainbow gradient
    return colors.map((color, i) => ({
      offset: `${((i / Math.max(1, n - 1)) * 100).toFixed(2)}%`,
      color,
    }));
  }

  get primitives() {
    return shapePrimitives(this.shape);
  }

  get heartD(): string {
    if (this.shape.type !== 'heart') return '';
    return heartPathAttr(this.shape.params as HeartParams);
  }

  get pentagonPts(): string {
    if (this.shape.type !== 'pentagon') return '';
    return regularPolyPointsAttr(this.shape.params as RegularPolygonParams, 5);
  }

  get hexagonPts(): string {
    if (this.shape.type !== 'hexagon') return '';
    return regularPolyPointsAttr(this.shape.params as RegularPolygonParams, 6);
  }

  get sunflower() {
    if (this.shape.type !== 'sunflower') return null;
    const p = this.shape.params as SunflowerParams;
    const mode = effectPaletteMode(this.shape.style);
    const { from, to } = effectPaletteColors(this.shape.style);
    const palFrom = mode === 'solid' ? this.shape.style.stroke : from;
    const palTo = mode === 'solid' ? this.shape.style.stroke : to;
    return sunflowerLayout(
      p.petals,
      p.radius,
      p.seedRings,
      p.startAngle,
      palFrom,
      palTo,
      mode,
    );
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
