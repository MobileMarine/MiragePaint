import { Component, inject } from '@angular/core';
import { DrawingService } from '../../core/services/drawing.service';
import { ToolId } from '../../core/models/shape';

interface ToolDef {
  id: ToolId;
  icon: string;
  label: string;
  group: 'select' | 'basic' | 'effect';
  /** Use custom SVG instead of Material icon */
  customIcon?: 'rainbow';
}

@Component({
  selector: 'app-toolbar',
  standalone: true,
  templateUrl: './toolbar.component.html',
  styleUrl: './toolbar.component.scss',
})
export class ToolbarComponent {
  readonly drawing = inject(DrawingService);

  readonly tools: ToolDef[] = [
    { id: 'select', icon: 'arrow_selector_tool', label: 'Auswahl', group: 'select' },
    { id: 'freehand', icon: 'gesture', label: 'Freihand', group: 'basic' },
    { id: 'line', icon: 'horizontal_rule', label: 'Linie', group: 'basic' },
    { id: 'rect', icon: 'rectangle', label: 'Rechteck', group: 'basic' },
    { id: 'ellipse', icon: 'circle', label: 'Ellipse', group: 'basic' },
    { id: 'triangle', icon: 'change_history', label: 'Dreieck', group: 'basic' },
    { id: 'heart', icon: 'favorite', label: 'Herz', group: 'basic' },
    { id: 'pentagon', icon: 'pentagon', label: 'Fünfeck', group: 'basic' },
    { id: 'hexagon', icon: 'hexagon', label: 'Sechseck', group: 'basic' },
    { id: 'centerLines', icon: 'flare', label: 'CenterLines', group: 'effect' },
    { id: 'gradient', icon: 'gradient', label: 'Farbübergang', group: 'effect' },
    { id: 'gradientCircle', icon: 'blur_circular', label: 'Radialverlauf', group: 'effect' },
    { id: 'octopus', icon: 'psychiatry', label: 'Octopussy', group: 'effect' },
    { id: 'multiStar', icon: 'star', label: 'MultiStar', group: 'effect' },
    { id: 'randomStar', icon: 'shutter_speed', label: 'RandomStar', group: 'effect' },
    { id: 'circleLine', icon: 'radar', label: 'CircleLine', group: 'effect' },
    { id: 'circles', icon: 'bubble_chart', label: 'Circles', group: 'effect' },
    { id: 'sunflower', icon: 'filter_vintage', label: 'Sonnenblume', group: 'effect' },
    {
      id: 'rainbow',
      icon: 'rainbow',
      label: 'Regenbogen',
      group: 'effect',
      customIcon: 'rainbow',
    },
  ];

  select(tool: ToolId): void {
    this.drawing.setTool(tool);
  }
}
