import { Injectable, signal } from '@angular/core';
import { CitiesFile, FALLBACK_CITIES, IndexedCity, buildIndex, citiesFromFile } from './cities';

export type CitiesStatus = 'idle' | 'loading' | 'ready' | 'fallback';

/**
 * The big city list (public/data/cities.json, about 6,000 places), loaded only when the city picker
 * opens: it is not part of the main bundle. If the fetch fails (offline on a first visit), about 30
 * capitals are used instead, so the picker is never empty. One fetch per page load, no retries.
 */
@Injectable({ providedIn: 'root' })
export class CityService {
  readonly status = signal<CitiesStatus>('idle');
  readonly index = signal<readonly IndexedCity[]>(buildIndex(FALLBACK_CITIES));

  private loading: Promise<void> | null = null;

  load(): Promise<void> {
    if (this.status() === 'ready' || this.status() === 'fallback') return Promise.resolve();
    if (this.loading) return this.loading;
    this.status.set('loading');
    this.loading = this.fetchAll().finally(() => (this.loading = null));
    return this.loading;
  }

  private async fetchAll(): Promise<void> {
    try {
      const res = await fetch('/data/cities.json', { signal: AbortSignal.timeout(15_000) });
      if (res.status !== 200) throw new Error(`status ${res.status}`);
      const file = (await res.json()) as CitiesFile;
      if (!Array.isArray(file.cities) || file.cities.length < 100) throw new Error('bad file');
      this.index.set(buildIndex(citiesFromFile(file)));
      this.status.set('ready');
    } catch {
      this.status.set('fallback');
    }
  }
}
