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

@Component({
  selector: 'app-vectorize-dialog',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  templateUrl: './vectorize-dialog.component.html',
  styleUrl: './vectorize-dialog.component.scss',
})
export class VectorizeDialogComponent {
  private readonly vectorize = inject(VectorizeService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroyRef = inject(DestroyRef);

  @Output() readonly cancelled = new EventEmitter<void>();
  @Output() readonly applied = new EventEmitter<VectorizeResult>();

  readonly open = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly originalUrl = signal<string | null>(null);
  readonly previewHtml = signal<SafeHtml | null>(null);
  readonly result = signal<VectorizeResult | null>(null);
  readonly options = signal<VectorizeOptions>({ ...DEFAULT_VECTORIZE_OPTIONS });
  readonly contoursOnly = signal(false);

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
          return from(
            Promise.resolve().then(() =>
              this.vectorize.vectorizeImageData(this.sourceImage!, this.options()),
            ),
          ).pipe(
            catchError((err) => {
              this.error.set(err instanceof Error ? err.message : 'Vektorisierung fehlgeschlagen.');
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
        this.result.set(res);
        this.refreshPreview(res);
      });
  }

  async openWithFile(file: File, preset: VectorizePreset = 'balanced'): Promise<void> {
    this.cleanupUrl();
    this.options.set(this.vectorize.optionsFromPreset(preset));
    this.contoursOnly.set(false);
    this.result.set(null);
    this.previewHtml.set(null);
    this.error.set(null);
    this.open.set(true);
    this.busy.set(true);
    try {
      const loaded = await this.vectorize.loadToImageData(file);
      this.sourceImage = loaded.imageData;
      this.originalUrl.set(loaded.objectUrl);
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
    const res = this.result();
    if (!res) return;
    this.open.set(false);
    this.cleanupUrl();
    this.sourceImage = null;
    this.applied.emit(res);
  }

  setContoursOnly(v: boolean): void {
    this.contoursOnly.set(v);
    const res = this.result();
    if (res) this.refreshPreview(res);
  }

  patchOptions(partial: Partial<VectorizeOptions>): void {
    this.options.update((o) => ({ ...o, ...partial }));
    this.retrace$.next();
  }

  patchOption<K extends keyof VectorizeOptions>(key: K, value: VectorizeOptions[K]): void {
    this.patchOptions({ [key]: value } as Partial<VectorizeOptions>);
  }

  private refreshPreview(res: VectorizeResult): void {
    const svg = pathsToSvg(res.paths, res.width, res.height, this.contoursOnly());
    this.previewHtml.set(this.sanitizer.bypassSecurityTrustHtml(svg));
  }

  private cleanupUrl(): void {
    const url = this.originalUrl();
    if (url) URL.revokeObjectURL(url);
    this.originalUrl.set(null);
  }
}
