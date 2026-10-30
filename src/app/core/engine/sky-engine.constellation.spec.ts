import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Viewport, projectDirection } from '../projection/projection';
import { LocationService } from '../sensors/location.service';
import { OrientationService } from '../sensors/orientation.service';
import { SkyDataService } from '../sky/sky-data.service';
import { skyGeometry } from '../sky/testing/sky-fixture';
import { getTarget } from '../targets/catalog';
import { TargetSelectionService } from '../targets/target-selection.service';
import { centeredThreshold, displayRadiusFor } from '../targets/display';
import { SkyEngineService, TargetFindEvent } from './sky-engine.service';

const viewport: Viewport = { width: 400, height: 800, vFovDeg: 62 };
const POS = { latitude: 39.6, longitude: -104.7, heightM: 1800 };
const WINTER_EVENING = new Date('2026-12-15T04:00:00Z');

describe('SkyEngineService: constellations', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(WINTER_EVENING);
    localStorage.clear();
    history.replaceState(null, '', '/?target=orion');
    TestBed.inject(LocationService).setManual(POS);
    // The service would fetch the map; the specs for that are in app.sky.spec.ts. Here it is "already loaded".
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 404 })),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    history.replaceState(null, '', '/');
    localStorage.clear();
  });

  function loaded() {
    TestBed.inject(SkyDataService).geometry.set(skyGeometry());
    const engine = TestBed.inject(SkyEngineService);
    TestBed.tick();
    return engine;
  }

  it('without the star map there is no target, and the error says why (no guess, no crash)', () => {
    const engine = TestBed.inject(SkyEngineService);
    TestBed.tick();
    expect(engine.target()).toBeNull();
    expect(engine.targetError()).toBe('no-star-map');
    TestBed.inject(OrientationService).setManualPose(90, 30);
    expect(engine.tick(0, viewport)).toBeNull();
  });

  it('with the map, the target is the figure: direction of its center, size of its extent, no magnitude', () => {
    const engine = loaded();
    const t = engine.target()!;
    expect(t.id).toBe('orion');
    expect(engine.targetError()).toBeNull();
    expect(t.magnitude).toBeNull();
    expect(t.angularSizeDeg).toBeGreaterThan(30);
    expect(t.altitudeDeg).toBeGreaterThan(10);
  });

  it('a frame carries the projected star map, and the display radius is the figure true size', () => {
    const engine = loaded();
    const t = engine.target()!;
    TestBed.inject(OrientationService).setManualPose(t.azimuthDeg, t.altitudeDeg);
    const f = engine.tick(0, viewport)!;
    expect(f.def.id).toBe('orion');
    expect(f.sky).toBeDefined();
    expect(f.sky?.geometry).toBe(skyGeometry());
    // At the target's own center: the projection is on top of the screen center.
    expect(f.projection.centerDistance).toBeLessThan(0.01);
    const expected = displayRadiusFor(t, viewport);
    expect(f.radiusPx).toBe(expected);
    // True size: far bigger than the minimum sprite for a 40-degree figure.
    expect(f.radiusPx).toBeGreaterThan(150);
  });

  it('is found by pointing near the middle of it (the threshold grows with its size) and lost when you turn away', () => {
    const engine = loaded();
    const events: TargetFindEvent[] = [];
    engine.events$.subscribe((e) => events.push(e));
    const t = engine.target()!;
    const ori = TestBed.inject(OrientationService);
    ori.setManualPose(t.azimuthDeg + 180, 10);
    engine.tick(0, viewport);
    // A large figure gets a loose threshold: well off its center still counts.
    const radius = displayRadiusFor(t, viewport);
    expect(centeredThreshold(radius, viewport)).toBe(0.8);
    ori.setManualPose(t.azimuthDeg, t.altitudeDeg);
    let frame = engine.tick(100, viewport)!;
    expect(frame.phase).toBe('visible');
    frame = engine.tick(100 + 3000, viewport)!;
    expect(frame.phase).toBe('found');
    expect(events.filter((e) => e.type === 'found').map((e) => e.targetId)).toEqual(['orion']);
  });

  it('a small figure (Crux) keeps the normal threshold', () => {
    const crux = getTarget('crux')!;
    const s = {
      id: 'crux',
      computedAt: new Date(),
      direction: [0, 1, 0] as const,
      azimuthDeg: 0,
      altitudeDeg: 0,
      magnitude: null,
      angularSizeDeg: 2 * skyGeometry().byId.get('crux')!.radiusDeg,
    };
    const r = displayRadiusFor(s, viewport);
    expect(crux.render).toBe('constellation');
    expect(r).toBeLessThan(80);
    expect(centeredThreshold(r, viewport)).toBeLessThan(0.5);
  });

  it('edge glow data works as for other targets: the projection reports the direction to the center when off screen', () => {
    const engine = loaded();
    const t = engine.target()!;
    TestBed.inject(OrientationService).setManualPose(t.azimuthDeg + 120, 10);
    const f = engine.tick(0, viewport)!;
    expect(f.projection.onScreen).toBe(false);
    expect(Number.isFinite(f.projection.edgeAngleRad)).toBe(true);
    expect(f.phase).toBe('searching');
  });

  it('switching to another target drops the star map from the frame and resets the search', () => {
    const engine = loaded();
    const ori = TestBed.inject(OrientationService);
    const t = engine.target()!;
    ori.setManualPose(t.azimuthDeg, t.altitudeDeg);
    expect(engine.tick(0, viewport)?.sky).toBeDefined();
    TestBed.inject(TargetSelectionService).select('moon');
    TestBed.tick();
    expect(engine.target()?.id).toBe('moon');
    ori.setManualPose(0, 0);
    const f = engine.tick(10, viewport)!;
    expect(f.def.id).toBe('moon');
    expect(f.sky).toBeUndefined();
    expect(f.phase).toBe('searching');
  });
});

describe('SkyEngineService: Look Around and the star map', () => {
  const look: Viewport = { width: 390, height: 844, vFovDeg: 62 };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(WINTER_EVENING);
    localStorage.clear();
    history.replaceState(null, '', '/');
    TestBed.inject(LocationService).setManual(POS);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 404 })),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    history.replaceState(null, '', '/');
    localStorage.clear();
  });

  function lookEngine() {
    TestBed.inject(SkyDataService).geometry.set(skyGeometry());
    const engine = TestBed.inject(SkyEngineService);
    TestBed.tick();
    engine.setMode('look');
    TestBed.inject(OrientationService).setManualPose(100, 30);
    return engine;
  }

  it('the frame has the projected star map; the 22 targets are unchanged and no constellation is a marker', () => {
    const frame = lookEngine().tickLook(0, look)!;
    expect(frame.sky).toBeDefined();
    expect(frame.constellationsOn).toBe(true);
    expect(frame.items.every((i) => i.def.kind !== 'constellation')).toBe(true);
    expect(frame.items.length).toBeLessThanOrEqual(22);
  });

  it('transforms once per second: the same second reuses the rotated stars, a new second redoes them', () => {
    const engine = lookEngine();
    const field = TestBed.inject(SkyDataService).field()!;
    const update = vi.spyOn(field, 'update');
    engine.tickLook(0, look);
    engine.tickLook(16, look);
    vi.setSystemTime(new Date(WINTER_EVENING.getTime() + 400));
    engine.tickLook(32, look);
    const results = update.mock.results.map((r) => r.value as boolean);
    expect(results.filter(Boolean).length).toBeLessThanOrEqual(1);
    vi.setSystemTime(new Date(WINTER_EVENING.getTime() + 1100));
    engine.tickLook(48, look);
    expect(update.mock.results.at(-1)?.value).toBe(true);
  });

  it('the constellations switch is remembered and defaults to on; stars stay either way', () => {
    const engine = lookEngine();
    expect(engine.constellationsOn()).toBe(true);
    engine.setConstellations(false);
    expect(localStorage.getItem('ptm.constellations')).toBe('off');
    const off = engine.tickLook(0, look)!;
    expect(off.constellationsOn).toBe(false);
    expect(off.sky).toBeDefined();
    engine.setConstellations(true);
    expect(localStorage.getItem('ptm.constellations')).toBe('on');
    expect(engine.tickLook(1, look)!.constellationsOn).toBe(true);
  });

  it('projection matches the pinhole projection of the rotated vectors', () => {
    const frame = lookEngine().tickLook(0, look)!;
    const sky = frame.sky!;
    for (let i = 0; i < 600; i += 37) {
      const p = projectDirection(
        [sky.starEnu[i * 3], sky.starEnu[i * 3 + 1], sky.starEnu[i * 3 + 2]],
        frame.basis,
        look,
      );
      expect(sky.starInFront[i] === 1).toBe(p.inFront);
    }
  });
});
