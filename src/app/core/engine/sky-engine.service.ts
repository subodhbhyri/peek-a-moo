import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { MoonState, computeMoonState } from '../astro/ephemeris';
import { magneticDeclinationDeg } from '../astro/declination';
import {
  ScreenProjection,
  Viewport,
  brightLimbScreenAngle,
  displayRadiusPx,
  projectDirection,
} from '../projection/projection';
import { LocationService } from '../sensors/location.service';
import { OrientationService } from '../sensors/orientation.service';
import {
  FindEvent,
  FindPhase,
  FindTrackerState,
  initialTrackerState,
  stepTracker,
} from '../tracking/find-tracker';

/** Everything the renderer needs for one animation frame. */
export interface SkyFrame {
  moon: MoonState;
  projection: ScreenProjection;
  radiusPx: number;
  /** Direction of the lit limb on screen, radians, y up (see brightLimbScreenAngle). */
  brightLimbRad: number;
  phase: FindPhase;
  /** ms since the current search started (drive the "glow on nearest edge" hint off this). */
  searchElapsedMs: number;
  findCount: number;
  lastFindDurationMs: number | null;
}

/** Centered = within this fraction of half the shorter screen side from the center. */
const CENTERED_THRESHOLD = 0.35;
const MOON_RECOMPUTE_MS = 5_000;

/**
 * Glue between sensors, ephemeris, projection and the find tracker.
 * The renderer calls tick() from requestAnimationFrame; this keeps per-frame work out of Angular
 * change detection while still exposing signals (moon, events) for the UI layer.
 */
@Injectable({ providedIn: 'root' })
export class SkyEngineService {
  private readonly location = inject(LocationService);
  private readonly orientation = inject(OrientationService);

  readonly moon = signal<MoonState | null>(null);
  /** found / lost events. The personality + stats layer subscribes to this. */
  readonly events$ = new Subject<FindEvent>();

  private tracker: FindTrackerState | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    effect(() => {
      const pos = this.location.position();
      if (!pos) return;
      this.orientation.setDeclination(magneticDeclinationDeg(pos.latitude, pos.longitude));
      this.recomputeMoon();
      if (!this.intervalId)
        this.intervalId = setInterval(() => this.recomputeMoon(), MOON_RECOMPUTE_MS);
    });
    inject(DestroyRef).onDestroy(() => {
      if (this.intervalId) clearInterval(this.intervalId);
    });
  }

  /** Force a fresh ephemeris (e.g. after the tab was backgrounded for a while). */
  recomputeMoon(date = new Date()): void {
    const pos = this.location.position();
    if (pos) this.moon.set(computeMoonState(date, pos));
  }

  tick(now: number, viewport: Viewport): SkyFrame | null {
    const moon = this.moon();
    const basis = this.orientation.basis();
    if (!moon || !basis) return null;

    this.tracker ??= initialTrackerState(now);

    const radiusPx = displayRadiusPx(viewport, moon.angularDiameterDeg);
    const projection = projectDirection(moon.direction, basis, viewport, radiusPx);
    const centered = projection.onScreen && projection.centerDistance <= CENTERED_THRESHOLD;

    const { state, event } = stepTracker(this.tracker, {
      now,
      onScreen: projection.onScreen,
      centered,
    });
    this.tracker = state;
    if (event) this.events$.next(event);

    return {
      moon,
      projection,
      radiusPx,
      brightLimbRad: brightLimbScreenAngle(moon.direction, moon.sunDirection, basis),
      phase: state.phase,
      searchElapsedMs: now - state.searchStartedAt,
      findCount: state.findCount,
      lastFindDurationMs: state.lastFindDurationMs,
    };
  }
}
