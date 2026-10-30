import { Injectable, inject, signal } from '@angular/core';
import { GpService } from '../gp/gp.service';
import { LocationService } from '../sensors/location.service';
import { SkyDataService } from '../sky/sky-data.service';
import type { GeoPosition } from '../astro/ephemeris';
import { Availability, computeAvailability, computeAvailabilityChunked } from './availability';
import { ALL_TARGETS, TARGETS } from './catalog';
import type { TargetDef } from './target.types';

/** Availability results stay valid this long (and only for the same rounded location). */
export const AVAILABILITY_TTL_MS = 5 * 60_000;
/** Satellites move: "overhead now" goes stale much faster than "Jupiter rises at 9". */
export const SATELLITE_TTL_MS = 60_000;

/**
 * Per-target availability for the picker and the intro, cached for 5 minutes per (rounded) location.
 * `refreshAll()` fills the catalog in chunks so the sheet can open instantly with skeleton labels.
 */
@Injectable({ providedIn: 'root' })
export class AvailabilityService {
  private readonly location = inject(LocationService);
  private readonly gp = inject(GpService);
  private readonly sky = inject(SkyDataService);

  /** Latest result per target id. Missing = not computed yet (show a skeleton). */
  readonly byId = signal<Readonly<Record<string, Availability>>>({});

  /** Overridable clock, for tests. */
  now: () => Date = () => new Date();

  private locationKey: string | null = null;
  private running: Promise<void> | null = null;
  /** Constellation rows the picker is showing beyond the 22 prominent ones (Show all, a search). */
  private extra: readonly TargetDef[] = [];
  /** Which element-set snapshot each satellite's result was computed from. */
  private readonly gpStamps: Record<string, string> = {};

  /** One target, computed synchronously unless a fresh result is cached. */
  ensure(def: TargetDef): Availability | null {
    const pos = this.location.position();
    if (!pos) return null;
    this.dropIfMoved();
    const cached = this.fresh(def);
    if (cached) return cached;
    if (!this.canCompute(def)) return null;
    const a = this.compute(def, pos);
    this.byId.update((m) => ({ ...m, [def.id]: a }));
    return a;
  }

  /** The whole catalog, chunked. Resolves when everything is fresh. Concurrent calls share one run. */
  refreshAll(extra: readonly TargetDef[] = this.extra): Promise<void> {
    const pos = this.location.position();
    if (!pos) return Promise.resolve();
    this.dropIfMoved();
    this.extra = extra;
    if (this.running) return this.running;
    const wanted = new Set([
      ...TARGETS,
      // The 22 prominent constellations with the rest of the catalog; others only when asked for.
      ...ALL_TARGETS.filter((t) => t.constellation?.rank === 1),
      ...this.extra,
    ]);
    const stale = [...wanted].filter((t) => !this.fresh(t) && this.canCompute(t));
    if (stale.length === 0) return Promise.resolve();
    const stamp = this.gp.stamp();
    this.running = computeAvailabilityChunked(
      stale,
      this.now(),
      pos,
      (a) => {
        this.gpStamps[a.targetId] = stamp;
        this.byId.update((m) => ({ ...m, [a.targetId]: a }));
      },
      { elements: this.gp.elements() ?? undefined, sky: this.sky.geometry() ?? undefined },
    ).then(
      () => {
        this.running = null;
        // Orbit data may have arrived mid-run (a call during the run joined it): pick up what is left.
        return this.refreshAll();
      },
      (e: unknown) => {
        this.running = null;
        throw e;
      },
    );
    return this.running;
  }

  /**
   * Satellites wait for their orbit data (a skeleton meanwhile), unless it is known to be unavailable.
   * Constellations wait for the star map, which is never fetched on their account here.
   */
  private canCompute(def: TargetDef): boolean {
    if (def.kind === 'constellation') return this.sky.geometry() !== null;
    return (
      def.kind !== 'satellite' || this.gp.elements() !== null || this.gp.status() === 'unavailable'
    );
  }

  private compute(def: TargetDef, pos: GeoPosition): Availability {
    this.gpStamps[def.id] = this.gp.stamp();
    return computeAvailability(def, this.now(), pos, {
      elements: this.gp.elements() ?? undefined,
      sky: this.sky.geometry() ?? undefined,
    });
  }

  private fresh(def: TargetDef): Availability | null {
    const a = this.byId()[def.id];
    if (!a) return null;
    const isSat = def.kind === 'satellite';
    if (isSat && this.gpStamps[def.id] !== this.gp.stamp()) return null;
    const ttl = isSat ? SATELLITE_TTL_MS : AVAILABILITY_TTL_MS;
    return this.now().getTime() - a.computedAt.getTime() < ttl ? a : null;
  }

  /** A different (rounded) location invalidates everything. */
  private dropIfMoved(): void {
    const pos = this.location.position();
    if (!pos) return;
    const key = `${pos.latitude.toFixed(1)},${pos.longitude.toFixed(1)}`;
    if (this.locationKey !== null && key !== this.locationKey) this.byId.set({});
    this.locationKey = key;
  }
}
