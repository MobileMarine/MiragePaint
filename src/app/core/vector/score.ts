import { Shape } from '../models/shape';

export interface PixelScore {
  rmse: number;
  /** 0–1, higher is better */
  ssim: number;
  /** Combined 0–1 score: higher is better */
  score: number;
}

export interface StructureScore {
  /** Reference primitive counts by kind */
  reference: Record<string, number>;
  /** Detected primitive counts by kind */
  detected: Record<string, number>;
  /** Fraction of reference kinds that were also detected (0–1) */
  kindRecall: number;
  /** |detected - reference| absolute count error, normalized */
  countError: number;
}

/** RMSE of RGB over opaque pixels (or all if both fully opaque). */
export function rmseImageData(a: ImageData, b: ImageData): number {
  const n = Math.min(a.data.length, b.data.length);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i += 4) {
    const aa = a.data[i + 3];
    const ba = b.data[i + 3];
    if (aa < 8 && ba < 8) continue;
    const dr = a.data[i] - b.data[i];
    const dg = a.data[i + 1] - b.data[i + 1];
    const db = a.data[i + 2] - b.data[i + 2];
    const da = aa - ba;
    sum += dr * dr + dg * dg + db * db + da * da * 0.25;
    count++;
  }
  if (!count) return 0;
  return Math.sqrt(sum / (count * 4));
}

/**
 * Simplified windowed SSIM on luminance (8×8 windows, stride 4).
 * Returns mean SSIM in [0, 1].
 */
export function ssimImageData(a: ImageData, b: ImageData): number {
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  const win = 8;
  const stride = 4;
  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;

  const lum = (data: Uint8ClampedArray, x: number, y: number, width: number) => {
    const i = (y * width + x) * 4;
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  };

  let sum = 0;
  let n = 0;
  for (let y = 0; y + win <= h; y += stride) {
    for (let x = 0; x + win <= w; x += stride) {
      let sumA = 0;
      let sumB = 0;
      let sumAA = 0;
      let sumBB = 0;
      let sumAB = 0;
      const m = win * win;
      for (let dy = 0; dy < win; dy++) {
        for (let dx = 0; dx < win; dx++) {
          const la = lum(a.data, x + dx, y + dy, a.width);
          const lb = lum(b.data, x + dx, y + dy, b.width);
          sumA += la;
          sumB += lb;
          sumAA += la * la;
          sumBB += lb * lb;
          sumAB += la * lb;
        }
      }
      const muA = sumA / m;
      const muB = sumB / m;
      const sigmaA = sumAA / m - muA * muA;
      const sigmaB = sumBB / m - muB * muB;
      const sigmaAB = sumAB / m - muA * muB;
      const s =
        ((2 * muA * muB + C1) * (2 * sigmaAB + C2)) /
        ((muA * muA + muB * muB + C1) * (sigmaA + sigmaB + C2));
      sum += Math.max(0, Math.min(1, s));
      n++;
    }
  }
  return n ? sum / n : 1;
}

export function pixelScore(original: ImageData, result: ImageData): PixelScore {
  const rmse = rmseImageData(original, result);
  const ssim = ssimImageData(original, result);
  // Normalize RMSE (~0–255) into a 0–1 quality term
  const rmseTerm = Math.max(0, 1 - rmse / 80);
  const score = 0.55 * ssim + 0.45 * rmseTerm;
  return { rmse, ssim, score };
}

function countKinds(shapes: Shape[]): Record<string, number> {
  const counts: Record<string, number> = {};
  const walk = (list: Shape[]) => {
    for (const s of list) {
      if (s.type === 'group') {
        walk((s.params as { children: Shape[] }).children);
        continue;
      }
      let kind: string = s.type;
      if (s.type === 'ellipse') {
        const p = s.params as { rx: number; ry: number };
        if (Math.abs(p.rx - p.ry) / Math.max(p.rx, p.ry, 1) < 0.08) kind = 'circle';
      }
      counts[kind] = (counts[kind] ?? 0) + 1;
    }
  };
  walk(shapes);
  return counts;
}

/** Parse a simple SVG string into coarse primitive kind counts. */
export function countSvgPrimitives(svg: string): Record<string, number> {
  const counts: Record<string, number> = {};
  const bump = (k: string) => {
    counts[k] = (counts[k] ?? 0) + 1;
  };
  const re = /<(circle|ellipse|rect|line|polygon|path)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    const tag = m[1].toLowerCase();
    if (tag === 'circle') bump('circle');
    else if (tag === 'ellipse') bump('ellipse');
    else if (tag === 'rect') bump('rect');
    else if (tag === 'line') bump('line');
    else if (tag === 'polygon') bump('polygon');
    else if (tag === 'path') bump('polygon');
  }
  return counts;
}

export function structureScore(
  referenceSvgOrShapes: string | Shape[],
  detected: Shape[],
): StructureScore {
  const reference =
    typeof referenceSvgOrShapes === 'string'
      ? countSvgPrimitives(referenceSvgOrShapes)
      : countKinds(referenceSvgOrShapes);
  const det = countKinds(detected);

  const kinds = new Set([...Object.keys(reference), ...Object.keys(det)]);
  let matched = 0;
  let refKinds = 0;
  let absErr = 0;
  let totalRef = 0;
  for (const k of kinds) {
    const r = reference[k] ?? 0;
    const d = det[k] ?? 0;
    if (r > 0) {
      refKinds++;
      if (d > 0) matched++;
      totalRef += r;
    }
    absErr += Math.abs(r - d);
  }
  const kindRecall = refKinds ? matched / refKinds : 1;
  const countError = totalRef ? absErr / totalRef : absErr > 0 ? 1 : 0;
  return { reference, detected: det, kindRecall, countError };
}

/** Overall bench score combining pixel + structure + complexity penalty. */
export function overallScore(
  pixel: PixelScore,
  structure: StructureScore,
  shapeCount: number,
  targetCount?: number,
): number {
  const complexity =
    targetCount && targetCount > 0
      ? Math.max(0, 1 - Math.abs(shapeCount - targetCount) / (targetCount * 2))
      : Math.max(0, 1 - shapeCount / 80);
  return (
    0.5 * pixel.score +
    0.3 * structure.kindRecall +
    0.1 * (1 - Math.min(1, structure.countError)) +
    0.1 * complexity
  );
}
