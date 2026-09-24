import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-gradient-colors-row',
  standalone: true,
  template: `
    <div class="row mode-row colors-only">
      <div class="grad-stops-wrap">
        <div class="grad-stops">
          <input
            type="color"
            [value]="from"
            (input)="fromChange.emit($any($event.target).value)"
            title="Von"
          />
          <span class="grad-arrow material-symbols-outlined" aria-hidden="true">arrow_forward</span>
          <input
            type="color"
            [value]="to"
            (input)="toChange.emit($any($event.target).value)"
            title="Nach"
          />
        </div>
        @if (showReroll) {
          <button
            type="button"
            class="reroll-btn"
            title="Neu würfeln"
            (click)="reroll.emit()"
          >
            <span class="material-symbols-outlined">refresh</span>
          </button>
        }
      </div>
    </div>
  `,
  styleUrl: './control-shared.scss',
  styles: [
    `
      .reroll-btn {
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.6rem;
        height: 1.6rem;
        border: 0;
        border-radius: 0.3rem;
        background: transparent;
        color: var(--ink-muted);
        cursor: pointer;
        padding: 0;
      }
      .reroll-btn:hover {
        background: var(--panel-hover);
        color: var(--accent);
      }
      .reroll-btn .material-symbols-outlined {
        font-size: 1.05rem;
      }
    `,
  ],
})
export class GradientColorsRowComponent {
  @Input({ required: true }) from!: string;
  @Input({ required: true }) to!: string;
  @Input() showReroll = false;
  @Output() fromChange = new EventEmitter<string>();
  @Output() toChange = new EventEmitter<string>();
  @Output() reroll = new EventEmitter<void>();
}
