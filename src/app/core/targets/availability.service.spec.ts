import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { LocationService } from '../sensors/location.service';
import { AVAILABILITY_TTL_MS, AvailabilityService } from './availability.service';
import { TARGETS, getTarget } from './catalog';

const POS = { latitude: 39.6, longitude: -104.7, heightM: 1800 };

describe('AvailabilityService', () => {
  let clock: Date;
  function setup() {
    const loc = TestBed.inject(LocationService);
    loc.setManual(POS);
    const svc = TestBed.inject(AvailabilityService);
    clock = new Date('2026-10-25T09:54:00Z');
    svc.now = () => clock;
    return { loc, svc };
  }
  afterEach(() => vi.useRealTimers());

  it('returns null without a location', () => {
    const svc = TestBed.inject(AvailabilityService);
    expect(svc.ensure(getTarget('moon')!)).toBeNull();
  });

  it('caches a target for 5 minutes', () => {
    const { svc } = setup();
    const first = svc.ensure(getTarget('jupiter')!)!;
    expect(svc.ensure(getTarget('jupiter')!)).toBe(first);
    clock = new Date(clock.getTime() + AVAILABILITY_TTL_MS - 1000);
    expect(svc.ensure(getTarget('jupiter')!)).toBe(first);
    clock = new Date(clock.getTime() + 2000);
    const second = svc.ensure(getTarget('jupiter')!)!;
    expect(second).not.toBe(first);
    expect(second.computedAt).toEqual(clock);
  });

  it('a different rounded location invalidates the cache; a nearby one does not', () => {
    const { loc, svc } = setup();
    const first = svc.ensure(getTarget('sirius')!)!;
    loc.setManual({ ...POS, latitude: POS.latitude + 0.01 }); // same 0.1 degree cell
    expect(svc.ensure(getTarget('sirius')!)).toBe(first);
    loc.setManual({ ...POS, latitude: POS.latitude + 2 });
    const moved = svc.ensure(getTarget('sirius')!)!;
    expect(moved).not.toBe(first);
  });

  it('refreshAll fills the whole catalog, skips fresh targets, and shares a concurrent run', async () => {
    vi.useFakeTimers();
    const { svc } = setup();
    const a = svc.refreshAll();
    const b = svc.refreshAll();
    expect(b).toBe(a);
    await vi.runAllTimersAsync();
    await a;
    expect(Object.keys(svc.byId()).sort()).toEqual(TARGETS.map((t) => t.id).sort());
    const snapshot = svc.byId();
    await svc.refreshAll(); // everything is fresh: nothing recomputed
    expect(svc.byId()).toBe(snapshot);
  });

  it('refreshAll fills in labels progressively, one target per tick', async () => {
    vi.useFakeTimers();
    const { svc } = setup();
    const done = svc.refreshAll();
    expect(Object.keys(svc.byId())).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(Object.keys(svc.byId()).length).toBeGreaterThanOrEqual(2);
    await vi.runAllTimersAsync();
    await done;
  });
});
