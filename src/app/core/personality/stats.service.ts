import { Injectable, signal } from '@angular/core';
import { EMPTY_STATS, StatsV2, applyFind, migrateStats, pushRecentLine } from './stats';

/** Same key as v1: the stored value is migrated to the v2 shape on first load and written back. */
const STORAGE_KEY = 'find-the-moon.stats.v1';

/**
 * Lifetime + per-target stats, persisted to localStorage. Every access is wrapped in try/catch:
 * storage can be unavailable (private browsing, quota) and that should never break the app, just
 * leave stats unsaved.
 */
@Injectable({ providedIn: 'root' })
export class StatsService {
  readonly stats = signal<StatsV2>(loadStats());

  recordFind(targetId: string, durationMs: number, now = new Date()): StatsV2 {
    const next = applyFind(this.stats(), targetId, durationMs, now);
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

function loadStats(): StatsV2 {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return migrateStats(null);
  }
  if (!raw) return migrateStats(null);
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // corrupt JSON -> fresh stats
  }
  const stats = migrateStats(parsed);
  // Only genuine v1 data is rewritten (as v2); corrupt data is left alone until the next real write.
  const isV1 =
    !!parsed && typeof parsed === 'object' && !('version' in parsed) && stats !== EMPTY_STATS;
  if (isV1) save(stats);
  return stats;
}

function save(stats: StatsV2): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // Storage unavailable — the session still works, it just won't remember next time.
  }
}
