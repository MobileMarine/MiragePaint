import { Injectable, computed, signal } from '@angular/core';
import { DrawingDocument } from '../models/shape';

@Injectable({ providedIn: 'root' })
export class HistoryService {
  private readonly past = signal<DrawingDocument[]>([]);
  private readonly future = signal<DrawingDocument[]>([]);
  private readonly max = 100;

  readonly canUndo = computed(() => this.past().length > 1);
  readonly canRedo = computed(() => this.future().length > 0);

  seed(doc: DrawingDocument): void {
    this.past.set([clone(doc)]);
    this.future.set([]);
  }

  push(doc: DrawingDocument): void {
    this.past.update((list) => {
      const next = [...list, clone(doc)];
      return next.length > this.max ? next.slice(next.length - this.max) : next;
    });
    this.future.set([]);
  }

  undo(): DrawingDocument | null {
    const list = this.past();
    if (list.length <= 1) return null;
    const current = list[list.length - 1];
    const prev = list[list.length - 2];
    this.past.set(list.slice(0, -1));
    this.future.update((f) => [clone(current), ...f]);
    return clone(prev);
  }

  redo(): DrawingDocument | null {
    const list = this.future();
    if (!list.length) return null;
    const [next, ...rest] = list;
    this.future.set(rest);
    this.past.update((p) => [...p, clone(next)]);
    return clone(next);
  }

  reset(): void {
    this.past.set([]);
    this.future.set([]);
  }
}

function clone(doc: DrawingDocument): DrawingDocument {
  return structuredClone(doc);
}
