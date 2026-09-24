import { Injectable } from '@angular/core';
import { FillMode, Point2D, StrokeMode, ToolId } from '../models/shape';

export interface UiPrefs {
  zoom: number;
  pan: Point2D;
  tool: ToolId;
  strokeColor: string;
  strokeEndColor: string;
  fillColor: string;
  strokeWidth: number;
  opacity: number;
  fillMode: FillMode;
  strokeMode: StrokeMode;
  fillPresetId: string | null;
  strokePresetId: string | null;
  fillAngle: number;
  strokeAngle: number;
  fillGradientFrom: string;
  fillGradientTo: string;
  effectParams?: unknown;
  collapsedSections: Record<string, boolean>;
  darkMode: boolean;
}

const STORAGE_KEY = 'mirage-paint-ui';

const DEFAULT_COLLAPSED: Record<string, boolean> = {
  layers: false,
  stroke: false,
  fill: false,
  group: false,
  transform: false,
};

@Injectable({ providedIn: 'root' })
export class UiPrefsService {
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  load(): Partial<UiPrefs> | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as Partial<UiPrefs>;
    } catch {
      return null;
    }
  }

  save(prefs: UiPrefs): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
      } catch {
        /* ignore quota */
      }
    }, 200);
  }

  saveNow(prefs: UiPrefs): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }

  defaultCollapsed(): Record<string, boolean> {
    return { ...DEFAULT_COLLAPSED };
  }
}
