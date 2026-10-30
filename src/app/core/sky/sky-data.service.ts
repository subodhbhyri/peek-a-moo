import { Injectable, computed, signal } from '@angular/core';
import { SkyFile, isSkyFile } from './sky-data.types';
import { SkyField } from './sky-field';
import { SkyGeometry, buildSkyGeometry } from './sky-geometry';

export const SKY_URL = '/data/sky.json';
export const SKY_FETCH_TIMEOUT_MS = 15_000;
/** After a failure, do not try the network again for this long. */
export const SKY_RETRY_AFTER_MS = 5 * 60_000;

export type SkyStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

/**
 * The star map (public/data/sky.json: about 1,600 background stars and the 88 stick figures, 28 KB
 * gzipped). Nothing here runs until `load()` is called, and the app only calls it when Look Around starts
 * or a constellation is the selected target: never at start-up, and never part of the main bundle.
 * One request, no retries; on failure everything else works as before and `status` says why.
 */
@Injectable({ providedIn: 'root' })
export class SkyDataService {
  readonly status = signal<SkyStatus>('idle');
  readonly geometry = signal<SkyGeometry | null>(null);
  /** The stars and figures rotated into the horizon frame; null until loaded. */
  readonly field = computed<SkyField | null>(() => {
    const g = this.geometry();
    return g ? new SkyField(g) : null;
  });

  /** Overridable clock, for tests. */
  now: () => number = () => Date.now();

  private inFlight: Promise<SkyGeometry | null> | null = null;
  private failedAt: number | null = null;

  /** Resolves with the geometry (never rejects), or null when it could not be loaded. */
  load(): Promise<SkyGeometry | null> {
    const have = this.geometry();
    if (have) return Promise.resolve(have);
    if (this.inFlight) return this.inFlight;
    if (this.failedAt !== null && this.now() - this.failedAt < SKY_RETRY_AFTER_MS) {
      return Promise.resolve(null);
    }
    this.status.set('loading');
    this.inFlight = this.fetchAll().finally(() => (this.inFlight = null));
    return this.inFlight;
  }

  private async fetchAll(): Promise<SkyGeometry | null> {
    try {
      const res = await fetch(SKY_URL, { signal: AbortSignal.timeout(SKY_FETCH_TIMEOUT_MS) });
      if (res.status !== 200) throw new Error(`status ${res.status}`);
      const body: unknown = await res.json();
      if (!isSkyFile(body)) throw new Error('bad file');
      const geometry = buildSkyGeometry(body as SkyFile);
      this.failedAt = null;
      this.geometry.set(geometry);
      this.status.set('ready');
      return geometry;
    } catch {
      this.failedAt = this.now();
      this.status.set('unavailable');
      return null;
    }
  }
}
