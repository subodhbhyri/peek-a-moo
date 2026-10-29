import { Injectable, inject, signal } from '@angular/core';
import { LocationService } from '../sensors/location.service';
import { Availability, computeAvailability, computeAvailabilityChunked } from './availability';
import { TARGETS } from './catalog';
import type { TargetDef } from './target.types';

/** Availability results stay valid this long (and only for the same rounded location). */
export const AVAILABILITY_TTL_MS = 5 * 60_000;

/**
 * Per-target availability for the picker and the intro, cached for 5 minutes per (rounded) location.
 * `refreshAll()` fills the catalog in chunks so the sheet can open instantly with skeleton labels.
 */
@Injectable({ providedIn: 'root' })
export class AvailabilityService {
  private readonly location = inject(LocationService);

  /** Latest result per target id. Missing = not computed yet (show a skeleton). */
  readonly byId = signal<Readonly<Record<string, Availability>>>({});

  /** Overridable clock, for tests. */
  now: () => Date = () => new Date();

  private locationKey: string | null = null;
  private running: Promise<void> | null = null;

  /** One target, computed synchronously unless a fresh result is cached. */
  ensure(def: TargetDef): Availability | null {
    const pos = this.location.position();
    if (!pos) return null;
    this.dropIfMoved();
    const cached = this.fresh(def.id);
    if (cached) return cached;
    const a = computeAvailability(def, this.now(), pos);
    this.byId.update((m) => ({ ...m, [def.id]: a }));
    return a;
  }

  /** The whole catalog, chunked. Resolves when everything is fresh. Concurrent calls share one run. */
  refreshAll(): Promise<void> {
    const pos = this.location.position();
    if (!pos) return Promise.resolve();
    this.dropIfMoved();
    if (this.running) return this.running;
    const stale = TARGETS.filter((t) => !this.fresh(t.id));
    if (stale.length === 0) return Promise.resolve();
    this.running = computeAvailabilityChunked(stale, this.now(), pos, (a) =>
      this.byId.update((m) => ({ ...m, [a.targetId]: a })),
    ).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private fresh(id: string): Availability | null {
    const a = this.byId()[id];
    return a && this.now().getTime() - a.computedAt.getTime() < AVAILABILITY_TTL_MS ? a : null;
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
