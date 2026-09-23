import { Component, ViewChild, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DrawingService } from '../core/services/drawing.service';
import { ExportService } from '../core/services/export.service';
import { VectorizePreset, VectorizeResult } from '../core/services/vectorize.service';
import { RecognizeResult } from '../core/services/shape-recognize.service';
import { ApplyResult } from './vectorize-dialog/vectorize-dialog.component';
import { ToolbarComponent } from './toolbar/toolbar.component';
import { ViewportComponent } from './viewport/viewport.component';
import { InspectorComponent } from './inspector/inspector.component';
import { VectorizeDialogComponent } from './vectorize-dialog/vectorize-dialog.component';
import { DrawingDocument } from '../core/models/shape';

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [
    ToolbarComponent,
    ViewportComponent,
    InspectorComponent,
    VectorizeDialogComponent,
    DecimalPipe,
    FormsModule,
  ],
  templateUrl: './editor.component.html',
  styleUrl: './editor.component.scss',
})
export class EditorComponent {
  readonly drawing = inject(DrawingService);
  private readonly exporter = inject(ExportService);

  @ViewChild(ViewportComponent) viewport?: ViewportComponent;
  @ViewChild(VectorizeDialogComponent) vectorizeDialog?: VectorizeDialogComponent;

  readonly vectorPreset = signal<VectorizePreset>('balanced');

  newDoc(): void {
    if (confirm('Neues Dokument erstellen? Ungespeicherte Änderungen gehen verloren.')) {
      this.drawing.clearDocument();
    }
  }

  undo(): void {
    this.drawing.undo();
  }

  redo(): void {
    this.drawing.redo();
  }

  zoomIn(): void {
    this.drawing.zoomBy(1.2);
  }

  zoomOut(): void {
    this.drawing.zoomBy(1 / 1.2);
  }

  zoomReset(): void {
    this.drawing.setZoom(1);
    this.drawing.setPan({ x: 0, y: 0 });
  }

  saveJson(): void {
    const doc = this.drawing.toDocument();
    this.exporter.saveToLocalStorage(doc);
    this.exporter.downloadJson(doc, `${slug(doc.meta.name)}.mirage.json`);
  }

  loadJson(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const doc = JSON.parse(String(reader.result)) as DrawingDocument;
        this.drawing.loadDocument(doc);
      } catch {
        alert('Datei konnte nicht geladen werden.');
      }
    };
    reader.readAsText(file);
    input.value = '';
  }

  loadLocal(): void {
    const doc = this.exporter.loadFromLocalStorage();
    if (doc) this.drawing.loadDocument(doc);
    else alert('Kein gespeichertes Dokument gefunden.');
  }

  async importBitmap(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !this.vectorizeDialog) return;
    await this.vectorizeDialog.openWithFile(file, this.vectorPreset());
  }

  onVectorApplied(result: ApplyResult): void {
    const pan = this.drawing.pan();
    const zoom = this.drawing.zoom();
    const vs = this.viewport?.viewSize() ?? { w: 800, h: 600 };
    const worldX = (vs.w / 2 - pan.x) / zoom - result.width / 2;
    const worldY = (vs.h / 2 - pan.y) / zoom - result.height / 2;
    const at = { x: worldX, y: worldY };

    if ('kind' in result && result.kind === 'shapes') {
      const rec = result as RecognizeResult;
      this.drawing.addShapeGroup(rec.shapes, rec.width, rec.height, at);
      return;
    }
    const contours = result as VectorizeResult;
    this.drawing.addImportedVector(contours.paths, contours.width, contours.height, at);
  }

  exportSvg(): void {
    const svg = this.viewport?.svgElement;
    if (!svg) return;
    this.exporter.downloadSvg(
      svg,
      this.drawing.shapes(),
      `${slug(this.drawing.meta().name)}.svg`,
    );
  }

  async exportPng(): Promise<void> {
    const svg = this.viewport?.svgElement;
    if (!svg) return;
    await this.exporter.downloadPng(
      svg,
      this.drawing.shapes(),
      this.drawing.meta().background,
      `${slug(this.drawing.meta().name)}.png`,
    );
  }
}

function slug(name: string): string {
  return name.replace(/[^\w\-]+/g, '_').toLowerCase() || 'mirage-paint';
}
