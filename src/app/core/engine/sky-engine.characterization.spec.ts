import { TestBed } from '@angular/core/testing';
import { LocationService } from '../sensors/location.service';
import { OrientationService } from '../sensors/orientation.service';
import { Viewport } from '../projection/projection';
import { SkyEngineService } from './sky-engine.service';

/**
 * Characterization of v1 Moon behaviour, snapshotted from the pre-refactor code (Phase 2, Task 1).
 * These literals must not change. If one does, the code regressed: fix the code, not the expectation.
 */
const POS = { latitude: 39.6, longitude: -104.7, heightM: 1800 };
const VIEWPORT: Viewport = { width: 400, height: 800, vFovDeg: 62 };

interface Case {
  name: string;
  date: string;
  /** Fixed camera poses [azimuthDeg, altitudeDeg]. */
  centered: [number, number];
  right: [number, number];
  above: [number, number];
  far: [number, number];
}

const CASES: Case[] = [
  {
    name: 'waning crescent, up',
    date: '2026-11-06T12:30:00Z',
    centered: [115.5, 15.5],
    right: [105.5, 15.5],
    above: [115.5, 35.5],
    far: [265.5, 0],
  },
  {
    name: 'full, high',
    date: '2026-10-26T03:00:00Z',
    centered: [100.5, 37.5],
    right: [90.5, 37.5],
    above: [100.5, 57.5],
    far: [250.5, 0],
  },
  {
    name: 'full, below horizon',
    date: '2026-10-26T15:00:00Z',
    centered: [304, -9.5],
    right: [294, -9.5],
    above: [304, 10.5],
    far: [94, 0],
  },
];

// Adapter: the only lines that follow renames in the engine's public API.
const getTarget = (engine: SkyEngineService) => engine.target();
const recompute = (engine: SkyEngineService, date: Date) => engine.recompute(date);
const frameTarget = (frame: ReturnType<SkyEngineService['tick']> & object) => frame.target;

/** NaN / Infinity do not survive JSON, so pin them as strings. */
const safe = (v: number): number | string => (Number.isFinite(v) ? v : String(v));

function observe(c: Case) {
  TestBed.inject(LocationService).setManual(POS);
  const engine = TestBed.inject(SkyEngineService);
  const orientation = TestBed.inject(OrientationService);
  TestBed.tick();
  recompute(engine, new Date(c.date));
  const m = getTarget(engine)!;

  const state = {
    azimuthDeg: m.azimuthDeg,
    altitudeDeg: m.altitudeDeg,
    direction: [...m.direction],
    sunDirection: [...m.sunDirection!],
    phaseName: m.phase!.name,
    illuminatedFraction: m.phase!.illuminatedFraction,
    angularDiameterDeg: m.angularSizeDeg,
  };

  let t = 0;
  const frameAt = (pose: [number, number]) => {
    orientation.setManualPose(pose[0], pose[1]);
    t += 100;
    const f = engine.tick(t, VIEWPORT)!;
    return { f, t };
  };
  const frames: Record<string, unknown> = {};
  for (const key of ['centered', 'right', 'above', 'far'] as const) {
    const { f } = frameAt(c[key]);
    const p = f.projection;
    frames[key] = {
      inFront: p.inFront,
      x: safe(p.x),
      y: safe(p.y),
      onScreen: p.onScreen,
      centerDistance: safe(p.centerDistance),
      angularDistanceDeg: p.angularDistanceDeg,
      edgeAngleRad: p.edgeAngleRad,
      radiusPx: f.radiusPx,
      brightLimbRad: f.brightLimbRad,
      moonAz: frameTarget(f).azimuthDeg,
    };
  }
  return { state, frames, ...trackerRun(c) };
}

/** Scripted sequence on a fresh engine state: off-screen -> centered for 500 ms -> found. */
function trackerRun(c: Case) {
  const engine = TestBed.inject(SkyEngineService);
  const orientation = TestBed.inject(OrientationService);
  recompute(engine, new Date(c.date));
  const events: Record<string, unknown>[] = [];
  engine.events$.subscribe((e) =>
    events.push(
      e.type === 'found'
        ? { type: e.type, durationMs: e.durationMs, findIndex: e.findIndex }
        : { type: e.type },
    ),
  );
  const phases: string[] = [];
  const step = (pose: [number, number], times: number[]) => {
    orientation.setManualPose(pose[0], pose[1]);
    for (const time of times) {
      const f = engine.tick(time, VIEWPORT)!;
      phases.push(`${time}:${f.phase}:${Math.round(f.searchElapsedMs)}:${f.findCount}`);
    }
  };
  step(c.far, [10_000, 10_100, 10_200]);
  step(c.centered, [10_300, 10_500, 10_700, 10_800]);
  step(c.far, [10_900, 11_950, 12_000]);
  return { phases, events };
}

function expectClose(actual: unknown, expected: unknown, path: string): void {
  if (typeof expected === 'number') {
    expect(typeof actual, path).toBe('number');
    if (Number.isNaN(expected)) expect(Number.isNaN(actual as number), path).toBe(true);
    else expect(Math.abs((actual as number) - expected), path).toBeLessThan(1e-9);
  } else if (Array.isArray(expected)) {
    expect(Array.isArray(actual), path).toBe(true);
    expect((actual as unknown[]).length, path).toBe(expected.length);
    expected.forEach((v, i) => expectClose((actual as unknown[])[i], v, `${path}[${i}]`));
  } else if (expected && typeof expected === 'object') {
    expect(Object.keys(actual as object).sort(), path).toEqual(Object.keys(expected).sort());
    for (const k of Object.keys(expected)) {
      expectClose(
        (actual as Record<string, unknown>)[k],
        (expected as Record<string, unknown>)[k],
        `${path}.${k}`,
      );
    }
  } else {
    expect(actual, path).toEqual(expected);
  }
}

/** Snapshot of the pre-refactor code (Phase 2, Task 1). Do not edit these values. */
const EXPECTED: Record<string, unknown> = {
  'waning crescent, up': {
    state: {
      azimuthDeg: 115.52025033532345,
      altitudeDeg: 15.573567302761333,
      direction: [0.8693016182277231, -0.4150128068861165, 0.268475448909521],
      sunDirection: [0.9615430727373502, -0.1805015165636249, -0.20701237110145435],
      phaseName: 'waning-crescent',
      illuminatedFraction: 0.07851063899171012,
      angularDiameterDeg: 0.5143534065206583,
    },
    frames: {
      centered: {
        inFront: true,
        x: 200.22664789889743,
        y: 399.145220390335,
        onScreen: true,
        centerDistance: 0.004421587529309101,
        angularDistanceDeg: 0.07611046037232133,
        edgeAngleRad: 1.3116070715929031,
        radiusPx: 43.6902507469285,
        brightLimbRad: -2.0770638449281753,
        moonAz: 115.52025033532345,
      },
      right: {
        inFront: true,
        x: 313.18143201376023,
        y: 396.4813492918762,
        onScreen: true,
        centerDistance: 0.5661805687122089,
        angularDistanceDeg: 9.65349155687874,
        edgeAngleRad: 0.031078576319976854,
        radiusPx: 43.6902507469285,
        brightLimbRad: -2.024300376575125,
        moonAz: 115.52025033532345,
      },
      above: {
        inFront: true,
        x: 200.2410809891835,
        y: 641.331713445354,
        onScreen: true,
        centerDistance: 1.2066591693029332,
        angularDistanceDeg: 19.92644093172851,
        edgeAngleRad: -1.5697973660468525,
        radiusPx: 43.6902507469285,
        brightLimbRad: -2.1036353436040454,
        moonAz: 115.52025033532345,
      },
      far: {
        inFront: false,
        x: 'NaN',
        y: 'NaN',
        onScreen: false,
        centerDistance: 'Infinity',
        angularDistanceDeg: 146.51811890477686,
        edgeAngleRad: 2.633334140898033,
        radiusPx: 43.6902507469285,
        brightLimbRad: -1.2260775070328915,
        moonAz: 115.52025033532345,
      },
    },
    phases: [
      '10000:searching:9900:0',
      '10100:searching:10000:0',
      '10200:searching:10100:0',
      '10300:visible:10200:0',
      '10500:visible:10400:0',
      '10700:found:10600:1',
      '10800:found:10700:1',
      '10900:found:10800:1',
      '11950:searching:0:1',
      '12000:searching:50:1',
    ],
    events: [{ type: 'found', durationMs: 10600, findIndex: 1 }, { type: 'lost' }],
  },
  'full, high': {
    state: {
      azimuthDeg: 100.73402933303953,
      altitudeDeg: 37.61488134722745,
      direction: [0.7782707121314711, -0.14753456812198643, 0.6103509235246815],
      sunDirection: [-0.8106361238497317, 0.18605130702643935, -0.555206255245414],
      phaseName: 'full',
      illuminatedFraction: 0.998397382351076,
      angularDiameterDeg: 0.5452961372379681,
    },
    frames: {
      centered: {
        inFront: true,
        x: 202.15393673950857,
        y: 398.66252269394766,
        onScreen: true,
        centerDistance: 0.012677035361244567,
        angularDistanceDeg: 0.21821368308882785,
        edgeAngleRad: 0.5556783989323604,
        radiusPx: 46.3185908078583,
        brightLimbRad: 2.0139136216407323,
        moonAz: 100.73402933303953,
      },
      right: {
        inFront: true,
        x: 294.6369091610601,
        y: 393.4928104876855,
        onScreen: true,
        centerDistance: 0.474301805048956,
        angularDistanceDeg: 8.109746728817859,
        edgeAngleRad: 0.06865147548975598,
        radiusPx: 46.3185908078583,
        brightLimbRad: 2.116371915746581,
        moonAz: 100.73402933303953,
      },
      above: {
        inFront: true,
        x: 202.29049667519183,
        y: 640.7857252975035,
        onScreen: true,
        centerDistance: 1.2039830966635692,
        angularDistanceDeg: 19.885716710317592,
        edgeAngleRad: -1.5612840204173806,
        radiusPx: 46.3185908078583,
        brightLimbRad: 2.0384086061102473,
        moonAz: 100.73402933303953,
      },
      far: {
        inFront: false,
        x: 'NaN',
        y: 'NaN',
        onScreen: false,
        centerDistance: 'Infinity',
        angularDistanceDeg: 133.18704111151192,
        edgeAngleRad: 2.1496280463392674,
        radiusPx: 46.3185908078583,
        brightLimbRad: 0.8367142671199188,
        moonAz: 100.73402933303953,
      },
    },
    phases: [
      '10000:searching:9900:0',
      '10100:searching:10000:0',
      '10200:searching:10100:0',
      '10300:visible:10200:0',
      '10500:visible:10400:0',
      '10700:found:10600:1',
      '10800:found:10700:1',
      '10900:found:10800:1',
      '11950:searching:0:1',
      '12000:searching:50:1',
    ],
    events: [{ type: 'found', durationMs: 10600, findIndex: 1 }, { type: 'lost' }],
  },
  'full, below horizon': {
    state: {
      azimuthDeg: 304.1045795658963,
      altitudeDeg: -9.358839190910189,
      direction: [-0.8169940042586947, 0.553241765788191, -0.16261717496288178],
      sunDirection: [0.8059216494207744, -0.5183992393181089, 0.2859239823262548],
      phaseName: 'full',
      illuminatedFraction: 0.9955049348759044,
      angularDiameterDeg: 0.5402759138799319,
    },
    frames: {
      centered: {
        inFront: true,
        x: 201.1989266820472,
        y: 398.36004656051745,
        onScreen: true,
        centerDistance: 0.010157352598727847,
        angularDistanceDeg: 0.17484191647186004,
        edgeAngleRad: 0.9395185489073276,
        radiusPx: 45.89216256895174,
        brightLimbRad: 1.3931590105495988,
        moonAz: 304.1045795658963,
      },
      right: {
        inFront: true,
        x: 317.0079678602123,
        y: 400.0420641017337,
        onScreen: true,
        centerDistance: 0.5850398771059356,
        angularDistanceDeg: 9.968697180016607,
        edgeAngleRad: -0.000359497739263608,
        radiusPx: 45.89216256895174,
        brightLimbRad: 1.3675139047107592,
        moonAz: 304.1045795658963,
      },
      above: {
        inFront: true,
        x: 201.2747281719475,
        y: 640.4437357812335,
        onScreen: true,
        centerDistance: 1.2022355739241373,
        angularDistanceDeg: 19.859111764614497,
        edgeAngleRad: -1.5654948111398888,
        radiusPx: 45.89216256895174,
        brightLimbRad: 1.3822065219021349,
        moonAz: 304.1045795658963,
      },
      far: {
        inFront: false,
        x: 'NaN',
        y: 'NaN',
        onScreen: false,
        centerDistance: 'Infinity',
        angularDistanceDeg: 148.60497601669482,
        edgeAngleRad: -2.8241229161171177,
        radiusPx: 45.89216256895174,
        brightLimbRad: 1.8061571528377005,
        moonAz: 304.1045795658963,
      },
    },
    phases: [
      '10000:searching:9900:0',
      '10100:searching:10000:0',
      '10200:searching:10100:0',
      '10300:visible:10200:0',
      '10500:visible:10400:0',
      '10700:found:10600:1',
      '10800:found:10700:1',
      '10900:found:10800:1',
      '11950:searching:0:1',
      '12000:searching:50:1',
    ],
    events: [{ type: 'found', durationMs: 10600, findIndex: 1 }, { type: 'lost' }],
  },
};

describe('SkyEngine characterization (v1 Moon behaviour)', () => {
  // Start every test from a clean slate: a remembered Look Around mode (ptm.mode) or ?mode=look left behind
  // by another spec in the same worker would start the engine paused and nothing would ever be found.
  beforeEach(() => {
    localStorage.clear();
    history.replaceState(null, '', '/');
  });

  for (const c of CASES) {
    it(c.name, () => {
      const got = observe(c);
      expectClose(got, EXPECTED[c.name], c.name);
    });
  }

  it('covers the three required situations', () => {
    expect(CASES).toHaveLength(3);
  });
});
