import { Injectable, signal } from '@angular/core';
import { GeoPosition } from '../astro/ephemeris';
import { deviceTimeZone, locationForTimeZone } from './timezone-location';

export type LocationStatus = 'idle' | 'pending' | 'granted' | 'denied' | 'unavailable' | 'manual';
/** Where the current position came from. */
export type LocationSource = 'gps' | 'manual' | 'timezone';

const STORAGE_KEY = 'ptm.location';

interface SavedLocation {
  lat: number;
  lon: number;
  label: string;
}

/**
 * City-level accuracy is plenty: 50 km of error moves the Moon by far less than its own width. So we ask
 * for low accuracy (faster, less battery, friendlier prompt) and accept a cached fix. The position never
 * leaves the device.
 *
 * Nobody hits a dead end. When geolocation is denied, unavailable or times out, the position falls back
 * to, in order: a place the user chose before (saved on this device), then the reference point of the
 * device's time zone. Only when neither exists is there no position, and the app asks for a city.
 */
@Injectable({ providedIn: 'root' })
export class LocationService {
  readonly status = signal<LocationStatus>('idle');
  readonly position = signal<GeoPosition | null>(null);
  /** Where `position` came from; null until there is one. */
  readonly source = signal<LocationSource | null>(null);
  /** Name of a manual or time-zone location ("Abu Dhabi, UAE", "Dubai"); null for GPS. */
  readonly label = signal<string | null>(null);

  request(): Promise<GeoPosition | null> {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      this.status.set('unavailable');
      this.applyFallback();
      return Promise.resolve(this.position());
    }
    this.status.set('pending');
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const pos: GeoPosition = {
            latitude: p.coords.latitude,
            longitude: p.coords.longitude,
            heightM: p.coords.altitude ?? 0,
          };
          this.position.set(pos);
          this.source.set('gps');
          this.label.set(null);
          this.status.set('granted');
          resolve(pos);
        },
        (err) => {
          this.status.set(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
          this.applyFallback();
          resolve(this.position());
        },
        { enableHighAccuracy: false, maximumAge: 10 * 60_000, timeout: 15_000 },
      );
    });
  }

  /** Sets the position the user picked (not saved: see chooseManual). */
  setManual(pos: GeoPosition, label: string | null = null): void {
    this.position.set(pos);
    this.source.set('manual');
    this.label.set(label);
    this.status.set('manual');
  }

  /**
   * The user's choice from the city picker: applied now and remembered on this device (rounded to two
   * decimals, about 1 km) so a returning visitor is not asked again. GPS fixes are never stored.
   */
  chooseManual(pos: GeoPosition, label: string): void {
    this.setManual(pos, label);
    try {
      const saved: SavedLocation = {
        lat: Math.round(pos.latitude * 100) / 100,
        lon: Math.round(pos.longitude * 100) / 100,
        label,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // storage unavailable: the choice still applies for this visit
    }
  }

  /** The device time zone's area (e.g. "Dubai"), or null if the zone is unknown or only an offset. */
  timeZoneArea(): { label: string; lat: number; lon: number } | null {
    return locationForTimeZone(deviceTimeZone());
  }

  /** "Use my time zone": apply the time-zone area as the location and forget any saved city. */
  useTimeZone(): boolean {
    const area = this.timeZoneArea();
    if (!area) return false;
    this.setTimeZone(area);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // nothing to clean up
    }
    return true;
  }

  /** After a failed geolocation: a saved choice, else the time zone; never overrides an existing position. */
  private applyFallback(): void {
    if (this.position()) return;
    const saved = this.readSaved();
    if (saved) {
      this.position.set({ latitude: saved.lat, longitude: saved.lon, heightM: 0 });
      this.source.set('manual');
      this.label.set(saved.label);
      return;
    }
    const area = this.timeZoneArea();
    if (area) this.setTimeZone(area);
  }

  private setTimeZone(area: { label: string; lat: number; lon: number }): void {
    this.position.set({ latitude: area.lat, longitude: area.lon, heightM: 0 });
    this.source.set('timezone');
    this.label.set(area.label);
  }

  private readSaved(): SavedLocation | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const v = JSON.parse(raw) as Partial<SavedLocation>;
      if (
        typeof v.lat === 'number' &&
        typeof v.lon === 'number' &&
        typeof v.label === 'string' &&
        Math.abs(v.lat) <= 90 &&
        Math.abs(v.lon) <= 180
      ) {
        return { lat: v.lat, lon: v.lon, label: v.label };
      }
    } catch {
      // corrupt or unavailable: ignore
    }
    return null;
  }
}
