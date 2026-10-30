import { TestBed } from '@angular/core/testing';
import { GpService } from '../gp/gp.service';
import { GP_FIXTURE } from '../gp/testing/gp-fixture';
import { drawLook } from '../render/draw-look';
import { LocationService } from '../sensors/location.service';
import { OrientationService } from '../sensors/orientation.service';
import { SkyDataService } from '../sky/sky-data.service';
import { skyGeometry } from '../sky/testing/sky-fixture';
import { SkyEngineService } from './sky-engine.service';

/** A canvas context whose methods do nothing, so only our own per-frame work is timed. */
function noopContext(): CanvasRenderingContext2D {
  const fn = () => ({ width: 40, addColorStop: () => undefined });
  return new Proxy({}, { get: () => fn, set: () => true }) as unknown as CanvasRenderingContext2D;
}

describe('Look Around per-frame cost with the star map and constellations on', () => {
  beforeEach(() => {
    localStorage.clear();
    history.replaceState(null, '', '/');
  });
  afterEach(() => {
    localStorage.clear();
    history.replaceState(null, '', '/');
  });

  it('a frame (targets + projecting ~1,600 stars and ~900 figure points + drawing) stays well below 16 ms', () => {
    TestBed.inject(LocationService).setManual({ latitude: 39.6, longitude: -104.7, heightM: 1800 });
    TestBed.inject(GpService).data.set({ ...GP_FIXTURE, fetchedAt: new Date().toISOString() });
    TestBed.inject(SkyDataService).geometry.set(skyGeometry());
    const engine = TestBed.inject(SkyEngineService);
    TestBed.tick();
    engine.setMode('look');
    const viewport = { width: 390, height: 844, vFovDeg: 62 };
    TestBed.inject(OrientationService).setManualPose(110, 35);
    const ctx = noopContext();

    // Warm up, then 400 frames at 60 fps.
    for (let i = 0; i < 20; i++) drawLook(ctx, engine.tickLook(i * 16, viewport)!);
    const times: number[] = [];
    for (let i = 0; i < 400; i++) {
      const t = performance.now();
      const frame = engine.tickLook(1000 + i * 16, viewport)!;
      drawLook(ctx, frame);
      times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    const median = times[200];
    const p90 = times[360];
    // The budget is generous because the whole suite runs in parallel on shared CI machines; the real
    // numbers are in docs/phases/phase10-report.md.
    expect(median).toBeLessThan(6);
    expect(p90).toBeLessThan(16);
  });
});
