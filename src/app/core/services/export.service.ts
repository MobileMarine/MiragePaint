import { Injectable } from '@angular/core';
import { DrawingDocument, Shape } from '../models/shape';
import { contentBounds } from '../render/geometry';

@Injectable({ providedIn: 'root' })
export class ExportService {
  downloadJson(doc: DrawingDocument, filename = 'mirage-paint.json'): void {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    this.triggerDownload(blob, filename);
  }

  downloadSvg(svgEl: SVGSVGElement, shapes: Shape[], filename = 'mirage-paint.svg'): void {
    const clone = this.prepareExportSvg(svgEl, shapes);
    const xml = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    this.triggerDownload(blob, filename);
  }

  async downloadPng(
    svgEl: SVGSVGElement,
    shapes: Shape[],
    background: string,
    filename = 'mirage-paint.png',
  ): Promise<void> {
    const bounds = contentBounds(shapes);
    const clone = this.prepareExportSvg(svgEl, shapes);
    clone.setAttribute('width', String(Math.ceil(bounds.w)));
    clone.setAttribute('height', String(Math.ceil(bounds.h)));

    const xml = new XMLSerializer().serializeToString(clone);
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));

    try {
      const img = await loadImage(url);
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(bounds.w);
      canvas.height = Math.ceil(bounds.h);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      if (background) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png'),
      );
      if (blob) this.triggerDownload(blob, filename);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  saveToLocalStorage(doc: DrawingDocument, key = 'mirage-paint-doc'): void {
    localStorage.setItem(key, JSON.stringify(doc));
  }

  loadFromLocalStorage(key = 'mirage-paint-doc'): DrawingDocument | null {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as DrawingDocument;
    } catch {
      return null;
    }
  }

  private prepareExportSvg(svgEl: SVGSVGElement, shapes: Shape[]): SVGSVGElement {
    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    clone.querySelectorAll('[data-ui="true"]').forEach((n) => n.remove());
    clone.querySelectorAll('.viewport-bg, .grid-layer').forEach((n) => n.remove());

    const bounds = contentBounds(shapes);
    const stage = clone.querySelector('.stage');
    if (stage) {
      stage.setAttribute('transform', `translate(${-bounds.x} ${-bounds.y})`);
    }

    clone.setAttribute('viewBox', `0 0 ${bounds.w} ${bounds.h}`);
    clone.removeAttribute('style');
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return clone;
  }

  private triggerDownload(blob: Blob, filename: string): void {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
