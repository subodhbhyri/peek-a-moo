import { FIXTURE_ELEMENTS } from '../gp/testing/gp-fixture';
import type { SkyFrame } from '../engine/sky-engine.service';
import { DEG } from '../math/vec3';
import { displayRadiusPx } from '../projection/projection';
import { getTarget, TARGETS } from '../targets/catalog';
import { computeTargetState } from '../targets/compute';
import { MIN_PLANET_FRACTION, displayRadiusFor } from '../targets/display';
import type { TargetDef, TargetState } from '../targets/target.types';
import { drawPlanet } from './draw-planet';
import { drawTarget } from './draw-target';
import { drawMoonPhase } from './moon-phase';
import { recordingContext } from './testing/recording-context';

const POS = { latitude: 39.6, longitude: -104.7, heightM: 1800 };
const VP = { width: 400, height: 800, vFovDeg: 62 };
const DATE = new Date('2026-10-26T15:00:00Z');

function frameFor(def: TargetDef, over: Partial<TargetState> = {}): SkyFrame {
  const target: TargetState = { ...computeTargetState(def, DATE, POS, FIXTURE_ELEMENTS), ...over };
  return {
    def,
    target,
    viewport: VP,
    projection: {
      inFront: true,
      x: 200,
      y: 400,
      onScreen: true,
      centerDistance: 0,
      angularDistanceDeg: 0,
      edgeAngleRad: 0,
    },
    radiusPx: 30,
    brightLimbRad: 0.7,
    skyNorthRad: Math.PI / 2,
    phase: 'searching',
    searchElapsedMs: 0,
    findCount: 0,
    lastFindDurationMs: null,
  };
}

const count = (log: string[], prefix: string) => log.filter((l) => l.startsWith(prefix)).length;

describe('drawTarget dispatch', () => {
  it('draws every catalog target without throwing', () => {
    for (const def of TARGETS) {
      const { ctx, log } = recordingContext();
      expect(() => drawTarget(ctx, frameFor(def)), def.id).not.toThrow();
      expect(log.length, def.id).toBeGreaterThan(0);
    }
  });

  it('the Moon goes through drawMoonPhase with the same arguments as before', () => {
    const moon = getTarget('moon')!;
    const f = frameFor(moon);
    const a = recordingContext();
    drawTarget(a.ctx, f);
    const b = recordingContext();
    drawMoonPhase(
      b.ctx,
      f.projection.x,
      f.projection.y,
      f.radiusPx,
      f.target.phase!.illuminatedFraction,
      f.brightLimbRad!,
    );
    expect(a.log).toEqual(b.log);
  });

  it('styles without a renderer yet throw a clear error', () => {
    const star: TargetDef = { ...getTarget('moon')!, id: 'x', render: 'hologram' as never };
    expect(() => drawTarget(recordingContext().ctx, { ...frameFor(star), def: star })).toThrow(
      /not implemented/,
    );
  });
});

describe('drawPlanet', () => {
  it('Mars is a plain disc: no clip, no ellipses', () => {
    const { ctx, log } = recordingContext();
    drawPlanet(ctx, frameFor(getTarget('mars')!));
    expect(count(log, 'clip(')).toBe(0);
    expect(count(log, 'ellipse(')).toBe(0);
    expect(log).toContain('fillStyle="#d9744a"');
  });

  it('Jupiter has four bands clipped to the disc', () => {
    const { ctx, log } = recordingContext();
    drawPlanet(ctx, frameFor(getTarget('jupiter')!));
    expect(count(log, 'clip(')).toBe(1);
    expect(count(log, 'fillRect(')).toBe(4);
  });

  it('Venus draws a phase (a terminator ellipse) for a crescent, and no ellipse when full', () => {
    const venus = getTarget('venus')!;
    const crescent = recordingContext();
    drawPlanet(
      crescent.ctx,
      frameFor(venus, {
        phase: { kind: 'planet', illuminatedFraction: 0.3, phaseDeg: 60, name: 'crescent' },
      }),
    );
    expect(count(crescent.log, 'ellipse(')).toBe(1);
    const full = recordingContext();
    drawPlanet(
      full.ctx,
      frameFor(venus, {
        phase: { kind: 'planet', illuminatedFraction: 1, phaseDeg: 180, name: 'full' },
      }),
    );
    // Full: the terminator ellipse is as wide as the disc (gibbous branch, width r); crescent 0.3: width 0.4 r.
    expect(full.log.some((l) => l.startsWith('ellipse(0,0,30,30,'))).toBe(true);
    expect(crescent.log.some((l) => l.startsWith('ellipse(0,0,12,30,'))).toBe(true);
  });

  it('Saturn draws the back ring before the disc and the front ring after it', () => {
    const { ctx, log } = recordingContext();
    drawPlanet(ctx, frameFor(getTarget('saturn')!, { rings: { tiltDeg: 20 } }));
    const arcs = log
      .map((l, i) => [l, i] as const)
      .filter(([l]) => l.startsWith('arc(200,400,30,'));
    const discFill = arcs[0][1];
    const ellipseIdx = log.map((l, i) => [l, i] as const).filter(([l]) => l.startsWith('ellipse('));
    expect(ellipseIdx.length).toBe(4); // outer + inner for each half
    expect(ellipseIdx[0][1]).toBeLessThan(discFill); // back half first
    expect(ellipseIdx[3][1]).toBeGreaterThan(discFill); // front half last
  });

  it('ring minor/major ratio is max(sin|tilt|, 0.08)', () => {
    const ratio = (tilt: number) => {
      const { ctx, log } = recordingContext();
      drawPlanet(ctx, frameFor(getTarget('saturn')!, { rings: { tiltDeg: tilt } }));
      const args = log
        .find((l) => l.startsWith('ellipse('))!
        .slice(8, -1)
        .split(',')
        .map(Number);
      return args[3] / args[2]; // ry / rx of the outer ellipse
    };
    expect(ratio(20)).toBeCloseTo(Math.sin(20 * DEG), 6);
    expect(ratio(-20)).toBeCloseTo(Math.sin(20 * DEG), 6);
    expect(ratio(0)).toBeCloseTo(0.08, 9);
    expect(ratio(2)).toBeCloseTo(0.08, 9); // sin(2 deg) = 0.035 < 0.08
    expect(ratio(27)).toBeCloseTo(Math.sin(27 * DEG), 6);
  });

  it('rotates the rings to the east-west line plus a 6 degree twist, from sky north', () => {
    const rotation = (north: number) => {
      const { ctx, log } = recordingContext();
      drawPlanet(ctx, {
        ...frameFor(getTarget('saturn')!, { rings: { tiltDeg: 20 } }),
        skyNorthRad: north,
      });
      return Number(log.find((l) => l.startsWith('rotate('))!.slice(7, -1));
    };
    // North up: east-west is screen-horizontal; canvas rotation = -(pi/2 + pi/2 + 6 deg).
    expect(rotation(Math.PI / 2)).toBeCloseTo(-(Math.PI + 6 * DEG), 6);
    // Rolling the phone by +20 deg rotates north by +20 deg and the rings with it.
    expect(rotation(Math.PI / 2 + 20 * DEG) - rotation(Math.PI / 2)).toBeCloseTo(-20 * DEG, 6);
  });
});

describe('displayRadiusFor', () => {
  it('Moon and Sun use the v1 Moon formula with their own angular size', () => {
    for (const id of ['moon', 'sun']) {
      const s = computeTargetState(getTarget(id)!, DATE, POS);
      expect(displayRadiusFor(s, VP), id).toBe(displayRadiusPx(VP, s.angularSizeDeg));
    }
  });

  it('planets are at least 3.5% of the shorter side, and true size when larger', () => {
    const min = MIN_PLANET_FRACTION * 400;
    for (const id of ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']) {
      const s = computeTargetState(getTarget(id)!, DATE, POS);
      expect(displayRadiusFor(s, VP), id).toBe(min); // all are far below 14 px true size
    }
    const big: TargetState = {
      ...computeTargetState(getTarget('jupiter')!, DATE, POS),
      angularSizeDeg: 5,
    };
    const f = VP.height / 2 / Math.tan((VP.vFovDeg * DEG) / 2);
    expect(displayRadiusFor(big, VP)).toBeCloseTo(f * Math.tan(2.5 * DEG), 9);
    expect(displayRadiusFor(big, VP)).toBeGreaterThan(min);
  });
});
