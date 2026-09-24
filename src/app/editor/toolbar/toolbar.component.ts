import { Component, inject } from '@angular/core';
import { DrawingService } from '../../core/services/drawing.service';
import { ToolId } from '../../core/models/shape';

interface ToolDef {
  id: ToolId;
  icon: string;
  label: string;
  group: 'select' | 'basic' | 'lines' | 'fx';
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
    { id: 'star', icon: 'star', label: 'Stern', group: 'basic' },
    { id: 'centerLines', icon: 'flare', label: 'CenterLines', group: 'lines' },
    { id: 'octopus', icon: 'psychiatry', label: 'Octopussy', group: 'lines' },
    { id: 'multiStar', icon: 'auto_awesome', label: 'MultiStar', group: 'lines' },
    { id: 'randomStar', icon: 'shutter_speed', label: 'RandomStar', group: 'lines' },
    { id: 'circleLine', icon: 'radar', label: 'CircleLine', group: 'lines' },
    { id: 'circles', icon: 'bubble_chart', label: 'Circles', group: 'lines' },
    { id: 'sunflower', icon: 'filter_vintage', label: 'Sonnenblume', group: 'fx' },
    { id: 'firework', icon: 'celebration', label: 'Feuerwerk', group: 'fx' },
    {
      id: 'rainbow',
      icon: 'rainbow',
      label: 'Regenbogen',
      group: 'fx',
      customIcon: 'rainbow',
    },
  ];

  readonly groups: ToolDef['group'][] = ['select', 'basic', 'lines', 'fx'];

  toolsIn(group: ToolDef['group']): ToolDef[] {
    return this.tools.filter((t) => t.group === group);
  }

  select(tool: ToolId): void {
    this.drawing.setTool(tool);
  }
}
