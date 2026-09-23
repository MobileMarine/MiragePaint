/** Shared raster preprocessing for contour tracing and shape recognition. */

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function medianOf(vals: number[]): number {
  const a = [...vals].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
}

export function colorDist(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function toHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
}

export function parseHex(hex: string): [number, number, number] | null {
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

export function medianFilter3x3(data: Uint8ClampedArray, width: number, height: number): void {
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

export function findDominantColor(
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

export function punchBackground(
  data: Uint8ClampedArray,
  bg: [number, number, number],
  tolerance: number,
): void {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 8) continue;
    if (colorDist([data[i], data[i + 1], data[i + 2]], bg) <= tolerance) data[i + 3] = 0;
  }
}

export function maskAiTagCorner(
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

export function boxBlurAlphaAware(
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

/** Apply shared cleanup: median denoise, optional bg punch + AI-tag mask. */
export function preprocessImageData(
  source: ImageData,
  opts: { removeBackground: boolean; removeAiTag: boolean; blurRadius?: number },
): { data: Uint8ClampedArray; width: number; height: number; bgRgb: [number, number, number] | null } {
  const width = source.width;
  const height = source.height;
  const data = new Uint8ClampedArray(source.data);
  medianFilter3x3(data, width, height);

  let bgRgb: [number, number, number] | null = null;
  if (opts.removeBackground) {
    // Skip bg punch when the border is mostly transparent (no solid backdrop)
    if (!isBorderMostlyTransparent(data, width, height)) {
      bgRgb = findDominantColor(data, width, height);
      punchBackground(data, bgRgb, 55);
    }
  }
  if (opts.removeAiTag) {
    maskAiTagCorner(data, width, height, bgRgb);
  }
  if (opts.blurRadius && opts.blurRadius > 0) {
    boxBlurAlphaAware(data, width, height, Math.min(3, Math.round(opts.blurRadius)));
  }
  return { data, width, height, bgRgb };
}

function isBorderMostlyTransparent(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): boolean {
  let transparent = 0;
  let total = 0;
  const sample = (x: number, y: number) => {
    total++;
    if (data[(y * width + x) * 4 + 3] < 16) transparent++;
  };
  for (let x = 0; x < width; x += 2) {
    sample(x, 0);
    sample(x, height - 1);
  }
  for (let y = 0; y < height; y += 2) {
    sample(0, y);
    sample(width - 1, y);
  }
  return total > 0 && transparent / total > 0.55;
}
