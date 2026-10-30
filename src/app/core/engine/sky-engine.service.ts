import { DestroyRef, Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Subject } from 'rxjs';
import { magneticDeclinationDeg } from '../astro/declination';
import { GpService } from '../gp/gp.service';
import { TARGETS } from '../targets/catalog';
import { CameraBasis } from '../sensors/orientation-math';
import {
  ScreenProjection,
  Viewport,
  brightLimbScreenAngle,
  projectDirection,
} from '../projection/projection';
import { northCelestialPole, skyNorthScreenAngle } from '../projection/sky-orientation';
import { LocationService } from '../sensors/location.service';
import { OrientationService } from '../sensors/orientation.service';
import { SkyDataService } from '../sky/sky-data.service';
import type { SkyField } from '../sky/sky-field';
import { SkyDataError } from '../targets/providers/constellation';
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
  /** Constellations only: the star map, projected with this frame's camera (background stars and the figure). */
  sky?: SkyField;
  phase: FindPhase;
  /** ms since the current search started (drive the "glow on nearest edge" hint off this). */
  searchElapsedMs: number;
  findCount: number;
  lastFindDurationMs: number | null;
}

/** 'find': look for the selected target. 'look': Look Around, every target at once, no finding. */
export type EngineMode = 'find' | 'look';

/** One target in a Look Around frame. */
export interface LookItem {
  def: TargetDef;
  state: TargetState;
  projection: ScreenProjection;
  aboveHorizon: boolean;
}

/** Everything the Look Around renderer needs for one animation frame. */
export interface LookFrame {
  viewport: Viewport;
  basis: CameraBasis;
  items: LookItem[];
  /** The star map projected with this frame's camera; absent until it has loaded (or if it could not). */
  sky?: SkyField;
  /** Draw the constellation figures and names (the background stars are always drawn). */
  constellationsOn?: boolean;
}

const MODE_STORAGE_KEY = 'ptm.mode';
const CONSTELLATIONS_STORAGE_KEY = 'ptm.constellations';
/** Sun within this many degrees of the screen center shows the Sun safety banner in Look Around. */
export const SUN_NEAR_CENTER_DEG = 30;

/**
 * Initial mode, in priority order: `?mode=look`; then, unless the URL names a `?target=` (that stays find
 * mode), a remembered look mode; else find.
 */
function initialMode(): { mode: EngineMode; source: 'link' | 'restored' | null } {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'look') return { mode: 'look', source: 'link' };
    if (params.has('target')) return { mode: 'find', source: null };
  } catch {
    // fall through
  }
  try {
    if (localStorage.getItem(MODE_STORAGE_KEY) === 'look')
      return { mode: 'look', source: 'restored' };
  } catch {
    // fall through
  }
  return { mode: 'find', source: null };
}

/** Constellation figures are on unless the user turned them off. */
function readConstellationsOn(): boolean {
  try {
    return localStorage.getItem(CONSTELLATIONS_STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
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
  private readonly sky = inject(SkyDataService);

  /** State of the selected target; null until a location is known, and briefly after a selection change. */
  readonly target = signal<TargetState | null>(null);
  /**
   * Why the selected satellite has no position, if it has none: its orbit data is not loaded yet
   * ('no-elements') or SGP4 gave up on it ('propagation-failed'). null for everything else.
   */
  readonly targetError = signal<SatelliteDataError['code'] | SkyDataError['code'] | null>(null);
  /** found / lost events. The personality + stats layer subscribes to this. */
  readonly events$ = new Subject<TargetFindEvent>();

  private readonly initial = initialMode();
  /** Find (default) or Look Around. In look mode the tracker is paused: no found events, stats or lines. */
  readonly mode = signal<EngineMode>(this.initial.mode);
  /** How look mode was entered at startup: a `?mode=look` link or a remembered choice (null: not at startup). */
  readonly initialLookSource: 'link' | 'restored' | null = this.initial.source;
  /** Look Around: the Sun is within SUN_NEAR_CENTER_DEG of the screen center. */
  readonly lookSunNearCenter = signal(false);

  /** Look Around: draw the constellation figures and names. Persisted; on by default. */
  readonly constellationsOn = signal(readConstellationsOn());

  /** True while the user is lining up the real target (align mode): no find tracking, events or stats. */
  readonly trackerPaused = signal(false);

  private tracker: FindTrackerState | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private activeId: string | null = null;
  /** Satellites are recomputed every frame; the signal above only follows about once a second. */
  private live: TargetState | null = null;
  private lastSignalMs = -Infinity;
  private readonly lookStates = new Map<string, TargetState>();
  private readonly lookComputedAt = new Map<string, number>();

  constructor() {
    effect(() => {
      const pos = this.location.position();
      const def = this.selection.selected();
      // Orbit data arriving (or being refreshed) must recompute a satellite.
      this.gp.elements();
      this.sky.geometry();
      untracked(() => {
        // The only way the app asks for orbit data: a satellite is selected.
        if (def.kind === 'satellite') void this.gp.get();
        // The only ways the app asks for the star map: a constellation is selected, or Look Around starts.
        if (def.kind === 'constellation') void this.sky.load();
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
    if (this.mode() === 'look') this.enterLook();
    inject(DestroyRef).onDestroy(() => this.clearTimer());
  }

  /**
   * Switch between find and Look Around. Look mode pauses the tracker through the same path align mode
   * uses, so nothing is found, counted or said; going back starts a fresh search. Persists the choice
   * (localStorage, and `?mode=look` in the URL).
   */
  setMode(mode: EngineMode): void {
    if (this.mode() === mode) return;
    this.mode.set(mode);
    try {
      localStorage.setItem(MODE_STORAGE_KEY, mode);
    } catch {
      // storage unavailable: the mode still applies this session
    }
    try {
      const url = new URL(window.location.href);
      if (mode === 'look') url.searchParams.set('mode', 'look');
      else url.searchParams.delete('mode');
      history.replaceState(history.state, '', url);
    } catch {
      // no usable history API
    }
    if (mode === 'look') this.enterLook();
    else {
      this.lookSunNearCenter.set(false);
      this.setTrackerPaused(false);
    }
  }

  /** Show or hide the constellation figures and names in Look Around, and remember the choice. */
  setConstellations(on: boolean): void {
    this.constellationsOn.set(on);
    try {
      localStorage.setItem(CONSTELLATIONS_STORAGE_KEY, on ? 'on' : 'off');
    } catch {
      // storage unavailable: the choice still applies this session
    }
  }

  private enterLook(): void {
    this.setTrackerPaused(true);
    this.lookStates.clear();
    this.lookComputedAt.clear();
    // A user action, so fetching orbit data is allowed; until it arrives satellites are simply absent.
    void this.gp.get();
    void this.sky.load();
  }

  /**
   * Look Around frame: every catalog target projected with the current camera. Recomputes each target on
   * its own cadence (satellites every frame, the Moon every 5 s, everything else every 30 s). null until
   * there is a location and a camera basis.
   */
  tickLook(now: number, viewport: Viewport): LookFrame | null {
    const basis = this.orientation.basis();
    const pos = this.location.position();
    if (!basis || !pos) return null;
    const elements = this.gp.elements() ?? undefined;
    const date = new Date();
    const items: LookItem[] = [];
    let sunNear = false;
    const field = this.sky.field();
    if (field) {
      field.update(date, pos);
      field.project(basis, viewport);
    }
    for (const def of TARGETS) {
      const interval = recomputeIntervalMs(def.kind);
      const last = this.lookComputedAt.get(def.id);
      if (last === undefined || interval === 0 || now - last >= interval) {
        this.lookComputedAt.set(def.id, now);
        if (def.kind === 'satellite' && !elements) {
          this.lookStates.delete(def.id);
        } else {
          try {
            this.lookStates.set(def.id, computeTargetState(def, date, pos, elements));
          } catch (e) {
            if (!(e instanceof SatelliteDataError)) throw e;
            this.lookStates.delete(def.id);
          }
        }
      }
      const state = this.lookStates.get(def.id);
      if (!state) continue;
      const projection = projectDirection(state.direction, basis, viewport, 0);
      if (def.kind === 'sun') sunNear = projection.angularDistanceDeg < SUN_NEAR_CENTER_DEG;
      items.push({ def, state, projection, aboveHorizon: state.altitudeDeg > 0 });
    }
    if (sunNear !== this.lookSunNearCenter()) this.lookSunNearCenter.set(sunNear);
    return {
      viewport,
      basis,
      items,
      ...(field && { sky: field, constellationsOn: this.constellationsOn() }),
    };
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
      const state = computeTargetState(
        def,
        date,
        pos,
        this.gp.elements() ?? undefined,
        this.sky.geometry() ?? undefined,
      );
      this.targetError.set(null);
      return state;
    } catch (e) {
      if (e instanceof SkyDataError) {
        this.targetError.set(e.code);
        return null;
      }
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

    let sky: SkyField | undefined;
    if (def.kind === 'constellation') {
      sky = this.sky.field() ?? undefined;
      const pos = this.location.position();
      if (sky && pos) {
        sky.update(new Date(), pos);
        sky.project(basis, viewport);
      }
    }

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
        ...(sky && { sky }),
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
      ...(sky && { sky }),
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
