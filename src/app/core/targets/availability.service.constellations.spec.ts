import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { LocationService } from '../sensors/location.service';
import { SkyDataService } from '../sky/sky-data.service';
import { skyGeometry } from '../sky/testing/sky-fixture';
import { AvailabilityService } from './availability.service';
import { ALL_TARGETS, TARGETS, getTarget } from './catalog';

const POS = { latitude: 39.6, longitude: -104.7, heightM: 1800 };
const rank1 = ALL_TARGETS.filter((t) => t.constellation?.rank === 1);
const notSatellite = (ids: string[]) => ids.filter((id) => getTarget(id)!.kind !== 'satellite');

describe('AvailabilityService: constellations', () => {
  afterEach(() => vi.useRealTimers());

  function setup() {
    TestBed.inject(LocationService).setManual(POS);
    const svc = TestBed.inject(AvailabilityService);
    svc.now = () => new Date('2026-12-15T04:00:00Z');
    return svc;
  }

  it('without the star map they are skipped (and it is never fetched on their behalf)', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const svc = setup();
    expect(svc.ensure(getTarget('orion')!)).toBeNull();
    const run = svc.refreshAll();
    await vi.runAllTimersAsync();
    await run;
    expect(Object.keys(svc.byId()).some((id) => getTarget(id)!.kind === 'constellation')).toBe(
      false,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('with the star map, refreshAll adds the 22 prominent ones; the rest only when asked for', async () => {
    vi.useFakeTimers();
    TestBed.inject(SkyDataService).geometry.set(skyGeometry());
    const svc = setup();
    const run = svc.refreshAll();
    await vi.runAllTimersAsync();
    await run;
    const ids = Object.keys(svc.byId());
    expect(ids.filter((id) => getTarget(id)!.kind === 'constellation').sort()).toEqual(
      rank1.map((t) => t.id).sort(),
    );
    expect(ids).toHaveLength(notSatellite(TARGETS.map((t) => t.id)).length + 22);

    const crux = getTarget('crux')!;
    expect(svc.byId()['crux']).toBeUndefined();
    const more = svc.refreshAll([crux, getTarget('octans')!]);
    await vi.runAllTimersAsync();
    await more;
    expect(svc.byId()['crux']).toBeDefined();
    expect(svc.byId()['octans']?.neverRisesHere).toBe(true);
  });

  it('ensure() computes one constellation synchronously once the map is there, and caches it', () => {
    TestBed.inject(SkyDataService).geometry.set(skyGeometry());
    const svc = setup();
    const a = svc.ensure(getTarget('orion')!)!;
    expect(a.targetId).toBe('orion');
    expect(a.visibility).toBe('up-visible');
    expect(svc.ensure(getTarget('orion')!)).toBe(a);
  });
});
