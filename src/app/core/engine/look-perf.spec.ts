import { TestBed } from '@angular/core/testing';
import { GpService } from '../gp/gp.service';
import { GP_FIXTURE } from '../gp/testing/gp-fixture';
import { drawLook } from '../render/draw-look';
import { LocationService } from '../sensors/location.service';
import { OrientationService } from '../sensors/orientation.service';
import { TARGETS } from '../targets/catalog';
import { SkyEngineService } from './sky-engine.service';

/** A canvas context whose methods do nothing, so only our own per-frame work is timed. */
function noopContext(): CanvasRenderingContext2D {
  const fn = () => ({ width: 40, addColorStop: () => undefined });
  return new Proxy({}, { get: () => fn, set: () => true }) as unknown as CanvasRenderingContext2D;
}

describe('Look Around per-frame cost (all 22 targets, laptop, drag mode)', () => {
  // setMode('look') persists to localStorage and the URL: clean up, or the next spec in this worker starts
  // its engine in Look Around (paused) and never finds anything.
  beforeEach(() => {
    localStorage.clear();
    history.replaceState(null, '', '/');
  });
  afterEach(() => {
    localStorage.clear();
    history.replaceState(null, '', '/');
  });

  it('a frame (state refresh + projection + label layout + drawing calls) stays far below 16 ms', () => {
    TestBed.inject(LocationService).setManual({ latitude: 39.6, longitude: -104.7, heightM: 1800 });
    TestBed.inject(GpService).data.set({ ...GP_FIXTURE, fetchedAt: new Date().toISOString() });
    const engine = TestBed.inject(SkyEngineService);
    TestBed.tick();
    engine.setMode('look');
    // A dense patch: aim at the busiest part of the sky right now (the most targets on screen).
    const viewport = { width: 390, height: 844, vFovDeg: 62 };
    const ori = TestBed.inject(OrientationService);
    const ctx = noopContext();
    let best = { az: 0, alt: 0, n: -1 };
    for (let az = 0; az < 360; az += 15) {
      for (const alt of [10, 30, 50]) {
        ori.setManualPose(az, alt);
        const n = engine
          .tickLook(0, viewport)!
          .items.filter((i) => i.projection.inFront && i.projection.onScreen).length;
        if (n > best.n) best = { az, alt, n };
      }
    }
    ori.setManualPose(best.az, best.alt);
    expect(best.n).toBeGreaterThanOrEqual(3);

    const times: number[] = [];
    for (let i = 0; i < 400; i++) {
      const t0 = performance.now();
      const frame = engine.tickLook(1000 + i * 16, viewport)!;
      drawLook(ctx, frame);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const median = times[200];
    const p90 = times[360];
    // Measured alone: median 0.2 ms, p99 1.1 ms (docs/phases/phase8-report.md). The budget is generous because
    // the whole suite runs in parallel on shared CI machines.
    expect(TARGETS).toHaveLength(22);
    expect(median).toBeLessThan(4);
    expect(p90).toBeLessThan(16);
  });
});
