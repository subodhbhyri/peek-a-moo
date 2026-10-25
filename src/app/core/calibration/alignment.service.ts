import { Injectable, inject, signal } from '@angular/core';
import { LocationService } from '../sensors/location.service';
import type { HeadingSource } from '../sensors/orientation.service';
import { StoredAlignment, isAlignmentValid } from './alignment';

const STORAGE_KEY = 'find-the-moon.alignment.v1';

/**
 * The user's "sight alignment" yaw correction, persisted to localStorage (every access in try/catch,
 * same as StatsService). A stored alignment only applies while it is young, nearby and from the same
 * heading source; otherwise it is ignored and cleared.
 */
@Injectable({ providedIn: 'root' })
export class AlignmentService {
  private readonly location = inject(LocationService);

  /** The stored alignment, or null. Cleared as soon as yawFor() finds it no longer valid. */
  readonly stored = signal<StoredAlignment | null>(load());

  /** Degrees to add to the pointing azimuth right now, or null if there is no valid alignment. */
  yawFor(source: HeadingSource, now = Date.now()): number | null {
    const a = this.stored();
    if (!a) return null;
    const pos = this.location.position();
    if (!pos) return null; // can't judge distance yet; leave it stored
    if (!isAlignmentValid(a, pos.latitude, pos.longitude, source, now)) {
      this.clear();
      return null;
    }
    return a.yawDeg;
  }

  /** Returns false if there is no position to anchor the alignment to. */
  set(yawDeg: number, source: HeadingSource, now = Date.now()): boolean {
    const pos = this.location.position();
    if (!pos) return false;
    const next: StoredAlignment = {
      yawDeg,
      setAt: now,
      lat: pos.latitude,
      lon: pos.longitude,
      source,
    };
    this.stored.set(next);
    save(next);
    return true;
  }

  clear(): void {
    this.stored.set(null);
    save(null);
  }
}

function load(): StoredAlignment | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<StoredAlignment>;
    const ok =
      typeof p.yawDeg === 'number' &&
      typeof p.setAt === 'number' &&
      typeof p.lat === 'number' &&
      typeof p.lon === 'number' &&
      (p.source === 'absolute' || p.source === 'ios-compass');
    return ok ? (p as StoredAlignment) : null;
  } catch {
    return null;
  }
}

function save(a: StoredAlignment | null): void {
  try {
    if (a) localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable — the alignment still works this session, it just won't be remembered.
  }
}
