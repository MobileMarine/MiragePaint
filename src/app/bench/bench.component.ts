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
  countSvgPrimitives,
  overallScore,
  pixelScore,
  PixelScore,
  structureScore,
  StructureScore,
} from '../core/vector/score';

/** Build-time discovery of sample SVGs under public/samples/{simple,medium}. */
const SAMPLE_SVGS = import.meta.glob('../../../public/samples/{simple,medium}/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

interface SampleMeta {
  name: string;
  tier: string;
  svgText: string;
  publicPath: string;
  targetCount: number;
}

interface SampleResult {
  name: string;
  originalUrl: string;
  previewHtml: SafeHtml;
  shapeCount: number;
  targetCount: number;
  pixel: PixelScore;
  structure: StructureScore;
  overall: number;
  error?: string;
}

function discoverSamples(): SampleMeta[] {
  const samples: SampleMeta[] = [];
  for (const [path, svgText] of Object.entries(SAMPLE_SVGS)) {
    const normalized = path.replace(/\\/g, '/');
    const match = /\/samples\/(simple|medium)\/([^/]+)\.svg$/i.exec(normalized);
    if (!match) continue;
    const tier = match[1];
    const base = match[2];
    const counts = countSvgPrimitives(svgText);
    const targetCount = Object.values(counts).reduce((a, b) => a + b, 0);
    samples.push({
      name: `${tier}/${base}`,
      tier,
      svgText,
      publicPath: `/samples/${tier}/${base}.svg`,
      targetCount,
    });
  }
  samples.sort((a, b) => a.name.localeCompare(b.name));
  return samples;
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
      const samples = discoverSamples();
      if (!samples.length) {
        throw new Error('Keine Samples unter /samples/simple oder /samples/medium gefunden.');
      }
      const out: SampleResult[] = [];
      for (const sample of samples) {
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
    const svgText = sample.svgText;
    let imageData: ImageData;
    let originalUrl: string;

    const pngPath = sample.publicPath.replace(/\.svg$/i, '.png');
    const pngBlob = await this.tryFetchBlob(pngPath);
    if (pngBlob) {
      originalUrl = URL.createObjectURL(pngBlob);
      imageData = await this.blobToImageData(pngBlob);
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
      const aligned = this.resizeImageData(rendered.imageData, imageData.width, imageData.height);
      const pixel = pixelScore(imageData, aligned);
      const structure = structureScore(svgText, result.shapes);
      const overall = overallScore(pixel, structure, result.shapes.length, sample.targetCount);

      return {
        name: sample.name,
        originalUrl,
        previewHtml: this.sanitizer.bypassSecurityTrustHtml(previewSvg),
        shapeCount: result.shapes.length,
        targetCount: sample.targetCount,
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
        targetCount: sample.targetCount,
        pixel: { rmse: 255, ssim: 0, score: 0 },
        structure: { reference: {}, detected: {}, kindRecall: 0, countError: 1 },
        overall: 0,
        error: err instanceof Error ? err.message : 'Fehler',
      };
    }
  }

  private async tryFetchBlob(url: string): Promise<Blob | null> {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return await res.blob();
    } catch {
      return null;
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
