import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { GpService } from '../gp/gp.service';
import { GP_FIXTURE } from '../gp/testing/gp-fixture';
import { issOverheadMoment } from '../gp/testing/iss-moment';
import { StatsService } from '../personality/stats.service';
import { Viewport } from '../projection/projection';
import { LocationService } from '../sensors/location.service';
import { OrientationService } from '../sensors/orientation.service';
import { TARGETS } from '../targets/catalog';
import { SkyEngineService, TargetFindEvent } from './sky-engine.service';

const viewport: Viewport = { width: 400, height: 800, vFovDeg: 62 };
const POS = { latitude: 39.6, longitude: -104.7, heightM: 1800 };

describe('SkyEngineService: Look Around mode', () => {
  beforeEach(() => {
    localStorage.clear();
    history.replaceState(null, '', '/');
    TestBed.inject(LocationService).setManual(POS);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    history.replaceState(null, '', '/');
    localStorage.clear();
  });

  function engineWithPose(az = 180, alt = 30) {
    const engine = TestBed.inject(SkyEngineService);
    TestBed.tick();
    TestBed.inject(OrientationService).setManualPose(az, alt);
    return engine;
  }

  it('starts in find mode, and look mode pauses the tracker through the align-mode path', () => {
    const engine = engineWithPose();
    expect(engine.mode()).toBe('find');
    expect(engine.trackerPaused()).toBe(false);
    engine.setMode('look');
    expect(engine.mode()).toBe('look');
    expect(engine.trackerPaused()).toBe(true);
    engine.setMode('find');
    expect(engine.trackerPaused()).toBe(false);
  });

  it('no found events and no stats while looking around, even if the Moon is dead center', () => {
    const engine = TestBed.inject(SkyEngineService);
    TestBed.tick();
    const moon = engine.target()!;
    TestBed.inject(OrientationService).setManualPose(moon.azimuthDeg, moon.altitudeDeg);
    const events: TargetFindEvent[] = [];
    engine.events$.subscribe((e) => events.push(e));
    engine.setMode('look');
    // The renderer calls tickLook in look mode; even a stray tick() cannot find anything.
    for (const t of [0, 500, 5000, 10_000]) {
      engine.tickLook(t, viewport);
      const f = engine.tick(t, viewport)!;
      expect(f.phase).toBe('searching');
    }
    expect(events).toEqual([]);
    expect(TestBed.inject(StatsService).stats().lifetime.finds).toBe(0);
    // Back in find mode the search starts fresh and finding works again.
    engine.setMode('find');
    engine.tick(20_000, viewport);
    engine.tick(20_500, viewport);
    expect(events.map((e) => e.type)).toEqual(['found']);
  });

  it('tickLook returns every catalog target (satellites only once their orbit data is in)', () => {
    const engine = engineWithPose();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );
    engine.setMode('look');
    const frame = engine.tickLook(0, viewport)!;
    expect(frame.items.map((i) => i.def.id).sort()).toEqual(
      TARGETS.filter((t) => t.kind !== 'satellite')
        .map((t) => t.id)
        .sort(),
    );
    for (const item of frame.items) {
      expect(item.aboveHorizon).toBe(item.state.altitudeDeg > 0);
      expect(Number.isFinite(item.state.azimuthDeg)).toBe(true);
    }
    TestBed.inject(GpService).data.set({ ...GP_FIXTURE, fetchedAt: new Date().toISOString() });
    const withSats = engine.tickLook(16, viewport)!;
    expect(withSats.items).toHaveLength(TARGETS.length);
  });

  it('fetching orbit data starts with look mode (a user action), and not before', () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const engine = engineWithPose();
    expect(fetchMock).not.toHaveBeenCalled();
    engine.setMode('look');
    expect(fetchMock).toHaveBeenCalled();
  });

  it("recomputes on each kind's cadence: satellites every frame, the Moon every 5 s, others every 30 s", () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(issOverheadMoment(POS));
    TestBed.inject(GpService).data.set({ ...GP_FIXTURE, fetchedAt: new Date().toISOString() });
    const engine = engineWithPose();
    engine.setMode('look');
    const at = (ms: number) => {
      vi.setSystemTime(new Date(issOverheadMoment(POS).getTime() + ms));
      return new Map(engine.tickLook(ms, viewport)!.items.map((i) => [i.def.id, i.state]));
    };
    const a = at(0);
    const b = at(1000);
    expect(b.get('iss')).not.toBe(a.get('iss'));
    expect(b.get('moon')).toBe(a.get('moon'));
    expect(b.get('jupiter')).toBe(a.get('jupiter'));
    const c = at(6000);
    expect(c.get('moon')).not.toBe(a.get('moon'));
    expect(c.get('jupiter')).toBe(a.get('jupiter'));
    const d = at(31_000);
    expect(d.get('jupiter')).not.toBe(a.get('jupiter'));
  });

  it('flags the Sun when it is within 30 degrees of the screen center', () => {
    const engine = TestBed.inject(SkyEngineService);
    TestBed.tick();
    TestBed.inject(OrientationService).setManualPose(0, 20);
    engine.setMode('look');
    const sun = engine.tickLook(0, viewport)!.items.find((i) => i.def.id === 'sun')!;
    TestBed.inject(OrientationService).setManualPose(sun.state.azimuthDeg, sun.state.altitudeDeg);
    engine.tickLook(16, viewport);
    expect(engine.lookSunNearCenter()).toBe(true);
    TestBed.inject(OrientationService).setManualPose(
      sun.state.azimuthDeg + 120,
      sun.state.altitudeDeg,
    );
    engine.tickLook(32, viewport);
    expect(engine.lookSunNearCenter()).toBe(false);
  });

  it('persists the mode: localStorage and ?mode=look in the URL', () => {
    const engine = TestBed.inject(SkyEngineService);
    engine.setMode('look');
    expect(localStorage.getItem('ptm.mode')).toBe('look');
    expect(new URLSearchParams(location.search).get('mode')).toBe('look');
    engine.setMode('find');
    expect(localStorage.getItem('ptm.mode')).toBe('find');
    expect(new URLSearchParams(location.search).has('mode')).toBe(false);
  });

  it('?mode=look starts in look mode; a remembered look mode is restored; ?target= alone stays find', () => {
    const fresh = (search: string) => {
      TestBed.resetTestingModule();
      history.replaceState(null, '', '/' + search);
      TestBed.inject(LocationService).setManual(POS);
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('nope', { status: 500 })),
      );
      const e = TestBed.inject(SkyEngineService);
      return { mode: e.mode(), source: e.initialLookSource, paused: e.trackerPaused() };
    };
    expect(fresh('?mode=look')).toEqual({ mode: 'look', source: 'link', paused: true });
    localStorage.setItem('ptm.mode', 'look');
    expect(fresh('')).toEqual({ mode: 'look', source: 'restored', paused: true });
    expect(fresh('?target=jupiter')).toEqual({ mode: 'find', source: null, paused: false });
    expect(fresh('?target=jupiter&mode=look')).toEqual({
      mode: 'look',
      source: 'link',
      paused: true,
    });
    localStorage.setItem('ptm.mode', 'find');
    expect(fresh('')).toEqual({ mode: 'find', source: null, paused: false });
  });
});
