import { OnChanges, SimpleChanges } from '@angular/core';
import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { ColorPreset, gradientPreviewCss, presetStops } from '../../../core/style/presets';

@Component({
  selector: 'app-preset-picker',
  standalone: true,
  template: `
    <label class="row mode-row">
      <span>Preset</span>
      <div class="preset-wrap">
        <button type="button" class="preset-trigger" (click)="toggle($event)">
          <span class="preset-label">{{ currentLabel }}</span>
          <span class="material-symbols-outlined chev">expand_more</span>
        </button>
        @if (open) {
          <ul class="preset-menu" role="listbox">
            <li>
              <button type="button" class="preset-item" (click)="pick('')">
                <span
                  class="mini-swatch"
                  [style.background]="customPreview"
                ></span>
                <span class="preset-item-label">Benutzerdefiniert</span>
              </button>
            </li>
            @for (p of presets; track p.id) {
              <li>
                <div class="preset-item-row">
                  <button type="button" class="preset-item" (click)="pick(p.id)">
                    <span
                      class="mini-swatch"
                      [style.background]="previewFor(p)"
                    ></span>
                    <span class="preset-item-label">{{ p.label }}</span>
                  </button>
                  @if (p.kind === 'neon' || p.kind === 'random') {
                    <button
                      type="button"
                      class="reroll-btn"
                      title="Neu würfeln"
                      (click)="reroll($event, p.id)"
                    >
                      <span class="material-symbols-outlined">refresh</span>
                    </button>
                  }
                </div>
              </li>
            }
          </ul>
        }
      </div>
    </label>
  `,
  styleUrl: './control-shared.scss',
  styles: [
    `
      .preset-wrap {
        position: relative;
        justify-self: end;
        width: calc(8.5rem + 0.4rem + 2rem);
        min-width: 0;
        box-sizing: border-box;
      }
      .preset-trigger {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.25rem;
        width: 8.5rem;
        max-width: 8.5rem;
        margin-left: 0;
        border: 1px solid var(--line);
        border-radius: 0.35rem;
        padding: 0.25rem 0.35rem;
        background: var(--input-bg);
        color: var(--ink);
        font: inherit;
        font-size: 0.82rem;
        cursor: pointer;
        box-sizing: border-box;
      }
      .preset-label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .chev {
        font-size: 1.1rem;
        color: var(--ink-muted);
      }
      .preset-menu {
        position: absolute;
        right: 0;
        top: calc(100% + 0.2rem);
        z-index: 20;
        list-style: none;
        margin: 0;
        padding: 0.25rem;
        min-width: 13.5rem;
        max-height: 14rem;
        overflow-y: auto;
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 0.45rem;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
      }
      .preset-item-row {
        display: flex;
        align-items: center;
        gap: 0.15rem;
      }
      .preset-item {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        flex: 1;
        min-width: 0;
        border: 0;
        background: transparent;
        color: var(--ink);
        font: inherit;
        font-size: 0.8rem;
        padding: 0.35rem 0.4rem;
        border-radius: 0.3rem;
        cursor: pointer;
        text-align: left;
      }
      .preset-item:hover {
        background: var(--panel-hover);
      }
      .preset-item-label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .mini-swatch {
        flex-shrink: 0;
        width: 1.75rem;
        height: 1rem;
        border-radius: 0.25rem;
        border: 1px solid var(--line);
      }
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
export class PresetPickerComponent implements OnChanges {
  @Input({ required: true }) presets: ColorPreset[] = [];
  @Input() presetId: string | null = null;
  @Input() angle = 0;
  @Input() customFrom = '#888';
  @Input() customTo = '#ccc';
  @Input() forceOpen = false;
  @Output() presetIdChange = new EventEmitter<string>();
  @Output() rerollPreset = new EventEmitter<string>();
  @Output() forceOpenConsumed = new EventEmitter<void>();

  open = false;

  get currentLabel(): string {
    if (!this.presetId) return 'Benutzerdefiniert';
    return this.presets.find((p) => p.id === this.presetId)?.label ?? 'Benutzerdefiniert';
  }

  get customPreview(): string {
    return gradientPreviewCss(this.angle, this.customFrom, this.customTo);
  }

  previewFor(p: ColorPreset): string {
    const stops = presetStops(p);
    return gradientPreviewCss(
      this.angle,
      stops[0],
      stops[stops.length - 1],
      stops,
      p.stepped,
      p.steps,
    );
  }

  toggle(ev: Event): void {
    ev.stopPropagation();
    this.open = !this.open;
  }

  pick(id: string): void {
    this.presetIdChange.emit(id);
    this.open = false;
  }

  reroll(ev: Event, id: string): void {
    ev.stopPropagation();
    this.rerollPreset.emit(id);
    this.open = false;
  }

  @HostListener('document:click')
  onDocClick(): void {
    this.open = false;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['forceOpen']?.currentValue) {
      this.open = true;
      this.forceOpenConsumed.emit();
    }
  }
}
