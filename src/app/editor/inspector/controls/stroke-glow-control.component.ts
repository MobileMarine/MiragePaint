import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-stroke-glow-control',
  standalone: true,
  imports: [FormsModule],
  template: `
    <label class="row check">
      <span>Glow</span>
      <input
        type="checkbox"
        [ngModel]="enabled"
        (ngModelChange)="enabledChange.emit(!!$event)"
      />
    </label>
    @if (enabled) {
      <label class="row">
        <span>Glow-Farbe</span>
        <input
          type="color"
          [value]="color"
          (input)="colorChange.emit($any($event.target).value)"
        />
      </label>
      <label class="row slider">
        <span>Glow-Breite</span>
        <input
          type="number"
          class="spin"
          min="1"
          max="80"
          step="1"
          [ngModel]="width"
          (ngModelChange)="widthChange.emit(+$event)"
        />
        <input
          type="range"
          min="1"
          max="80"
          step="1"
          [ngModel]="width"
          (ngModelChange)="widthChange.emit(+$event)"
        />
      </label>
      <label class="row slider">
        <span>Glow-Deckkraft</span>
        <input
          type="number"
          class="spin"
          min="0"
          max="100"
          step="1"
          [ngModel]="opacityPercent"
          (ngModelChange)="opacityChange.emit(+$event / 100)"
        />
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          [ngModel]="opacityPercent"
          (ngModelChange)="opacityChange.emit(+$event / 100)"
        />
      </label>
    }
  `,
  styleUrl: './control-shared.scss',
})
export class StrokeGlowControlComponent {
  @Input() enabled = false;
  @Input() color = '#ffffff';
  @Input() width = 8;
  @Input() opacity = 0.55;
  @Output() enabledChange = new EventEmitter<boolean>();
  @Output() colorChange = new EventEmitter<string>();
  @Output() widthChange = new EventEmitter<number>();
  @Output() opacityChange = new EventEmitter<number>();

  get opacityPercent(): number {
    return Math.round(this.opacity * 100);
  }
}
