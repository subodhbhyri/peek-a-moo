import type { SkyFrame } from '../engine/sky-engine.service';
import { FIXTURE_ELEMENTS } from '../gp/testing/gp-fixture';
import { getTarget } from '../targets/catalog';
import { computeTargetState } from '../targets/compute';
import { displayRadiusFor } from '../targets/display';
import { SATELLITE_CORE_PX, drawSatellite } from './draw-satellite';
import { drawTarget } from './draw-target';
import { recordingContext } from './testing/recording-context';

const POS = { latitude: 39.6, longitude: -104.7, heightM: 1800 };
const VP = { width: 400, height: 800, vFovDeg: 62 };

function frame(sunlit: boolean, trail: { x: number; y: number }[] | undefined): SkyFrame {
  const def = getTarget('iss')!;
  const target = computeTargetState(def, new Date('2026-10-28T20:00:00Z'), POS, FIXTURE_ELEMENTS);
  return {
    def,
    target: { ...target, satellite: { ...target.satellite!, sunlit } },
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
    radiusPx: SATELLITE_CORE_PX,
    brightLimbRad: null,
    skyNorthRad: 0,
    phase: 'searching',
    searchElapsedMs: 0,
    findCount: 0,
    lastFindDurationMs: null,
    ...(trail && { trail }),
  };
}
// Moving right and up on screen: the trail (older points) lies to the left and below.
const TRAIL = Array.from({ length: 12 }, (_, i) => ({
  x: 200 - 8 * (i + 1),
  y: 400 + 4 * (i + 1),
}));
/** The recording context rounds numbers to 9 decimals. */
const TAU = Number((Math.PI * 2).toFixed(9));
const count = (log: string[], prefix: string) => log.filter((l) => l.startsWith(prefix)).length;

describe('drawSatellite', () => {
  it('sunlit: a filled bright dot with a 6 px core, a glow, and the name', () => {
    const { ctx, log } = recordingContext();
    drawSatellite(ctx, frame(true, TRAIL));
    expect(log).toContain(`arc(200,400,${SATELLITE_CORE_PX},0,${TAU})`);
    expect(count(log, 'fill(')).toBeGreaterThanOrEqual(2); // glow + dot (+ arrow)
    expect(log.some((l) => l.startsWith('fillText("ISS"'))).toBe(true);
    expect(count(log, 'createRadialGradient(')).toBe(1);
  });

  it("in Earth's shadow: a dim hollow ring, no glow, and a dimmer name", () => {
    const lit = recordingContext();
    drawSatellite(lit.ctx, frame(true, TRAIL));
    const dark = recordingContext();
    drawSatellite(dark.ctx, frame(false, TRAIL));
    expect(count(dark.log, 'createRadialGradient(')).toBe(0);
    // The ring is stroked, the dot is not filled with the bright color.
    expect(dark.log).toContain(`arc(200,400,${SATELLITE_CORE_PX},0,${TAU})`);
    const ringIndex = dark.log.indexOf(`arc(200,400,${SATELLITE_CORE_PX},0,${TAU})`);
    expect(dark.log.slice(ringIndex, ringIndex + 4).some((l) => l.startsWith('stroke('))).toBe(
      true,
    );
    const alphas = (log: string[]) =>
      log.filter((l) => l.startsWith('fillStyle="rgba(244,241,230,')).map((l) => l);
    expect(alphas(dark.log).join()).not.toBe(alphas(lit.log).join());
  });

  it('draws one trail segment per point, each fainter than the one before', () => {
    const { ctx, log } = recordingContext();
    drawSatellite(ctx, frame(true, TRAIL));
    expect(count(log, 'lineTo(')).toBeGreaterThanOrEqual(12);
    expect(log).toContain('moveTo(200,400)'); // the first segment starts at the dot
    expect(log).toContain('lineTo(192,404)');
    const alphas = log
      .filter((l) => l.startsWith('strokeStyle="rgba(244,241,230,'))
      .map((l) => Number(/,([0-9.]+)\)"$/.exec(l)![1]));
    expect(alphas.length).toBeGreaterThanOrEqual(12);
    for (let i = 1; i < 12; i++) expect(alphas[i]).toBeLessThan(alphas[i - 1]);
  });

  it('points a small arrow along the direction of travel (away from the trail)', () => {
    const { ctx, log } = recordingContext();
    drawSatellite(ctx, frame(true, TRAIL));
    // Travel is along (+8, -4)/|..|: the arrow tip lies up and to the right of the dot.
    const tip = log.find(
      (l) => /^moveTo\((\d+\.\d+),(\d+\.\d+)\)$/.test(l) && l !== 'moveTo(200,400)',
    );
    expect(tip).toBeDefined();
    const [tx, ty] = /\(([\d.]+),([\d.]+)\)/.exec(tip!)!.slice(1).map(Number);
    expect(tx).toBeGreaterThan(200 + SATELLITE_CORE_PX);
    expect(ty).toBeLessThan(400);
  });

  it('copes with no trail, and with trail points behind the camera (NaN)', () => {
    const none = recordingContext();
    expect(() => drawSatellite(none.ctx, frame(true, undefined))).not.toThrow();
    const nan = recordingContext();
    expect(() => drawSatellite(nan.ctx, frame(true, [{ x: NaN, y: NaN }, ...TRAIL]))).not.toThrow();
    expect(nan.log.some((l) => l.includes('NaN') || l.includes('null'))).toBe(false);
  });

  it('is what drawTarget calls for render "satellite"', () => {
    const a = recordingContext();
    drawTarget(a.ctx, frame(true, TRAIL));
    const b = recordingContext();
    drawSatellite(b.ctx, frame(true, TRAIL));
    expect(a.log).toEqual(b.log);
  });

  it('display size is a fixed 6 px whatever the state', () => {
    const f = frame(true, TRAIL);
    expect(displayRadiusFor(f.target, VP)).toBe(6);
    expect(displayRadiusFor(f.target, { width: 1000, height: 1000, vFovDeg: 30 })).toBe(6);
  });
});
