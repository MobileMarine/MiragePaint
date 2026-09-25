import { Injectable, computed, signal } from '@angular/core';

export type PerfLevel = 'low' | 'mid' | 'high';

const EMA_ALPHA = 0.15;
const GREEN_MAX_MS = 16;
const YELLOW_MAX_MS = 33;
/** Map frame ms onto fill bar: 8ms → 0%, 50ms → 100% */
const FILL_MIN_MS = 8;
const FILL_MAX_MS = 50;

@Injectable({ providedIn: 'root' })
export class PerfMonitorService {
  readonly frameMs = signal(16);
  readonly level = computed<PerfLevel>(() => {
    const ms = this.frameMs();
    if (ms <= GREEN_MAX_MS) return 'low';
    if (ms <= YELLOW_MAX_MS) return 'mid';
    return 'high';
  });

  /** 0–100 for the amp bar width. */
  readonly fillPercent = computed(() => {
    const ms = this.frameMs();
    const t = (ms - FILL_MIN_MS) / (FILL_MAX_MS - FILL_MIN_MS);
    return Math.round(Math.min(100, Math.max(0, t * 100)));
  });

  private rafId = 0;
  private lastNow = 0;
  private ema = 16;
  private running = false;

  start(): void {
    if (this.running || typeof requestAnimationFrame === 'undefined') return;
    this.running = true;
    this.lastNow = performance.now();
    this.ema = 16;
    const tick = (now: number) => {
      if (!this.running) return;
      const delta = now - this.lastNow;
      this.lastNow = now;
      // Ignore huge gaps (tab background / debugger) so the bar doesn't stick red
      if (delta > 0 && delta < 250) {
        this.ema = this.ema * (1 - EMA_ALPHA) + delta * EMA_ALPHA;
        this.frameMs.set(this.ema);
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }
}
