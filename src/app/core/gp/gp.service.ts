import { Injectable, computed, signal } from '@angular/core';
import { GpPayload, OmmRecord, SatelliteElements, isGpPayload } from './gp.types';

export const GP_STORAGE_KEY = 'ptm.gp';
/** CelesTrak updates GP data every 2 h; a copy younger than this is as good as a refetch. */
export const GP_MAX_AGE_MS = 2 * 3_600_000;
export const GP_FETCH_TIMEOUT_MS = 5000;
/** After a total failure, do not try the network again for this long. */
export const GP_RETRY_AFTER_MS = 5 * 60_000;

export type GpStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

/**
 * Orbital elements for the satellite targets. Nothing here runs until `get()` is called, and the app
 * only calls it when a satellite is selected or the picker's Satellites section is on screen.
 *
 * Order of preference: in memory -> localStorage (<= 2 h old) -> /api/gp (5 s timeout) -> the bundled
 * snapshot. The newest good copy is kept in localStorage. `ng serve` runs no Vercel functions, so in
 * dev the network step simply fails over to the snapshot (use `npx vercel dev` to test the endpoint).
 */
@Injectable({ providedIn: 'root' })
export class GpService {
  readonly status = signal<GpStatus>('idle');
  readonly data = signal<GpPayload | null>(null);

  /** Element sets by NORAD id; null until data is in. */
  readonly elements = computed<SatelliteElements | null>(() => {
    const d = this.data();
    return d
      ? new Map<number, OmmRecord>(d.elements.map((e) => [Number(e.NORAD_CAT_ID), e]))
      : null;
  });

  /** Changes whenever the element sets do: lets caches (availability) notice. */
  readonly stamp = computed(
    () => this.data()?.fetchedAt ?? (this.status() === 'unavailable' ? 'none' : ''),
  );

  /** Overridable clock, for tests. */
  now: () => number = () => Date.now();

  private inFlight: Promise<GpPayload | null> | null = null;
  private failedAt: number | null = null;

  /** Resolves with the best elements available (never rejects), or null when there are none at all. */
  get(): Promise<GpPayload | null> {
    const mem = this.data();
    if (mem && this.isFresh(mem)) return Promise.resolve(mem);
    if (this.inFlight) return this.inFlight;
    if (!mem && this.failedAt !== null && this.now() - this.failedAt < GP_RETRY_AFTER_MS) {
      return Promise.resolve(null);
    }
    if (!mem) this.status.set('loading');
    this.inFlight = this.load(mem).finally(() => (this.inFlight = null));
    return this.inFlight;
  }

  private isFresh(p: GpPayload): boolean {
    return this.now() - Date.parse(p.fetchedAt) <= GP_MAX_AGE_MS;
  }

  private async load(inMemory: GpPayload | null): Promise<GpPayload | null> {
    const stored = this.readStored();
    if (stored && this.isFresh(stored)) return this.accept(stored);

    const network = await this.fetchJson('/api/gp', GP_FETCH_TIMEOUT_MS);
    if (network) {
      this.writeStored(network);
      return this.accept(network);
    }

    // Offline, no function (ng serve), or CelesTrak is down: the newest of what we have.
    const fallback = await this.fetchJson('data/gp-fallback.json', GP_FETCH_TIMEOUT_MS);
    const best = [inMemory, stored, fallback]
      .filter((p): p is GpPayload => p !== null)
      .sort((a, b) => Date.parse(b.fetchedAt) - Date.parse(a.fetchedAt))[0];
    if (best) {
      this.failedAt = null;
      return this.accept(best);
    }
    this.failedAt = this.now();
    this.status.set('unavailable');
    return null;
  }

  private accept(p: GpPayload): GpPayload {
    this.failedAt = null;
    this.data.set(p);
    this.status.set('ready');
    return p;
  }

  /** One request, no retries. Anything but a valid 200 payload is null. */
  private async fetchJson(url: string, timeoutMs: number): Promise<GpPayload | null> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: abort.signal });
      if (res.status !== 200) return null;
      const body: unknown = await res.json();
      return isGpPayload(body) ? body : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private readStored(): GpPayload | null {
    try {
      const raw = localStorage.getItem(GP_STORAGE_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      return isGpPayload(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private writeStored(p: GpPayload): void {
    try {
      localStorage.setItem(GP_STORAGE_KEY, JSON.stringify(p));
    } catch {
      // Storage full or unavailable: the in-memory copy still works.
    }
  }
}
