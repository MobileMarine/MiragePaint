/** k-means++ color quantization in CIELAB with fixed seed for stable previews. */

export interface LabColor {
  L: number;
  a: number;
  b: number;
}

export interface QuantizeResult {
  /** Palette in sRGB [0–255] */
  palette: [number, number, number][];
  /** Per-pixel palette index, or -1 for transparent */
  indices: Int16Array;
  width: number;
  height: number;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  const s = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(s * 255)));
}

export function rgbToLab(r: number, g: number, b: number): LabColor {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  let x = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  let y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
  let z = R * 0.0193339 + G * 0.119192 + B * 0.9503041;
  // D65 white
  x /= 0.95047;
  y /= 1;
  z /= 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function labToRgb(lab: LabColor): [number, number, number] {
  const fy = (lab.L + 16) / 116;
  const fx = lab.a / 500 + fy;
  const fz = fy - lab.b / 200;
  const inv = (t: number) => {
    const t3 = t * t * t;
    return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787;
  };
  const x = inv(fx) * 0.95047;
  const y = inv(fy);
  const z = inv(fz) * 1.08883;
  const R = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
  const G = x * -0.969266 + y * 1.8760108 + z * 0.041556;
  const B = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;
  return [linearToSrgb(R), linearToSrgb(G), linearToSrgb(B)];
}

export function labDist(a: LabColor, b: LabColor): number {
  return Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b);
}

/**
 * Quantize opaque pixels into `k` colors using k-means++ in CIELAB.
 * Transparent pixels (alpha < 24) get index -1.
 */
export function quantizeImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  k: number,
  seed = 42,
): QuantizeResult {
  const labs: LabColor[] = [];
  const pixelIdx: number[] = []; // flat pixel index into data/4
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (data[i + 3] < 24) continue;
    labs.push(rgbToLab(data[i], data[i + 1], data[i + 2]));
    pixelIdx.push(p);
  }

  const n = labs.length;
  const colors = Math.max(1, Math.min(k, n || 1));
  const centroids: LabColor[] = [];
  const rand = mulberry32(seed);

  if (n === 0) {
    return {
      palette: [[0, 0, 0]],
      indices: new Int16Array(width * height).fill(-1),
      width,
      height,
    };
  }

  // k-means++ init
  centroids.push({ ...labs[Math.floor(rand() * n)] });
  const minD2 = new Float64Array(n).fill(Infinity);
  while (centroids.length < colors) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const d = labDist(labs[i], centroids[centroids.length - 1]);
      const d2 = d * d;
      if (d2 < minD2[i]) minD2[i] = d2;
      sum += minD2[i];
    }
    let target = rand() * sum;
    let pick = 0;
    for (let i = 0; i < n; i++) {
      target -= minD2[i];
      if (target <= 0) {
        pick = i;
        break;
      }
    }
    centroids.push({ ...labs[pick] });
  }

  const assign = new Int16Array(n);
  const maxIter = 12;
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = 0;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d = labDist(labs[i], centroids[c]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (assign[i] !== best) {
        assign[i] = best;
        changed++;
      }
    }
    // recompute centroids
    const sums = centroids.map(() => ({ L: 0, a: 0, b: 0, n: 0 }));
    for (let i = 0; i < n; i++) {
      const s = sums[assign[i]];
      s.L += labs[i].L;
      s.a += labs[i].a;
      s.b += labs[i].b;
      s.n++;
    }
    for (let c = 0; c < centroids.length; c++) {
      if (sums[c].n === 0) continue;
      centroids[c] = {
        L: sums[c].L / sums[c].n,
        a: sums[c].a / sums[c].n,
        b: sums[c].b / sums[c].n,
      };
    }
    if (changed === 0) break;
  }

  const palette = centroids.map((c) => labToRgb(c));
  const indices = new Int16Array(width * height).fill(-1);
  for (let i = 0; i < n; i++) {
    indices[pixelIdx[i]] = assign[i];
  }

  return { palette, indices, width, height };
}
