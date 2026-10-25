import { DestroyRef, Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Subject } from 'rxjs';
import { magneticDeclinationDeg } from '../astro/declination';
import {
  ScreenProjection,
  Viewport,
  brightLimbScreenAngle,
  projectDirection,
} from '../projection/projection';
import { LocationService } from '../sensors/location.service';
import { OrientationService } from '../sensors/orientation.service';
import { recomputeIntervalMs } from '../targets/cadence';
import { computeTargetState } from '../targets/compute';
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
  projection: ScreenProjection;
  radiusPx: number;
  /**
   * Direction of the lit limb on screen, radians, y up (see brightLimbScreenAngle).
   * null when the target has no sun direction (nothing to light).
   */
  brightLimbRad: number | null;
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

  /** State of the selected target; null until a location is known, and briefly after a selection change. */
  readonly target = signal<TargetState | null>(null);
  /** found / lost events. The personality + stats layer subscribes to this. */
  readonly events$ = new Subject<TargetFindEvent>();

  /** True while the user is lining up the real target (align mode): no find tracking, events or stats. */
  readonly trackerPaused = signal(false);

  private tracker: FindTrackerState | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private activeId: string | null = null;

  constructor() {
    effect(() => {
      const pos = this.location.position();
      const def = this.selection.selected();
      untracked(() => {
        if (this.activeId !== null && this.activeId !== def.id) {
          // Selection changed: drop the old target's state, tracker and search timer.
          this.target.set(null);
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
    const pos = this.location.position();
    if (pos) this.target.set(computeTargetState(this.selection.selected(), date, pos));
  }

  tick(now: number, viewport: Viewport): SkyFrame | null {
    const target = this.target();
    const basis = this.orientation.basis();
    if (!target || !basis) return null;

    const def = this.selection.selected();
    const radiusPx = displayRadiusFor(target, viewport);
    const projection = projectDirection(target.direction, basis, viewport, radiusPx);
    const brightLimbRad = target.sunDirection
      ? brightLimbScreenAngle(target.direction, target.sunDirection, basis)
      : null;

    if (this.trackerPaused()) {
      return {
        def,
        target,
        projection,
        radiusPx,
        brightLimbRad,
        phase: 'searching',
        searchElapsedMs: 0,
        findCount: 0,
        lastFindDurationMs: null,
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
      projection,
      radiusPx,
      brightLimbRad,
      phase: state.phase,
      searchElapsedMs: now - state.searchStartedAt,
      findCount: state.findCount,
      lastFindDurationMs: state.lastFindDurationMs,
    };
  }

  private clearTimer(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
  }
}
