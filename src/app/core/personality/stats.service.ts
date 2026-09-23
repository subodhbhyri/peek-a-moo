import { Injectable, signal } from '@angular/core';
import { EMPTY_STATS, StatsRecord, applyFind, pushRecentLine } from './stats';

const STORAGE_KEY = 'find-the-moon.stats.v1';

/**
 * Lifetime stats, persisted to localStorage. Every access is wrapped in try/catch: storage can be
 * unavailable (private browsing, quota) and that should never break the app, just leave stats unsaved.
 */
@Injectable({ providedIn: 'root' })
export class StatsService {
  readonly stats = signal<StatsRecord>(loadStats());

  recordFind(durationMs: number, now = new Date()): StatsRecord {
    const next = applyFind(this.stats(), durationMs, now);
    this.stats.set(next);
    save(next);
    return next;
  }

  recordLineShown(text: string): void {
    const next = pushRecentLine(this.stats(), text);
    this.stats.set(next);
    save(next);
  }
}

function loadStats(): StatsRecord {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATS;
    const parsed = JSON.parse(raw) as Partial<StatsRecord>;
    return { ...EMPTY_STATS, ...parsed };
  } catch {
    return EMPTY_STATS;
  }
}

function save(stats: StatsRecord): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // Storage unavailable — the session still works, it just won't remember next time.
  }
}
