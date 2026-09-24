import { Component, Input, inject } from '@angular/core';
import {
  CenterLinesParams,
  FireworkParams,
  FreehandParams,
  GroupParams,
  HeartParams,
  PolygonParams,
  RainbowParams,
  RegularPolygonParams,
  Shape,
  StarParams,
  SunflowerParams,
  TriangleParams,
} from '../../core/models/shape';
import {
  boundsForShape,
  effectPaletteColors,
  effectPaletteMode,
  freehandPath,
  freehandStrokeSegments,
  heartPathAttr,
  lineColorAt,
  polygonPoints,
  rainbowBands,
  regularPolyPointsAttr,
  shapePrimitives,
  starPointsAttr,
  sunflowerLayout,
  transformAttr,
  trianglePoints,
} from '../../core/render/geometry';
import { evaluateFirework } from '../../core/generators/firework';
import { buildStopsFromGradient, buildLinearStops } from '../../core/style/presets';
import { DrawingService } from '../../core/services/drawing.service';
import { LineParams } from '../../core/models/shape';

@Component({
  selector: 'svg:g[app-shape-layer]',
  standalone: true,
  imports: [ShapeLayerComponent],
  templateUrl: './shape-layer.component.html',
})
export class ShapeLayerComponent {
  @Input({ required: true }) shape!: Shape;
  @Input() selected = false;

  private readonly drawing = inject(DrawingService);

  get tAttr(): string {
    const b = boundsForShape(this.shape);
    return transformAttr(this.shape.transform, {
      x: b.x + b.w / 2,
      y: b.y + b.h / 2,
    });
  }

  get fhPath(): string {
    return freehandPath(this.shape.params as FreehandParams);
  }

  /** When set, freehand is drawn as colored segments along the path. */
  get fhStrokeSegments(): { d: string; color: string }[] | null {
    if (this.shape.type !== 'freehand') return null;
    return freehandStrokeSegments(this.shape.params as FreehandParams, this.shape.style);
  }

  get strokeAlongPath(): boolean {
    return this.shape.type === 'line' && this.shape.style.strokeMode === 'gradient';
  }

  get needsStrokeDef(): boolean {
    if (this.shape.style.strokeMode !== 'gradient') return false;
    // Freehand uses solid segment strokes instead of a gradient def
    if (this.shape.type === 'freehand' && this.fhStrokeSegments) return false;
    return true;
  }

  get strokeGradCoords() {
    if (this.strokeAlongPath) {
      const p = this.shape.params as LineParams;
      return {
        x1: String(p.x1),
        y1: String(p.y1),
        x2: String(p.x2),
        y2: String(p.y2),
      };
    }
    return this.gradCoords(this.strokeGradAngle);
  }

  get strokeGradientUnits(): string | null {
    return this.strokeAlongPath ? 'userSpaceOnUse' : null;
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

  /** Per-ray stroke colors for CenterLines (insertion order). */
  get centerLineStrokes(): string[] {
    if (this.shape.type !== 'centerLines') return [];
    const rays = (this.shape.params as CenterLinesParams).rays;
    const n = rays.length;
    return rays.map((_, i) => lineColorAt(this.shape.style, i, n));
  }

  get fillAttr(): string {
    const mode = this.shape.style.fillMode;
    if (mode === 'none') return 'none';
    if (mode === 'gradient') return `url(#fill-${this.shape.id})`;
    return this.shape.style.fill;
  }

  get strokeAttr(): string {
    const mode = this.shape.style.strokeMode;
    if (mode === 'none') return 'none';
    if (mode === 'gradient') return `url(#stroke-${this.shape.id})`;
    return this.shape.style.stroke;
  }

  get needsFillDef(): boolean {
    return this.shape.style.fillMode === 'gradient';
  }

  get needsGlowFilter(): boolean {
    return !!this.shape.style.strokeGlow && (this.shape.style.strokeGlow.width ?? 0) > 0;
  }

  get glowFilterId(): string {
    return `glow-${this.shape.id}`;
  }

  get strokeFilterAttr(): string | null {
    return this.needsGlowFilter ? `url(#${this.glowFilterId})` : null;
  }

  get fillGradAngle(): number {
    return this.shape.style.fillGradient?.angle ?? 0;
  }

  get strokeGradAngle(): number {
    return this.shape.style.strokeGradient?.angle ?? this.shape.style.strokeAngle ?? 0;
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

  get fillGradientStops(): { offset: string; color: string }[] {
    const g = this.shape.style.fillGradient;
    if (!g) {
      return buildLinearStops(this.fillGradFrom, this.fillGradTo);
    }
    return buildStopsFromGradient(g);
  }

  get strokeGradientStops(): { offset: string; color: string }[] {
    const g = this.shape.style.strokeGradient;
    if (g) return buildStopsFromGradient(g);
    return buildLinearStops(
      this.shape.style.stroke,
      this.shape.style.strokeEnd || this.shape.style.stroke,
    );
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

  get starPts(): string {
    if (this.shape.type !== 'star') return '';
    return starPointsAttr(this.shape.params as StarParams);
  }

  get sunflower() {
    if (this.shape.type !== 'sunflower') return null;
    const p = this.shape.params as SunflowerParams;
    const mode = effectPaletteMode(this.shape.style);
    const pal = effectPaletteColors(this.shape.style);
    const palFrom = mode === 'solid' ? this.shape.style.stroke : pal.from;
    const palTo = mode === 'solid' ? this.shape.style.stroke : pal.to;
    return sunflowerLayout(
      p.petals,
      p.radius,
      p.seedRings,
      p.startAngle,
      palFrom,
      palTo,
      mode,
      { stops: pal.stops, stepped: pal.stepped, steps: pal.steps },
    );
  }

  get fireworkFrame() {
    if (this.shape.type !== 'firework') return null;
    const p = this.shape.params as FireworkParams;
    const t = p.animT ?? 1;
    return evaluateFirework(p, t);
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

  /** Local units so that after shape scale × zoom the size is ~`px` screen pixels. */
  private screenAxis(px: number, axisScale: number): number {
    const z = Math.max(0.05, this.drawing.zoom());
    const s = Math.max(0.05, Math.abs(axisScale));
    return px / (z * s);
  }

  get handleHalfX(): number {
    return this.screenAxis(5, this.shape.transform.scaleX);
  }

  get handleHalfY(): number {
    return this.screenAxis(5, this.shape.transform.scaleY);
  }

  get handleW(): number {
    return this.handleHalfX * 2;
  }

  get handleH(): number {
    return this.handleHalfY * 2;
  }

  get rotateOffset(): number {
    return this.screenAxis(28, this.shape.transform.scaleY);
  }

  get rotateRx(): number {
    return this.screenAxis(6, this.shape.transform.scaleX);
  }

  get rotateRy(): number {
    return this.screenAxis(6, this.shape.transform.scaleY);
  }
}
