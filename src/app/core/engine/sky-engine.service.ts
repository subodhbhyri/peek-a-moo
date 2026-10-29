import { DestroyRef, Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Subject } from 'rxjs';
import { magneticDeclinationDeg } from '../astro/declination';
import { GpService } from '../gp/gp.service';
import {
  ScreenProjection,
  Viewport,
  brightLimbScreenAngle,
  projectDirection,
} from '../projection/projection';
import { northCelestialPole, skyNorthScreenAngle } from '../projection/sky-orientation';
import { LocationService } from '../sensors/location.service';
import { OrientationService } from '../sensors/orientation.service';
import { recomputeIntervalMs } from '../targets/cadence';
import { computeTargetState } from '../targets/compute';
import { SatelliteDataError } from '../targets/providers/satellite';
import { centeredThreshold, displayRadiusFor } from '../targets/display';
import { TargetSelectionService } from '../targets/target-selection.service';
import type { TargetDef, TargetState } from '../targets/target.types';
import {
  FindEvent,
  FindPhase,
  FindTrackerState,
  initialTrackerState,
  stepTracker,
} from '../tracking/find-tracker';

/** Everything the renderer needs for one animation frame. */
export interface SkyFrame {
  def: TargetDef;
  target: TargetState;
  /** The viewport this frame was projected with (renderers need it for size-dependent decisions). */
  viewport: Viewport;
  projection: ScreenProjection;
  radiusPx: number;
  /**
   * Direction of the lit limb on screen, radians, y up (see brightLimbScreenAngle).
   * null when the target has no sun direction (nothing to light).
   */
  brightLimbRad: number | null;
  /** Screen angle (y up) of celestial north at the target, for orienting rings, bands and extended objects. */
  skyNorthRad: number;
  /** Satellites only: screen positions (CSS px) of the trail points, newest first. Absent for everything else. */
  trail?: { x: number; y: number }[];
  phase: FindPhase;
  /** ms since the current search started (drive the "glow on nearest edge" hint off this). */
  searchElapsedMs: number;
  findCount: number;
  lastFindDurationMs: number | null;
}

/** A tracker event, tagged with the target it happened for. */
export type TargetFindEvent = FindEvent & { targetId: string };

/**
 * Glue between sensors, target ephemeris, projection and the find tracker.
 * The renderer calls tick() from requestAnimationFrame; this keeps per-frame work out of Angular
 * change detection while still exposing signals (target, events) for the UI layer.
 */
@Injectable({ providedIn: 'root' })
export class SkyEngineService {
  private readonly location = inject(LocationService);
  private readonly orientation = inject(OrientationService);
  private readonly selection = inject(TargetSelectionService);
  private readonly gp = inject(GpService);

  /** State of the selected target; null until a location is known, and briefly after a selection change. */
  readonly target = signal<TargetState | null>(null);
  /**
   * Why the selected satellite has no position, if it has none: its orbit data is not loaded yet
   * ('no-elements') or SGP4 gave up on it ('propagation-failed'). null for everything else.
   */
  readonly targetError = signal<SatelliteDataError['code'] | null>(null);
  /** found / lost events. The personality + stats layer subscribes to this. */
  readonly events$ = new Subject<TargetFindEvent>();

  /** True while the user is lining up the real target (align mode): no find tracking, events or stats. */
  readonly trackerPaused = signal(false);

  private tracker: FindTrackerState | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private activeId: string | null = null;
  /** Satellites are recomputed every frame; the signal above only follows about once a second. */
  private live: TargetState | null = null;
  private lastSignalMs = -Infinity;

  constructor() {
    effect(() => {
      const pos = this.location.position();
      const def = this.selection.selected();
      // Orbit data arriving (or being refreshed) must recompute a satellite.
      this.gp.elements();
      untracked(() => {
        // The only way the app asks for orbit data: a satellite is selected.
        if (def.kind === 'satellite') void this.gp.get();
        if (this.activeId !== null && this.activeId !== def.id) {
          // Selection changed: drop the old target's state, tracker and search timer.
          this.target.set(null);
          this.live = null;
          this.tracker = null;
        }
        this.activeId = def.id;
        this.clearTimer();
        if (!pos) return;
        this.orientation.setDeclination(magneticDeclinationDeg(pos.latitude, pos.longitude));
        this.recompute();
        // 0 = recompute every frame (satellites, Phase 6); everything else runs on a timer.
        const interval = recomputeIntervalMs(def.kind);
        if (interval > 0) this.intervalId = setInterval(() => this.recompute(), interval);
      });
    });
    inject(DestroyRef).onDestroy(() => this.clearTimer());
  }

  /**
   * Pause/resume find tracking. Either way the tracker is dropped, so resuming starts a fresh search
   * (new search timer, no 'lost' event for a find that was in progress).
   */
  setTrackerPaused(paused: boolean): void {
    this.tracker = null;
    this.trackerPaused.set(paused);
  }

  /** Force a fresh ephemeris (e.g. after the tab was backgrounded for a while). */
  recompute(date = new Date()): void {
    if (!this.location.position()) return;
    const target = this.compute(date);
    this.live = target;
    this.target.set(target);
  }

  /** The newest state of the selected target (per-frame for satellites, else the signal's). */
  currentTarget(): TargetState | null {
    return this.live ?? this.target();
  }

  /** Null without a location, or for a satellite without usable orbit data (see targetError). */
  private compute(date: Date): TargetState | null {
    const pos = this.location.position();
    if (!pos) return null;
    const def = this.selection.selected();
    try {
      const state = computeTargetState(def, date, pos, this.gp.elements() ?? undefined);
      this.targetError.set(null);
      return state;
    } catch (e) {
      if (e instanceof SatelliteDataError) {
        this.targetError.set(e.code);
        return null;
      }
      throw e;
    }
  }

  tick(now: number, viewport: Viewport): SkyFrame | null {
    const def = this.selection.selected();
    let target = this.target();
    if (target && recomputeIntervalMs(def.kind) === 0) target = this.refreshLive(now);
    const basis = this.orientation.basis();
    if (!target || !basis) return null;

    const radiusPx = displayRadiusFor(target, viewport);
    const projection = projectDirection(target.direction, basis, viewport, radiusPx);
    const latitude = this.location.position()?.latitude ?? 0;
    const skyNorthRad = skyNorthScreenAngle(target.direction, northCelestialPole(latitude), basis);
    const brightLimbRad = target.sunDirection
      ? brightLimbScreenAngle(target.direction, target.sunDirection, basis)
      : null;

    const trail = target.satellite
      ? target.satellite.trail.map((d) => {
          const p = projectDirection(d, basis, viewport, 0);
          return { x: p.x, y: p.y };
        })
      : null;

    if (this.trackerPaused()) {
      return {
        def,
        target,
        viewport,
        projection,
        radiusPx,
        brightLimbRad,
        skyNorthRad,
        phase: 'searching',
        searchElapsedMs: 0,
        findCount: 0,
        lastFindDurationMs: null,
        ...(trail && { trail }),
      };
    }
    this.tracker ??= initialTrackerState(now);
    const centered =
      projection.onScreen && projection.centerDistance <= centeredThreshold(radiusPx, viewport);

    const { state, event } = stepTracker(this.tracker, {
      now,
      onScreen: projection.onScreen,
      centered,
    });
    this.tracker = state;
    if (event) this.events$.next({ ...event, targetId: def.id });

    return {
      def,
      target,
      viewport,
      projection,
      radiusPx,
      brightLimbRad,
      skyNorthRad,
      phase: state.phase,
      searchElapsedMs: now - state.searchStartedAt,
      findCount: state.findCount,
      lastFindDurationMs: state.lastFindDurationMs,
      ...(trail && { trail }),
    };
  }

  /** Per-frame recompute for fast movers; the signal only updates about once a second. */
  private refreshLive(now: number): TargetState | null {
    const fresh = this.compute(new Date());
    this.live = fresh;
    if (now - this.lastSignalMs >= 1000 || !fresh) {
      this.lastSignalMs = now;
      this.target.set(fresh);
    }
    return fresh;
  }

  private clearTimer(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
  }
}
