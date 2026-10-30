import { TestBed } from '@angular/core/testing';
import { TargetFindEvent } from './sky-engine.service';
import { LocationService } from '../sensors/location.service';
import { OrientationService } from '../sensors/orientation.service';
import { Viewport } from '../projection/projection';
import { SkyEngineService } from './sky-engine.service';

const viewport: Viewport = { width: 400, height: 800, vFovDeg: 62 };

describe('SkyEngineService: tracker pause (align mode)', () => {
  // Start every test from a clean slate: a remembered Look Around mode (ptm.mode) or ?mode=look left behind
  // by another spec in the same worker would start the engine paused and nothing would ever be found.
  beforeEach(() => {
    localStorage.clear();
    history.replaceState(null, '', '/');
  });

  function setup() {
    TestBed.inject(LocationService).setManual({ latitude: 40, longitude: -75 });
    const engine = TestBed.inject(SkyEngineService);
    TestBed.tick(); // flush the effect that computes the Moon
    const moon = engine.target()!;
    // Point the camera straight at the Moon so it is always centered.
    TestBed.inject(OrientationService).setManualPose(moon.azimuthDeg, moon.altitudeDeg);
    const events: TargetFindEvent[] = [];
    engine.events$.subscribe((e) => events.push(e));
    return { engine, events };
  }

  it('baseline: centered Moon is found after the dwell time', () => {
    const { engine, events } = setup();
    engine.tick(0, viewport);
    engine.tick(500, viewport);
    expect(events.map((e) => e.type)).toEqual(['found']);
    expect(events[0].targetId).toBe('moon');
  });

  it('emits nothing while paused, then resumes with a fresh search timer', () => {
    const { engine, events } = setup();
    engine.tick(0, viewport);
    engine.setTrackerPaused(true);
    for (let t = 100; t <= 5000; t += 100) {
      const f = engine.tick(t, viewport)!;
      expect(f.phase).toBe('searching');
      expect(f.searchElapsedMs).toBe(0);
    }
    expect(events).toEqual([]);

    engine.setTrackerPaused(false);
    const first = engine.tick(6000, viewport)!;
    expect(first.searchElapsedMs).toBe(0); // fresh timer, not 6 s
    engine.tick(6500, viewport);
    expect(events).toHaveLength(1);
    const found = events[0] as Extract<TargetFindEvent, { type: 'found' }>;
    expect(found.durationMs).toBe(500); // measured from resume, not from session start
    expect(found.findIndex).toBe(1);
  });

  it('pausing mid-find drops it silently: no lost event, and resume starts a fresh find', () => {
    const { engine, events } = setup();
    engine.tick(0, viewport);
    engine.tick(500, viewport);
    expect(engine.tick(600, viewport)!.phase).toBe('found');
    events.length = 0;
    engine.setTrackerPaused(true);
    engine.tick(700, viewport);
    engine.setTrackerPaused(false);
    // Fresh tracker: the Moon is on screen again but must dwell before it counts as found.
    expect(engine.tick(800, viewport)!.phase).toBe('visible');
    expect(events).toEqual([]);
  });
});

describe('SkyEngineService: planets via ?target=', () => {
  afterEach(() => history.replaceState(null, '', '/'));

  it('runs the whole find flow for Jupiter, with its own id on the events', () => {
    history.replaceState(null, '', '/?target=jupiter');
    TestBed.inject(LocationService).setManual({ latitude: 39.6, longitude: -104.7, heightM: 1800 });
    const engine = TestBed.inject(SkyEngineService);
    TestBed.tick();
    const jupiter = engine.target()!;
    expect(jupiter.id).toBe('jupiter');
    TestBed.inject(OrientationService).setManualPose(jupiter.azimuthDeg, jupiter.altitudeDeg);
    const events: TargetFindEvent[] = [];
    engine.events$.subscribe((e) => events.push(e));

    const f = engine.tick(0, viewport)!;
    expect(f.def.id).toBe('jupiter');
    expect(f.brightLimbRad).not.toBeNull(); // planets carry a sun direction
    expect(Number.isFinite(f.skyNorthRad)).toBe(true);
    expect(f.radiusPx).toBeGreaterThanOrEqual(0.035 * viewport.width);
    engine.tick(500, viewport);
    expect(events.map((e) => [e.type, e.targetId])).toEqual([['found', 'jupiter']]);
  });
});
