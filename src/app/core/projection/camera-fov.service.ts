import { Injectable, signal } from '@angular/core';
import {
  DEFAULT_LONG_SIDE_FOV_DEG,
  MAX_LONG_SIDE_FOV_DEG,
  MIN_LONG_SIDE_FOV_DEG,
} from './camera-fov';

const STORAGE_KEY = 'find-the-moon.camera-fov.v1';

/**
 * Camera-mode state shared between the shell (owns the <video>) and the sky view (needs the FOV):
 * whether the camera feed is showing, its intrinsic size, and the per-device long-side FOV override.
 */
@Injectable({ providedIn: 'root' })
export class CameraFovService {
  readonly cameraOn = signal(false);
  readonly videoSize = signal<{ width: number; height: number } | null>(null);
  readonly longSideFovDeg = signal(load());
  /** Vertical FOV the sky view is actually projecting with (for the debug report). */
  readonly vFovInUseDeg = signal(0);

  setLongSideFov(deg: number): void {
    const v = Math.min(MAX_LONG_SIDE_FOV_DEG, Math.max(MIN_LONG_SIDE_FOV_DEG, deg));
    this.longSideFovDeg.set(v);
    try {
      localStorage.setItem(STORAGE_KEY, String(v));
    } catch {
      // Storage unavailable — the slider still works this session.
    }
  }
}

function load(): number {
  try {
    const n = Number(localStorage.getItem(STORAGE_KEY));
    if (n >= MIN_LONG_SIDE_FOV_DEG && n <= MAX_LONG_SIDE_FOV_DEG) return n;
  } catch {
    // fall through to the default
  }
  return DEFAULT_LONG_SIDE_FOV_DEG;
}
