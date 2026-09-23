import { FillGradient } from '../models/shape';
import { rgbToHex } from './preprocess';
import { Region, RegionMap } from './regions';

export interface RegionColor {
  fill: string;
  gradient?: FillGradient;
}

/**
 * Sample median/mean color from original pixels covered by the region,
 * and optionally fit a linear gradient when color varies strongly.
 */
export function sampleRegionColor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  region: Region,
  enableGradients: boolean,
  gradientThreshold = 48,
): RegionColor {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];

  // For least-squares plane fit: color ≈ a*x + b*y + c
  let n = 0;
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumYY = 0;
  let sumXY = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumXR = 0;
  let sumYR = 0;
  let sumXG = 0;
  let sumYG = 0;
  let sumXB = 0;
  let sumYB = 0;

  const step = Math.max(1, Math.floor(region.pixels.length / 800));
  for (let i = 0; i < region.pixels.length; i += step) {
    const p = region.pixels[i];
    const x = p % width;
    const y = (p / width) | 0;
    const o = p * 4;
    if (data[o + 3] < 24) continue;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    rs.push(r);
    gs.push(g);
    bs.push(b);
    n++;
    sumX += x;
    sumY += y;
    sumXX += x * x;
    sumYY += y * y;
    sumXY += x * y;
    sumR += r;
    sumG += g;
    sumB += b;
    sumXR += x * r;
    sumYR += y * r;
    sumXG += x * g;
    sumYG += y * g;
    sumXB += x * b;
    sumYB += y * b;
  }

  if (!n) return { fill: '#888888' };

  rs.sort((a, b) => a - b);
  gs.sort((a, b) => a - b);
  bs.sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  const fill = rgbToHex(rs[mid], gs[mid], bs[mid]);

  if (!enableGradients || n < 20 || region.area < 200) {
    return { fill };
  }

  // Solve 2D linear regression for luminance gradient direction
  // Using normal equations for L ≈ ax + by + c where L = 0.299R+0.587G+0.114B
  const det =
    n * (sumXX * sumYY - sumXY * sumXY) -
    sumX * (sumX * sumYY - sumXY * sumY) +
    sumY * (sumX * sumXY - sumXX * sumY);

  if (Math.abs(det) < 1e-6) return { fill };

  // Fit each channel roughly via luminance plane for direction
  let sumL = 0;
  let sumXL = 0;
  let sumYL = 0;
  for (let i = 0; i < region.pixels.length; i += step) {
    const p = region.pixels[i];
    const x = p % width;
    const y = (p / width) | 0;
    const o = p * 4;
    if (data[o + 3] < 24) continue;
    const L = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
    sumL += L;
    sumXL += x * L;
    sumYL += y * L;
  }

  // Cramer's rule-ish for a, b in L = a x + b y + c
  // Using reduced system from centering
  const meanX = sumX / n;
  const meanY = sumY / n;
  const meanL = sumL / n;
  let varX = 0;
  let varY = 0;
  let covXY = 0;
  let covXL = 0;
  let covYL = 0;
  for (let i = 0; i < region.pixels.length; i += step) {
    const p = region.pixels[i];
    const x = (p % width) - meanX;
    const y = ((p / width) | 0) - meanY;
    const o = p * 4;
    if (data[o + 3] < 24) continue;
    const L = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2] - meanL;
    varX += x * x;
    varY += y * y;
    covXY += x * y;
    covXL += x * L;
    covYL += y * L;
  }
  const denom = varX * varY - covXY * covXY;
  if (Math.abs(denom) < 1e-6) return { fill };

  const a = (covXL * varY - covYL * covXY) / denom;
  const b = (covYL * varX - covXL * covXY) / denom;
  const gradMag = Math.hypot(a, b);

  // Estimate color spread along gradient
  const angle = Math.atan2(b, a);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  // Sample ends of bbox along gradient
  const hw = (region.maxX - region.minX) / 2;
  const hh = (region.maxY - region.minY) / 2;
  const reach = Math.hypot(hw, hh) * 0.7;
  const xA = region.cx - cos * reach;
  const yA = region.cy - sin * reach;
  const xB = region.cx + cos * reach;
  const yB = region.cy + sin * reach;

  const sampleNear = (sx: number, sy: number): [number, number, number] | null => {
    let r = 0;
    let g = 0;
    let bl = 0;
    let cnt = 0;
    const r0 = 3;
    for (let dy = -r0; dy <= r0; dy++) {
      for (let dx = -r0; dx <= r0; dx++) {
        const x = Math.round(sx + dx);
        const y = Math.round(sy + dy);
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const p = y * width + x;
        if (!region.pixels.includes(p) && Math.hypot(dx, dy) > 0) {
          // allow nearby region pixels via alpha check only
        }
        const o = p * 4;
        if (data[o + 3] < 24) continue;
        r += data[o];
        g += data[o + 1];
        bl += data[o + 2];
        cnt++;
      }
    }
    if (!cnt) return null;
    return [Math.round(r / cnt), Math.round(g / cnt), Math.round(bl / cnt)];
  };

  // Prefer sampling from region pixels projected to ends
  let cA: [number, number, number] | null = null;
  let cB: [number, number, number] | null = null;
  let bestTA = Infinity;
  let bestTB = -Infinity;
  for (let i = 0; i < region.pixels.length; i += step) {
    const p = region.pixels[i];
    const x = p % width;
    const y = (p / width) | 0;
    const t = (x - region.cx) * cos + (y - region.cy) * sin;
    const o = p * 4;
    if (data[o + 3] < 24) continue;
    const rgb: [number, number, number] = [data[o], data[o + 1], data[o + 2]];
    if (t < bestTA) {
      bestTA = t;
      cA = rgb;
    }
    if (t > bestTB) {
      bestTB = t;
      cB = rgb;
    }
  }

  if (!cA || !cB) {
    cA = sampleNear(xA, yA);
    cB = sampleNear(xB, yB);
  }
  if (!cA || !cB) return { fill };

  const spread = Math.hypot(cA[0] - cB[0], cA[1] - cB[1], cA[2] - cB[2]);
  if (spread < gradientThreshold || gradMag < 0.02) return { fill };

  const deg = (angle * 180) / Math.PI;
  return {
    fill,
    gradient: {
      angle: deg,
      from: rgbToHex(cA[0], cA[1], cA[2]),
      to: rgbToHex(cB[0], cB[1], cB[2]),
    },
  };
}
