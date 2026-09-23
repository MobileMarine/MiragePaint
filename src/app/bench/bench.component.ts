import { DecimalPipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  DEFAULT_RECOGNIZE_OPTIONS,
  RecognizeOptions,
  ShapeRecognizeService,
} from '../core/services/shape-recognize.service';
import {
  overallScore,
  pixelScore,
  PixelScore,
  structureScore,
  StructureScore,
} from '../core/vector/score';

interface SampleMeta {
  name: string;
  svg: string;
  png?: string;
  targetCount?: number;
}

interface SampleResult {
  name: string;
  originalUrl: string;
  previewHtml: SafeHtml;
  shapeCount: number;
  pixel: PixelScore;
  structure: StructureScore;
  overall: number;
  error?: string;
}

@Component({
  selector: 'app-bench',
  standalone: true,
  imports: [FormsModule, DecimalPipe, RouterLink],
  templateUrl: './bench.component.html',
  styleUrl: './bench.component.scss',
})
export class BenchComponent implements OnInit {
  private readonly recognize = inject(ShapeRecognizeService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly busy = signal(false);
  readonly results = signal<SampleResult[]>([]);
  readonly options = signal<RecognizeOptions>({ ...DEFAULT_RECOGNIZE_OPTIONS });
  readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.runAll();
  }

  patchOption<K extends keyof RecognizeOptions>(key: K, value: RecognizeOptions[K]): void {
    this.options.update((o) => ({ ...o, [key]: value }));
  }

  async runAll(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.results.set([]);
    try {
      const index = (await fetch('/samples/index.json').then((r) => r.json())) as SampleMeta[];
      const out: SampleResult[] = [];
      for (const sample of index) {
        out.push(await this.runSample(sample));
        this.results.set([...out]);
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Bench fehlgeschlagen.');
    } finally {
      this.busy.set(false);
    }
  }

  private async runSample(sample: SampleMeta): Promise<SampleResult> {
    const svgText = await fetch(`/samples/${sample.svg}`).then((r) => r.text());
    let imageData: ImageData;
    let originalUrl: string;

    if (sample.png) {
      const blob = await fetch(`/samples/${sample.png}`).then((r) => r.blob());
      originalUrl = URL.createObjectURL(blob);
      imageData = await this.blobToImageData(blob);
    } else {
      const raster = await this.rasterizeSvg(svgText, 256);
      imageData = raster.imageData;
      originalUrl = raster.dataUrl;
    }

    try {
      const result = this.recognize.recognizeImageData(imageData, this.options());
      const previewSvg = this.recognize.shapesToSvg(
        result.shapes,
        result.width,
        result.height,
        false,
      );
      const rendered = await this.rasterizeSvg(previewSvg, imageData.width);
      // Match sizes
      const aligned = this.resizeImageData(rendered.imageData, imageData.width, imageData.height);
      const pixel = pixelScore(imageData, aligned);
      const structure = structureScore(svgText, result.shapes);
      const overall = overallScore(pixel, structure, result.shapes.length, sample.targetCount);

      return {
        name: sample.name,
        originalUrl,
        previewHtml: this.sanitizer.bypassSecurityTrustHtml(previewSvg),
        shapeCount: result.shapes.length,
        pixel,
        structure,
        overall,
      };
    } catch (err) {
      return {
        name: sample.name,
        originalUrl,
        previewHtml: this.sanitizer.bypassSecurityTrustHtml('<svg></svg>'),
        shapeCount: 0,
        pixel: { rmse: 255, ssim: 0, score: 0 },
        structure: { reference: {}, detected: {}, kindRecall: 0, countError: 1 },
        overall: 0,
        error: err instanceof Error ? err.message : 'Fehler',
      };
    }
  }

  private async blobToImageData(blob: Blob): Promise<ImageData> {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  private async rasterizeSvg(
    svg: string,
    size: number,
  ): Promise<{ imageData: ImageData; dataUrl: string }> {
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    try {
      const img = await this.loadImage(url);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      return {
        imageData: ctx.getImageData(0, 0, size, size),
        dataUrl: canvas.toDataURL('image/png'),
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'));
      img.src = url;
    });
  }

  private resizeImageData(src: ImageData, w: number, h: number): ImageData {
    if (src.width === w && src.height === h) return src;
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    const ctx = c.getContext('2d')!;
    ctx.putImageData(src, 0, 0);
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const octx = out.getContext('2d', { willReadFrequently: true })!;
    octx.drawImage(c, 0, 0, w, h);
    return octx.getImageData(0, 0, w, h);
  }

  formatKinds(counts: Record<string, number>): string {
    return Object.entries(counts)
      .map(([k, v]) => `${k}:${v}`)
      .join(', ') || '—';
  }
}
