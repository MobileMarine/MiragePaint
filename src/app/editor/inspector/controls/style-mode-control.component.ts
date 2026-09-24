import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StylePaintMode } from '../../../core/models/shape';

@Component({
  selector: 'app-style-mode-control',
  standalone: true,
  imports: [FormsModule],
  template: `
    <label class="row mode-row">
      <span>Modus</span>
      <div class="mode-with-swatch">
        <select [ngModel]="mode" (ngModelChange)="modeChange.emit($event)">
          <option value="none">Keine</option>
          <option value="solid">Farbe</option>
          <option value="gradient">Verlauf</option>
        </select>
        <button
          type="button"
          class="fill-swatch swatch-btn"
          [class.is-none]="mode === 'none'"
          [style.background]="swatchCss"
          [disabled]="mode === 'none'"
          [attr.title]="mode === 'solid' ? 'Farbe wählen' : 'Preset wählen'"
          (click)="onSwatchClick($event)"
        ></button>
        @if (mode === 'solid') {
          <input
            #solidColor
            class="hidden-color"
            type="color"
            [value]="solidColorValue"
            (input)="solidColorChange.emit($any($event.target).value)"
          />
        }
      </div>
    </label>
  `,
  styleUrl: './control-shared.scss',
  styles: [
    `
      .swatch-btn {
        padding: 0;
        cursor: pointer;
      }
      .swatch-btn:disabled {
        cursor: default;
        opacity: 0.55;
      }
      .hidden-color {
        position: absolute;
        width: 0;
        height: 0;
        opacity: 0;
        pointer-events: none;
      }
    `,
  ],
})
export class StyleModeControlComponent {
  @Input({ required: true }) mode!: StylePaintMode;
  @Input() swatchCss = '#ccc';
  @Input() solidColorValue = '#1a1a1a';
  @Output() modeChange = new EventEmitter<StylePaintMode>();
  @Output() solidColorChange = new EventEmitter<string>();
  @Output() openPresetPicker = new EventEmitter<void>();

  onSwatchClick(ev: Event): void {
    ev.preventDefault();
    if (this.mode === 'solid') {
      const host = (ev.currentTarget as HTMLElement).parentElement;
      const input = host?.querySelector('input.hidden-color') as HTMLInputElement | null;
      input?.click();
    } else if (this.mode === 'gradient') {
      this.openPresetPicker.emit();
    }
  }
}
