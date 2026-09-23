import { Injectable, signal } from '@angular/core';
import { GeoPosition } from '../astro/ephemeris';

export type LocationStatus = 'idle' | 'pending' | 'granted' | 'denied' | 'unavailable' | 'manual';

/**
 * City-level accuracy is plenty: 50 km of error moves the Moon by far less than its own width.
 * So we ask for low accuracy (faster, less battery, friendlier prompt) and accept a cached fix.
 * The position never leaves the device.
 */
@Injectable({ providedIn: 'root' })
export class LocationService {
  readonly status = signal<LocationStatus>('idle');
  readonly position = signal<GeoPosition | null>(null);

  request(): Promise<GeoPosition | null> {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      this.status.set('unavailable');
      return Promise.resolve(null);
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
          this.status.set('granted');
          resolve(pos);
        },
        (err) => {
          this.status.set(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
          resolve(null);
        },
        { enableHighAccuracy: false, maximumAge: 10 * 60_000, timeout: 15_000 },
      );
    });
  }

  /** Fallback when permission is denied: user picks a city (UI: see PLAN.md, phase 5). */
  setManual(pos: GeoPosition): void {
    this.position.set(pos);
    this.status.set('manual');
  }
}
