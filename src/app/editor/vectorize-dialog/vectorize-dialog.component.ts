import { DecimalPipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  EventEmitter,
  Output,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subject, debounceTime, switchMap, of, catchError, from } from 'rxjs';
import {
  DEFAULT_VECTORIZE_OPTIONS,
  VectorizeOptions,
  VectorizePreset,
  VectorizeResult,
  VectorizeService,
  pathsToSvg,
} from '../../core/services/vectorize.service';
import {
  DEFAULT_RECOGNIZE_OPTIONS,
  RecognizeOptions,
  RecognizeResult,
  ShapeRecognizeService,
} from '../../core/services/shape-recognize.service';

export type VectorizeMode = 'shapes' | 'contours';
export type ApplyResult = RecognizeResult | VectorizeResult;

@Component({
  selector: 'app-vectorize-dialog',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  templateUrl: './vectorize-dialog.component.html',
  styleUrl: './vectorize-dialog.component.scss',
})
export class VectorizeDialogComponent {
  private readonly vectorize = inject(VectorizeService);
  private readonly recognize = inject(ShapeRecognizeService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroyRef = inject(DestroyRef);

  @Output() readonly cancelled = new EventEmitter<void>();
  @Output() readonly applied = new EventEmitter<ApplyResult>();

  readonly open = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  /** Processed bitmap (same pixels/size as vectorization input) for aligned preview. */
  readonly originalPreviewUrl = signal<string | null>(null);
  readonly previewHtml = signal<SafeHtml | null>(null);
  readonly contourResult = signal<VectorizeResult | null>(null);
  readonly shapeResult = signal<RecognizeResult | null>(null);
  readonly options = signal<VectorizeOptions>({ ...DEFAULT_VECTORIZE_OPTIONS });
  readonly recognizeOptions = signal<RecognizeOptions>({ ...DEFAULT_RECOGNIZE_OPTIONS });
  readonly contoursOnly = signal(false);
  readonly mode = signal<VectorizeMode>('shapes');
  /** Shared stage size — identical for original + vector panes. */
  readonly stageW = signal(1);
  readonly stageH = signal(1);

  private sourceImage: ImageData | null = null;
  private readonly retrace$ = new Subject<void>();

  constructor() {
    this.retrace$
      .pipe(
        debounceTime(320),
        switchMap(() => {
          if (!this.sourceImage) return of(null);
          this.busy.set(true);
          this.error.set(null);
          const mode = this.mode();
          const run = (): Promise<ApplyResult> =>
            Promise.resolve().then(() =>
              mode === 'shapes'
                ? this.recognize.recognizeImageData(this.sourceImage!, this.recognizeOptions())
                : this.vectorize.vectorizeImageData(this.sourceImage!, this.options()),
            );
          return from(run()).pipe(
            catchError((err) => {
              this.error.set(
                err instanceof Error ? err.message : 'Vektorisierung fehlgeschlagen.',
              );
              this.busy.set(false);
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res) => {
        this.busy.set(false);
        if (!res) return;
        if (res.kind === 'shapes') {
          this.shapeResult.set(res);
          this.refreshPreview();
        } else {
          this.contourResult.set(res);
          this.refreshPreview();
        }
      });
  }

  async openWithFile(file: File, preset: VectorizePreset = 'balanced'): Promise<void> {
    this.cleanupUrl();
    this.options.set(this.vectorize.optionsFromPreset(preset));
    this.recognizeOptions.set({ ...DEFAULT_RECOGNIZE_OPTIONS });
    this.mode.set('shapes');
    this.contoursOnly.set(false);
    this.contourResult.set(null);
    this.shapeResult.set(null);
    this.previewHtml.set(null);
    this.error.set(null);
    this.open.set(true);
    this.busy.set(true);
    try {
      const loaded = await this.vectorize.loadToImageData(file);
      // Drop file blob URL — we show the processed ImageData so size/position match the vector
      URL.revokeObjectURL(loaded.objectUrl);
      this.sourceImage = loaded.imageData;
      this.stageW.set(loaded.imageData.width);
      this.stageH.set(loaded.imageData.height);
      this.originalPreviewUrl.set(imageDataToPngUrl(loaded.imageData));
      this.retrace$.next();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Bild konnte nicht geladen werden.');
      this.busy.set(false);
    }
  }

  close(): void {
    this.open.set(false);
    this.cleanupUrl();
    this.sourceImage = null;
    this.cancelled.emit();
  }

  apply(): void {
    if (this.mode() === 'shapes') {
      const res = this.shapeResult();
      if (!res) return;
      this.open.set(false);
      this.cleanupUrl();
      this.sourceImage = null;
      this.applied.emit(res);
      return;
    }
    const res = this.contourResult();
    if (!res) return;
    this.open.set(false);
    this.cleanupUrl();
    this.sourceImage = null;
    this.applied.emit(res);
  }

  patchOptions(partial: Partial<VectorizeOptions>): void {
    this.options.update((o) => ({ ...o, ...partial }));
    this.busy.set(true);
    this.retrace$.next();
  }

  patchOption<K extends keyof VectorizeOptions>(key: K, value: VectorizeOptions[K]): void {
    this.patchOptions({ [key]: value } as Partial<VectorizeOptions>);
  }

  patchRecognize(partial: Partial<RecognizeOptions>): void {
    this.recognizeOptions.update((o) => ({ ...o, ...partial }));
    this.busy.set(true);
    this.retrace$.next();
  }

  patchRecognizeOption<K extends keyof RecognizeOptions>(
    key: K,
    value: RecognizeOptions[K],
  ): void {
    this.patchRecognize({ [key]: value } as Partial<RecognizeOptions>);
  }

  setMode(mode: VectorizeMode): void {
    if (this.mode() === mode) return;
    this.mode.set(mode);
    this.error.set(null);
    this.busy.set(true);
    this.retrace$.next();
  }

  setContoursOnly(v: boolean): void {
    this.contoursOnly.set(v);
    this.refreshPreview();
  }

  canApply(): boolean {
    if (this.busy()) return false;
    return this.mode() === 'shapes' ? !!this.shapeResult() : !!this.contourResult();
  }

  private refreshPreview(): void {
    if (this.mode() === 'shapes') {
      const res = this.shapeResult();
      if (!res) {
        this.previewHtml.set(null);
        return;
      }
      const svg = this.recognize.shapesToSvg(
        res.shapes,
        res.width,
        res.height,
        this.contoursOnly(),
      );
      this.previewHtml.set(this.sanitizer.bypassSecurityTrustHtml(svg));
      return;
    }
    const res = this.contourResult();
    if (!res) {
      this.previewHtml.set(null);
      return;
    }
    const svg = pathsToSvg(res.paths, res.width, res.height, this.contoursOnly());
    this.previewHtml.set(this.sanitizer.bypassSecurityTrustHtml(svg));
  }

  private cleanupUrl(): void {
    this.originalPreviewUrl.set(null);
  }
}

function imageDataToPngUrl(imageData: ImageData): string {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}
