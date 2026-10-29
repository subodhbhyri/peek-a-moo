import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { GpService } from '../gp/gp.service';
import { GP_FIXTURE } from '../gp/testing/gp-fixture';
import { Viewport } from '../projection/projection';
import { LocationService } from '../sensors/location.service';
import { OrientationService } from '../sensors/orientation.service';
import { getTarget } from '../targets/catalog';
import { satelliteTargetState } from '../targets/providers/satellite';
import { FIXTURE_ELEMENTS } from '../gp/testing/gp-fixture';
import { SkyEngineService, TargetFindEvent } from './sky-engine.service';

const viewport: Viewport = { width: 400, height: 800, vFovDeg: 62 };
const POS = { latitude: 39.6, longitude: -104.7, heightM: 1800 };

/** A moment, after the fixture's fetch time, when the ISS is well above the horizon. */
function issOverheadMoment(): Date {
  const iss = getTarget('iss')!;
  for (let t = Date.parse('2026-10-29T20:30:00Z'); ; t += 30_000) {
    if (satelliteTargetState(iss, new Date(t), POS, FIXTURE_ELEMENTS).altitudeDeg > 25) {
      return new Date(t);
    }
  }
}

describe('SkyEngineService: satellites', () => {
  const when = issOverheadMoment();

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(when);
    history.replaceState(null, '', '/?target=iss');
    localStorage.clear();
    TestBed.inject(LocationService).setManual(POS);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    history.replaceState(null, '', '/');
    localStorage.clear();
  });

  function withData() {
    TestBed.inject(GpService).data.set({ ...GP_FIXTURE, fetchedAt: new Date().toISOString() });
    const engine = TestBed.inject(SkyEngineService);
    TestBed.tick();
    return engine;
  }

  it('computes the ISS from the loaded elements and carries a 12-point screen trail with a fixed 6 px dot', () => {
    const engine = withData();
    const iss = engine.target()!;
    expect(iss.id).toBe('iss');
    expect(iss.satellite).toBeDefined();
    TestBed.inject(OrientationService).setManualPose(iss.azimuthDeg, iss.altitudeDeg);
    const f = engine.tick(0, viewport)!;
    expect(f.def.id).toBe('iss');
    expect(f.radiusPx).toBe(6);
    expect(f.trail).toHaveLength(12);
    expect(f.trail!.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    expect(engine.targetError()).toBeNull();
  });

  it('recomputes every frame (cadence 0) but updates the signal only about once a second', () => {
    const engine = withData();
    const first = engine.target()!;
    TestBed.inject(OrientationService).setManualPose(first.azimuthDeg, first.altitudeDeg);
    engine.tick(0, viewport); // the first frame also publishes to the signal
    const published = engine.target()!;
    vi.setSystemTime(new Date(when.getTime() + 2000));
    const f = engine.tick(500, viewport)!;
    expect(f.target.computedAt.getTime()).toBe(when.getTime() + 2000);
    expect(f.target.direction).not.toEqual(first.direction);
    expect(engine.target()).toBe(published); // the signal has not been touched since
    expect(engine.currentTarget()).toBe(f.target);
    vi.setSystemTime(new Date(when.getTime() + 3000));
    engine.tick(1100, viewport);
    expect(engine.target()).not.toBe(published);
    expect(engine.target()!.computedAt.getTime()).toBe(when.getTime() + 3000);
  });

  it('a centered ISS is found after the dwell time, with its own id on the event', () => {
    const engine = withData();
    const iss = engine.target()!;
    TestBed.inject(OrientationService).setManualPose(iss.azimuthDeg, iss.altitudeDeg);
    const events: TargetFindEvent[] = [];
    engine.events$.subscribe((e) => events.push(e));
    engine.tick(0, viewport);
    vi.setSystemTime(new Date(when.getTime() + 400));
    engine.tick(500, viewport);
    expect(events.map((e) => [e.type, e.targetId])).toEqual([['found', 'iss']]);
  });

  it('without orbit data there is no target, and the engine says why instead of crashing', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );
    const engine = TestBed.inject(SkyEngineService);
    TestBed.tick();
    expect(engine.target()).toBeNull();
    expect(engine.targetError()).toBe('no-elements');
    TestBed.inject(OrientationService).setManualPose(0, 20);
    expect(engine.tick(0, viewport)).toBeNull();
  });

  it('asks for orbit data because a satellite is selected (not before)', () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    TestBed.inject(SkyEngineService);
    TestBed.tick();
    expect(fetchMock).toHaveBeenCalled();
  });

  it('does not ask for it when the Moon is selected', () => {
    history.replaceState(null, '', '/?target=moon');
    const fetchMock = vi.fn(async () => new Response('nope', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const engine = TestBed.inject(SkyEngineService);
    TestBed.tick();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(engine.target()!.id).toBe('moon');
  });
});
