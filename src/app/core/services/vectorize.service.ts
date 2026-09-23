import { Injectable } from '@angular/core';
import ImageTracer, { ImageTracerOptions } from 'imagetracerjs';

export type VectorizePreset = 'simple' | 'balanced' | 'detail';

export interface PathGradient {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  c1: string;
  c2: string;
}

export interface TracedPath {
  d: string;
  fill: string;
  gradient?: PathGradient;
}

export interface VectorizeResult {
  paths: TracedPath[];
  width: number;
  height: number;
  svg: string;
}

export interface VectorizeOptions {
  numberofcolors: number;
  pathomit: number;
  blurradius: number;
  ltres: number;
  qtres: number;
  optimize: number;
  removeBackground: boolean;
  removeAiTag: boolean;
  layering: number;
}

export const DEFAULT_VECTORIZE_OPTIONS: VectorizeOptions = {
  numberofcolors: 14,
  pathomit: 18,
  blurradius: 0,
  ltres: 0.85,
  qtres: 0.85,
  optimize: 0.28,
  removeBackground: true,
  removeAiTag: true,
  layering: 0,
};

const PRESET_OPTIONS: Record<VectorizePreset, Partial<VectorizeOptions>> = {
  simple: {
    numberofcolors: 10,
    pathomit: 28,
    blurradius: 1,
    ltres: 1.2,
    qtres: 1.2,
    optimize: 0.4,
  },
  balanced: {
    numberofcolors: 14,
    pathomit: 18,
    blurradius: 0,
    ltres: 0.85,
    qtres: 0.85,
    optimize: 0.28,
  },
  detail: {
    numberofcolors: 20,
    pathomit: 10,
    blurradius: 0,
    ltres: 0.6,
    qtres: 0.6,
    optimize: 0.18,
  },
};

const MAX_EDGE = 1024;
const GRADIENT_THRESHOLD = 55;

@Injectable({ providedIn: 'root' })
export class VectorizeService {
  optionsFromPreset(preset: VectorizePreset): VectorizeOptions {
    return { ...DEFAULT_VECTORIZE_OPTIONS, ...PRESET_OPTIONS[preset] };
  }

  async loadToImageData(file: File): Promise<{ imageData: ImageData; objectUrl: string }> {
    const objectUrl = URL.createObjectURL(file);
    const bitmap = await createImageBitmap(file);
    try {
      const { canvas } = this.toDownscaledCanvas(bitmap);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas-Kontext nicht verfügbar.');
      return {
        imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
        objectUrl,
      };
    } finally {
      bitmap.close();
    }
  }

  async vectorizeFile(
    file: File,
    options: VectorizeOptions = DEFAULT_VECTORIZE_OPTIONS,
  ): Promise<VectorizeResult> {
    const { imageData, objectUrl } = await this.loadToImageData(file);
    URL.revokeObjectURL(objectUrl);
    return this.vectorizeImageData(imageData, options);
  }

  vectorizeImageData(
    source: ImageData,
    options: VectorizeOptions = DEFAULT_VECTORIZE_OPTIONS,
  ): VectorizeResult {
    const width = source.width;
    const height = source.height;
    const data = new Uint8ClampedArray(source.data);

    // Always soft-denoise before tracing
    medianFilter3x3(data, width, height);

    let bgRgb: [number, number, number] | null = null;
    if (options.removeBackground) {
      bgRgb = findDominantColor(data, width, height);
      punchBackground(data, bgRgb, 42);
    }

    if (options.removeAiTag) {
      maskAiTagCorner(data, width, height, bgRgb);
    }

    if (options.blurradius > 0) {
      boxBlurAlphaAware(data, width, height, Math.min(3, Math.round(options.blurradius)));
    }

    // Keep a copy for recolor / gradient sampling (post-punch)
    const sampleData = new Uint8ClampedArray(data);

    const imageData = new ImageData(data, width, height);
    const tracerOpts = this.toTracerOptions(options);
    const rawSvg = ImageTracer.imagedataToSVG(imageData, tracerOpts);
    let paths = this.parseSvgPaths(rawSvg);

    if (options.removeBackground && bgRgb) {
      paths = dropBackgroundPaths(paths, bgRgb);
    }
    if (options.removeAiTag) {
      paths = dropCornerTagPaths(paths, width, height);
    }

    paths = refinePathsFromOriginal(paths, sampleData, width, height);

    if (!paths.length) throw new Error('Keine Konturen erkannt.');

    return {
      paths,
      width,
      height,
      svg: pathsToSvg(paths, width, height, false),
    };
  }

  private toTracerOptions(options: VectorizeOptions): ImageTracerOptions {
    const round = Math.max(0, Math.min(3, Math.round(options.optimize * 3)));
    return {
      numberofcolors: options.numberofcolors,
      pathomit: options.pathomit,
      ltres: options.ltres,
      qtres: options.qtres,
      blurradius: 0,
      blurdelta: 20,
      roundcoords: round,
      strokewidth: 0,
      linefilter: options.optimize >= 0.25,
      rightangleenhance: true,
      colorsampling: 2,
      mincolorratio: 0.01,
      colorquantcycles: 3,
      layering: options.layering,
    };
  }

  private toDownscaledCanvas(bitmap: ImageBitmap): {
    canvas: HTMLCanvasElement;
    width: number;
    height: number;
  } {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas-Kontext nicht verfügbar.');
    ctx.drawImage(bitmap, 0, 0, width, height);
    return { canvas, width, height };
  }

  private parseSvgPaths(svg: string): TracedPath[] {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    if (doc.querySelector('parsererror')) {
      throw new Error('SVG-Parsing fehlgeschlagen.');
    }
    const paths: TracedPath[] = [];
    doc.querySelectorAll('path').forEach((el) => {
      const d = el.getAttribute('d');
      if (!d?.trim()) return;
      const fill = normalizeFill(el.getAttribute('fill') || '#000000');
      if (fill === 'none' || fill === 'transparent') return;
      paths.push({ d, fill });
    });
    return paths;
  }
}

export function pathsToSvg(
  paths: TracedPath[],
  width: number,
  height: number,
  contoursOnly = false,
): string {
  const defs: string[] = [];
  const body = paths
    .map((p, i) => {
      if (contoursOnly) {
        const stroke = p.fill && p.fill !== 'none' ? p.fill : '#1a1a1a';
        return `<path d="${escapeAttr(p.d)}" fill="none" stroke="${escapeAttr(stroke)}" stroke-width="1.25" stroke-linejoin="round"/>`;
      }
      if (p.gradient) {
        const id = `g${i}`;
        const g = p.gradient;
        defs.push(
          `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}"><stop offset="0%" stop-color="${escapeAttr(g.c1)}"/><stop offset="100%" stop-color="${escapeAttr(g.c2)}"/></linearGradient>`,
        );
        return `<path d="${escapeAttr(p.d)}" fill="url(#${id})" stroke="none"/>`;
      }
      return `<path d="${escapeAttr(p.d)}" fill="${escapeAttr(p.fill)}" stroke="none"/>`;
    })
    .join('');
  const defsBlock = defs.length ? `<defs>${defs.join('')}</defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet">${defsBlock}${body}</svg>`;
}

function refinePathsFromOriginal(
  paths: TracedPath[],
  data: Uint8ClampedArray,
  width: number,
  height: number,
): TracedPath[] {
  return paths.map((p) => {
    const box = roughPathBBox(p.d);
    if (!box) return p;

    const x0 = clamp(Math.floor(box.x), 0, width - 1);
    const y0 = clamp(Math.floor(box.y), 0, height - 1);
    const x1 = clamp(Math.ceil(box.x + box.w), 0, width - 1);
    const y1 = clamp(Math.ceil(box.y + box.h), 0, height - 1);

    const median = sampleMedianColor(data, width, height, x0, y0, x1, y1);
    if (!median) return p;

    const fill = rgbToHex(median[0], median[1], median[2]);
    const horizontal = box.w >= box.h;
    const cA = sampleAverageColor(
      data,
      width,
      height,
      horizontal ? x0 : Math.floor((x0 + x1) / 2) - 1,
      horizontal ? Math.floor((y0 + y1) / 2) - 1 : y0,
      horizontal ? x0 + Math.max(2, Math.floor(box.w * 0.2)) : Math.floor((x0 + x1) / 2) + 1,
      horizontal ? Math.floor((y0 + y1) / 2) + 1 : y0 + Math.max(2, Math.floor(box.h * 0.2)),
    );
    const cB = sampleAverageColor(
      data,
      width,
      height,
      horizontal ? x1 - Math.max(2, Math.floor(box.w * 0.2)) : Math.floor((x0 + x1) / 2) - 1,
      horizontal ? Math.floor((y0 + y1) / 2) - 1 : y1 - Math.max(2, Math.floor(box.h * 0.2)),
      horizontal ? x1 : Math.floor((x0 + x1) / 2) + 1,
      horizontal ? Math.floor((y0 + y1) / 2) + 1 : y1,
    );

    if (cA && cB && colorDist(cA, cB) >= GRADIENT_THRESHOLD && box.w * box.h > 400) {
      return {
        d: p.d,
        fill,
        gradient: {
          x1: horizontal ? box.x : box.x + box.w / 2,
          y1: horizontal ? box.y + box.h / 2 : box.y,
          x2: horizontal ? box.x + box.w : box.x + box.w / 2,
          y2: horizontal ? box.y + box.h / 2 : box.y + box.h,
          c1: rgbToHex(cA[0], cA[1], cA[2]),
          c2: rgbToHex(cB[0], cB[1], cB[2]),
        },
      };
    }

    return { d: p.d, fill };
  });
}

function sampleMedianColor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [number, number, number] | null {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const stepX = Math.max(1, Math.floor((x1 - x0) / 24));
  const stepY = Math.max(1, Math.floor((y1 - y0) / 24));
  for (let y = y0; y <= y1; y += stepY) {
    for (let x = x0; x <= x1; x += stepX) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const i = (y * width + x) * 4;
      if (data[i + 3] < 24) continue;
      rs.push(data[i]);
      gs.push(data[i + 1]);
      bs.push(data[i + 2]);
    }
  }
  if (!rs.length) return null;
  return [medianOf(rs), medianOf(gs), medianOf(bs)];
}

function sampleAverageColor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [number, number, number] | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const xa = clamp(Math.min(x0, x1), 0, width - 1);
  const xb = clamp(Math.max(x0, x1), 0, width - 1);
  const ya = clamp(Math.min(y0, y1), 0, height - 1);
  const yb = clamp(Math.max(y0, y1), 0, height - 1);
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 24) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
  }
  if (!n) return null;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

function medianOf(vals: number[]): number {
  const a = [...vals].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function medianFilter3x3(data: Uint8ClampedArray, width: number, height: number): void {
  const src = new Uint8ClampedArray(data);
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const as: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      rs.length = 0;
      gs.length = 0;
      bs.length = 0;
      as.length = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const i = (yy * width + xx) * 4;
          rs.push(src[i]);
          gs.push(src[i + 1]);
          bs.push(src[i + 2]);
          as.push(src[i + 3]);
        }
      }
      const o = (y * width + x) * 4;
      data[o] = medianOf(rs);
      data[o + 1] = medianOf(gs);
      data[o + 2] = medianOf(bs);
      data[o + 3] = medianOf(as);
    }
  }
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function normalizeFill(fill: string): string {
  const f = fill.trim();
  if (f.startsWith('rgb')) {
    const m = f.match(/([\d.]+)/g);
    if (m && m.length >= 3) {
      return rgbToHex(Math.round(+m[0]), Math.round(+m[1]), Math.round(+m[2]));
    }
  }
  return f;
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function toHex(n: number): string {
  return Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
}

function parseHex(hex: string): [number, number, number] | null {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  if (h.length >= 6) {
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  return null;
}

function colorDist(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function findDominantColor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): [number, number, number] {
  const counts = new Map<number, number>();
  const bump = (r: number, g: number, b: number, w = 1) => {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    counts.set(key, (counts.get(key) ?? 0) + w);
  };

  const sample = (x: number, y: number, w = 1) => {
    const i = (y * width + x) * 4;
    if (data[i + 3] < 16) return;
    bump(data[i], data[i + 1], data[i + 2], w);
  };

  for (let x = 0; x < width; x += 2) {
    sample(x, 0, 3);
    sample(x, height - 1, 3);
  }
  for (let y = 0; y < height; y += 2) {
    sample(0, y, 3);
    sample(width - 1, y, 3);
  }
  const step = Math.max(2, Math.floor(Math.min(width, height) / 80));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) sample(x, y, 1);
  }

  let bestKey = 0;
  let best = 0;
  for (const [k, v] of counts) {
    if (v > best) {
      best = v;
      bestKey = k;
    }
  }
  return [((bestKey >> 10) & 31) << 3, ((bestKey >> 5) & 31) << 3, (bestKey & 31) << 3];
}

function punchBackground(
  data: Uint8ClampedArray,
  bg: [number, number, number],
  tolerance: number,
): void {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 8) continue;
    if (colorDist([data[i], data[i + 1], data[i + 2]], bg) <= tolerance) data[i + 3] = 0;
  }
}

function maskAiTagCorner(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  bg: [number, number, number] | null,
): void {
  const rw = Math.max(8, Math.round(width * 0.2));
  const rh = Math.max(8, Math.round(height * 0.14));
  const x0 = width - rw;
  const y0 = 0;

  let opaque = 0;
  let badgeLike = 0;
  for (let y = y0; y < y0 + rh; y++) {
    for (let x = x0; x < x0 + rw; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 16) continue;
      opaque++;
      const rgb: [number, number, number] = [data[i], data[i + 1], data[i + 2]];
      const nearBg = bg ? colorDist(rgb, bg) < 50 : false;
      const gray =
        Math.abs(rgb[0] - rgb[1]) < 18 &&
        Math.abs(rgb[1] - rgb[2]) < 18 &&
        rgb[0] > 40 &&
        rgb[0] < 230;
      const darkText = rgb[0] < 60 && rgb[1] < 60 && rgb[2] < 60;
      if (nearBg || gray || darkText) badgeLike++;
    }
  }
  if (opaque < 20 || badgeLike / opaque < 0.45) return;

  let bleed = 0;
  let edge = 0;
  for (let y = y0; y < y0 + rh; y++) {
    const i = (y * width + x0) * 4;
    edge++;
    if (data[i + 3] > 200) {
      const rgb: [number, number, number] = [data[i], data[i + 1], data[i + 2]];
      if (!bg || colorDist(rgb, bg) > 55) bleed++;
    }
  }
  if (bleed / Math.max(1, edge) > 0.55) return;

  for (let y = y0; y < y0 + rh; y++) {
    for (let x = x0; x < x0 + rw; x++) {
      data[(y * width + x) * 4 + 3] = 0;
    }
  }
}

function boxBlurAlphaAware(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): void {
  if (radius < 1) return;
  const src = new Uint8ClampedArray(data);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let aSum = 0;
      let n = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const i = (yy * width + xx) * 4;
          if (src[i + 3] < 8) continue;
          rSum += src[i];
          gSum += src[i + 1];
          bSum += src[i + 2];
          aSum += src[i + 3];
          n++;
        }
      }
      const o = (y * width + x) * 4;
      if (!n) {
        data[o + 3] = 0;
        continue;
      }
      data[o] = Math.round(rSum / n);
      data[o + 1] = Math.round(gSum / n);
      data[o + 2] = Math.round(bSum / n);
      data[o + 3] = Math.round(aSum / n);
    }
  }
}

function dropBackgroundPaths(paths: TracedPath[], bg: [number, number, number]): TracedPath[] {
  return paths.filter((p) => {
    const rgb = parseHex(p.fill);
    if (!rgb) return true;
    return colorDist(rgb, bg) > 48;
  });
}

function dropCornerTagPaths(paths: TracedPath[], width: number, height: number): TracedPath[] {
  const xMin = width * 0.72;
  const yMax = height * 0.22;
  const maxArea = width * height * 0.06;
  return paths.filter((p) => {
    const box = roughPathBBox(p.d);
    if (!box) return true;
    const area = box.w * box.h;
    const inCorner = box.x >= xMin && box.y + box.h <= yMax && box.y >= 0;
    if (inCorner && area < maxArea) return false;
    return true;
  });
}

function roughPathBBox(d: string): { x: number; y: number; w: number; h: number } | null {
  const nums = d.match(/-?\d*\.?\d+/g);
  if (!nums || nums.length < 4) return null;
  const vals = nums.map(Number).filter((n) => !Number.isNaN(n));
  if (vals.length < 4) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < vals.length; i += 2) {
    minX = Math.min(minX, vals[i]);
    maxX = Math.max(maxX, vals[i]);
    minY = Math.min(minY, vals[i + 1]);
    maxY = Math.max(maxY, vals[i + 1]);
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
}
