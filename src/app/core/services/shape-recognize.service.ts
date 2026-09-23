import { Injectable } from '@angular/core';
import { GroupParams, Shape } from '../models/shape';
import { emitShapeGroup, FittedRegion, shapesToSvg } from '../vector/emit';
import { fitAllRegions } from '../vector/fit';
import { sampleRegionColor } from '../vector/gradient';
import { preprocessImageData } from '../vector/preprocess';
import { quantizeImageData } from '../vector/quantize';
import {
  buildContainmentTree,
  labelConnectedComponents,
  mergeSimilarColorRegions,
  mergeSmallRegions,
  morphCloseRegions,
} from '../vector/regions';

export interface RecognizeOptions {
  colors: number;
  minArea: number;
  minIoU: number;
  maxVertices: number;
  simplicity: number;
  gradients: boolean;
  removeBackground: boolean;
  removeAiTag: boolean;
  morphIterations: number;
}

export const DEFAULT_RECOGNIZE_OPTIONS: RecognizeOptions = {
  colors: 10,
  minArea: 40,
  minIoU: 0.52,
  maxVertices: 12,
  simplicity: 1.2,
  gradients: true,
  removeBackground: true,
  removeAiTag: true,
  morphIterations: 1,
};

export interface RecognizeResult {
  kind: 'shapes';
  shapes: Shape[];
  group: Shape;
  width: number;
  height: number;
  svg: string;
}

const MAX_EDGE = 384;

@Injectable({ providedIn: 'root' })
export class ShapeRecognizeService {
  async loadToImageData(file: File): Promise<{ imageData: ImageData; objectUrl: string }> {
    const objectUrl = URL.createObjectURL(file);
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas-Kontext nicht verfügbar.');
      ctx.drawImage(bitmap, 0, 0, width, height);
      return {
        imageData: ctx.getImageData(0, 0, width, height),
        objectUrl,
      };
    } finally {
      bitmap.close();
    }
  }

  recognizeImageData(
    source: ImageData,
    options: RecognizeOptions = DEFAULT_RECOGNIZE_OPTIONS,
  ): RecognizeResult {
    const { data, width, height } = preprocessImageData(source, {
      removeBackground: options.removeBackground,
      removeAiTag: options.removeAiTag,
    });

    // Keep original (post-preprocess) for color sampling
    const sampleData = new Uint8ClampedArray(data);

    const quantized = quantizeImageData(data, width, height, options.colors, 42);
    const map = labelConnectedComponents(quantized.indices, width, height);
    mergeSimilarColorRegions(map, quantized.palette, 16);
    mergeSmallRegions(map, options.minArea);
    if (options.morphIterations > 0) {
      morphCloseRegions(map, options.morphIterations);
    }
    buildContainmentTree(map);

    const fitted = fitAllRegions(map, {
      minIoU: options.minIoU,
      maxVertices: options.maxVertices,
      simplicity: options.simplicity,
    });

    const regions: FittedRegion[] = [];
    for (const item of fitted) {
      const region = map.regions.get(item.regionId);
      if (!region) continue;
      const color = sampleRegionColor(
        sampleData,
        width,
        height,
        region,
        options.gradients,
      );
      regions.push({ fit: item.fit, area: item.area, color });
    }

    if (!regions.length) {
      throw new Error('Keine Formen erkannt.');
    }

    const { group, children } = emitShapeGroup(regions, width, height);
    const svg = shapesToSvg(children, width, height, false);

    return {
      kind: 'shapes',
      shapes: children,
      group,
      width,
      height,
      svg,
    };
  }

  shapesToSvg(shapes: Shape[], width: number, height: number, outlinesOnly = false): string {
    // If a group is passed, unwrap children for preview
    const flat: Shape[] = [];
    for (const s of shapes) {
      if (s.type === 'group') {
        flat.push(...(s.params as GroupParams).children);
      } else {
        flat.push(s);
      }
    }
    return shapesToSvg(flat.length ? flat : shapes, width, height, outlinesOnly);
  }
}
