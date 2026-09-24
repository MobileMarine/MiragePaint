import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-gradient-steps-control',
  standalone: true,
  imports: [FormsModule],
  template: `
    <label class="row check">
      <span>Abstufungen</span>
      <input
        type="checkbox"
        [ngModel]="stepped"
        [disabled]="readonly"
        (ngModelChange)="steppedChange.emit(!!$event)"
      />
    </label>
    @if (stepped) {
      <label class="row slider">
        <span>Anzahl</span>
        <input
          type="number"
          class="spin"
          min="2"
          max="64"
          step="1"
          [ngModel]="steps"
          [disabled]="readonly"
          (ngModelChange)="stepsChange.emit(+$event)"
        />
        <input
          type="range"
          min="2"
          max="64"
          step="1"
          [ngModel]="steps"
          [disabled]="readonly"
          (ngModelChange)="stepsChange.emit(+$event)"
        />
      </label>
      @if (readonly && hint) {
        <p class="hint">{{ hint }}</p>
      }
    }
  `,
  styleUrl: './control-shared.scss',
})
export class GradientStepsControlComponent {
  @Input() stepped = false;
  @Input() steps = 8;
  @Input() readonly = false;
  @Input() hint = '';
  @Output() steppedChange = new EventEmitter<boolean>();
  @Output() stepsChange = new EventEmitter<number>();
}
