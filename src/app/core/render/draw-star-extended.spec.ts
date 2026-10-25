import type { SkyFrame } from '../engine/sky-engine.service';
import { DEG, directionFromAzAlt, wrap180 } from '../math/vec3';
import {
  northCelestialPole,
  positionAngleToScreen,
  skyNorthScreenAngle,
} from '../projection/sky-orientation';
import { CameraBasis, cameraBasisFromAzAlt } from '../sensors/orientation-math';
import { getTarget } from '../targets/catalog';
import { computeTargetState } from '../targets/compute';
import { centeredThreshold, displayRadiusFor } from '../targets/display';
import type { TargetState } from '../targets/target.types';
import {
  MARKER_LABEL,
  drawExtended,
  majorAxisScreenAngle,
  seededRandom,
  washoutScale,
} from './draw-extended';
import {
  bvToColor,
  drawStar,
  starBrightness,
  starCoreRadiusPx,
  starGlowRadiusPx,
  twinkleFactor,
} from './draw-star';
import { recordingContext } from './testing/recording-context';

const POS = { latitude: 39.6, longitude: -104.7, heightM: 1800 };
const VP = { width: 400, height: 800, vFovDeg: 62 };
const DATE = new Date('2026-10-25T09:54:00Z');

function roll(b: CameraBasis, deg: number): CameraBasis {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  const mix = (a: CameraBasis['up'], b2: CameraBasis['up'], ca: number, cb: number) =>
    [0, 1, 2].map((i) => ca * a[i] + cb * b2[i]) as unknown as CameraBasis['up'];
  return { forward: b.forward, up: mix(b.up, b.right, c, s), right: mix(b.right, b.up, c, -s) };
}

function frameFor(id: string, skyNorthRad = Math.PI / 2, radiusPx?: number): SkyFrame {
  const def = getTarget(id)!;
  const target: TargetState = computeTargetState(def, DATE, POS);
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
    radiusPx: radiusPx ?? displayRadiusFor(target, VP),
    brightLimbRad: null,
    skyNorthRad,
    phase: 'searching',
    searchElapsedMs: 0,
    findCount: 0,
    lastFindDurationMs: null,
  };
}

describe('star brightness and size', () => {
  it('follows 10^(-0.4 (mag - 1)), clamped to 0.15..4', () => {
    expect(starBrightness(1)).toBeCloseTo(1, 12);
    expect(starBrightness(2.5)).toBeCloseTo(Math.pow(10, -0.6), 12);
    expect(starBrightness(-1.46)).toBe(4); // Sirius clamps
    expect(starBrightness(6)).toBe(0.15); // faint end clamps (10^-2 < 0.15)
  });

  it('core is 2.5 + 2 sqrt(brightness) px and glow is 6x the core', () => {
    expect(starCoreRadiusPx(1)).toBeCloseTo(4.5, 12);
    expect(starCoreRadiusPx(-1.46)).toBeCloseTo(6.5, 12);
    expect(starGlowRadiusPx(1)).toBeCloseTo(27, 12);
  });

  it('brighter stars draw bigger', () => {
    expect(starCoreRadiusPx(-1.46)).toBeGreaterThan(starCoreRadiusPx(1.98));
  });
});

describe('bvToColor', () => {
  it('hits the table colors exactly at the nodes', () => {
    expect(bvToColor(-0.3)).toBe('#9bb0ff');
    expect(bvToColor(0.0)).toBe('#cad7ff');
    expect(bvToColor(0.6)).toBe('#fff4ea');
    expect(bvToColor(1.2)).toBe('#ffd2a1');
    expect(bvToColor(1.85)).toBe('#ffb36b');
  });

  it('clamps beyond the table and lerps between nodes', () => {
    expect(bvToColor(-1)).toBe('#9bb0ff');
    expect(bvToColor(3)).toBe('#ffb36b');
    // Halfway between 0.0 (#cad7ff) and 0.6 (#fff4ea): channels 228.5, 229.5, 244.5 round to e5, e6, f5.
    expect(bvToColor(0.3)).toBe('#e5e6f5');
  });
});

describe('drawStar', () => {
  it('twinkles by at most +-8% at 1.5 Hz, and not at all with reduced motion', () => {
    expect(twinkleFactor(0, false)).toBeCloseTo(1, 12);
    expect(twinkleFactor(1000 / 6, false)).toBeCloseTo(1.08, 9); // quarter period: sin = 1
    expect(twinkleFactor(1000 / 3, false)).toBeCloseTo(1, 9); // half a period
    for (let t = 0; t < 2000; t += 37) {
      expect(Math.abs(twinkleFactor(t, false) - 1)).toBeLessThanOrEqual(0.08 + 1e-12);
      expect(twinkleFactor(t, true)).toBe(1);
    }
  });

  it('draws a glow and a core of the right size and colour', () => {
    const { ctx, log } = recordingContext();
    drawStar(ctx, frameFor('sirius'), { timeMs: 0, reducedMotion: true });
    const core = starCoreRadiusPx(-1.46);
    expect(log.some((l) => l.startsWith(`arc(200,400,${core},0,`))).toBe(true);
    expect(log).toContain('fillStyle="#cad7ff"'); // B-V 0.0
    expect(
      log.some((l) =>
        l.startsWith(`createRadialGradient(200,400,${Number((core * 0.9).toFixed(9))},`),
      ),
    ).toBe(true);
  });

  it('is steady with reduced motion: same draw calls at any time', () => {
    const a = recordingContext();
    drawStar(a.ctx, frameFor('vega'), { timeMs: 0, reducedMotion: true });
    const b = recordingContext();
    drawStar(b.ctx, frameFor('vega'), { timeMs: 123, reducedMotion: true });
    expect(a.log).toEqual(b.log);
  });
});

describe('drawExtended: orientation', () => {
  /** Canvas rotation recorded for the major axis. */
  const rotation = (f: SkyFrame) => {
    const { ctx, log } = recordingContext();
    drawExtended(ctx, f);
    const rotations = log.filter((l) => l.startsWith('rotate('));
    expect(rotations).toHaveLength(1);
    return Number(rotations[0].slice(7, -1));
  };

  it('rotates M31 by the negative of positionAngleToScreen(skyNorth, 35 deg) for several phone rolls', () => {
    const m31 = frameFor('m31');
    const cam0 = cameraBasisFromAzAlt(m31.target.azimuthDeg, m31.target.altitudeDeg);
    const ncp = northCelestialPole(POS.latitude);
    let previous: number | null = null;
    for (const r of [0, 20, -45, 130]) {
      const north = skyNorthScreenAngle(m31.target.direction, ncp, roll(cam0, r));
      const frame = { ...m31, skyNorthRad: north };
      expect(frame.def.fixed!.positionAngleDeg).toBe(35);
      const expected = -positionAngleToScreen(north, 35);
      expect(rotation(frame)).toBeCloseTo(expected, 9);
      expect(majorAxisScreenAngle(frame)).toBeCloseTo(north + 35 * DEG, 12);
      if (previous !== null) void previous;
      previous = expected;
    }
  });

  it('a +20 deg phone roll turns the drawn major axis by +20 deg on screen', () => {
    const m31 = frameFor('m31');
    const cam0 = cameraBasisFromAzAlt(m31.target.azimuthDeg, m31.target.altitudeDeg);
    const ncp = northCelestialPole(POS.latitude);
    const axis = (r: number) =>
      -rotation({
        ...m31,
        skyNorthRad: skyNorthScreenAngle(m31.target.direction, ncp, roll(cam0, r)),
      });
    expect(Math.abs(wrap180((axis(20) - axis(0)) / DEG - 20))).toBeLessThan(1e-6);
  });

  it('position angle is measured from north through east, i.e. counterclockwise on screen', () => {
    // Facing due south at the meridian (north up): PA 90 is a horizontal axis, PA 0 is vertical.
    const north = skyNorthScreenAngle(
      directionFromAzAlt(180, 30),
      northCelestialPole(40),
      cameraBasisFromAzAlt(180, 30),
    );
    expect(positionAngleToScreen(north, 0)).toBeCloseTo(Math.PI / 2, 9);
    expect(positionAngleToScreen(north, 90)).toBeCloseTo(Math.PI, 9);
  });

  it('draws the ellipse squashed by minor/major', () => {
    const { ctx, log } = recordingContext();
    drawExtended(ctx, frameFor('m31'));
    expect(log).toContain(`scale(1,${Number((1 / 3.17).toFixed(9))})`);
    const lmc = recordingContext();
    drawExtended(lmc.ctx, frameFor('lmc'));
    expect(lmc.log).toContain(`scale(1,${Number((9.17 / 10.75).toFixed(9))})`);
  });
});

describe('drawExtended: styles', () => {
  it('galaxy: a faint halo (alpha <= 0.35) plus a compact core', () => {
    const { ctx, log } = recordingContext();
    drawExtended(ctx, frameFor('m31'));
    expect(count(log, 'createRadialGradient(')).toBe(2);
    expect(count(log, 'clip(')).toBe(0);
  });

  it('nebula: 3 to 5 seeded blobs, identical every frame', () => {
    const a = recordingContext();
    drawExtended(a.ctx, frameFor('m42'));
    const b = recordingContext();
    drawExtended(b.ctx, frameFor('m42'));
    expect(a.log).toEqual(b.log);
    const blobs = count(a.log, 'createRadialGradient(');
    expect(blobs).toBeGreaterThanOrEqual(3);
    expect(blobs).toBeLessThanOrEqual(5);
  });

  it('cluster: haze plus 7 to 10 seeded dots', () => {
    const { ctx, log } = recordingContext();
    drawExtended(ctx, frameFor('m45'));
    const dots = log.filter((l) => /^arc\([-\d.e]+,[-\d.e]+,[\d.]+,0,/.test(l)).length - 1; // minus the haze arc
    expect(dots).toBeGreaterThanOrEqual(7);
    expect(dots).toBeLessThanOrEqual(10);
  });

  it('marker: dashed circle, crosshair and the label; no gradients (no glow)', () => {
    const { ctx, log } = recordingContext();
    drawExtended(ctx, frameFor('galactic-center'));
    expect(log).toContain('setLineDash([5,4])');
    expect(count(log, 'createRadialGradient(')).toBe(0);
    expect(count(log, 'lineTo(')).toBe(2);
    expect(log.some((l) => l.startsWith(`fillText("${MARKER_LABEL}"`))).toBe(true);
  });

  it('washoutScale leaves normal sizes alone and keeps huge ones from flooding the screen', () => {
    expect(washoutScale(60, 400)).toBe(1);
    expect(washoutScale(240, 400)).toBe(1);
    expect(washoutScale(480, 400)).toBeCloseTo(0.5, 12);
    expect(washoutScale(2400, 400)).toBeCloseTo(0.1, 12);
  });

  it('seededRandom is deterministic per id and differs between ids', () => {
    const a = seededRandom('m42');
    const b = seededRandom('m42');
    const c = seededRandom('m45');
    const sa = [a(), a(), a()];
    expect(sa).toEqual([b(), b(), b()]);
    expect(sa).not.toEqual([c(), c(), c()]);
  });
});

const count = (log: string[], prefix: string) => log.filter((l) => l.startsWith(prefix)).length;

describe('display sizing for fixed targets', () => {
  const state = (id: string) => computeTargetState(getTarget(id)!, DATE, POS);
  const f = VP.height / 2 / Math.tan((VP.vFovDeg * DEG) / 2);

  it('extended objects use their true semi-major axis, floored at the planet minimum', () => {
    const min = 0.035 * 400;
    expect(displayRadiusFor(state('m31'), VP)).toBeCloseTo(
      Math.max(min, f * Math.tan(1.585 * DEG)),
      9,
    );
    expect(displayRadiusFor(state('lmc'), VP)).toBeCloseTo(f * Math.tan(5.375 * DEG), 9);
    expect(displayRadiusFor(state('lmc'), VP)).toBeGreaterThan(displayRadiusFor(state('m42'), VP));
    expect(displayRadiusFor(state('galactic-center'), VP)).toBeGreaterThanOrEqual(min);
  });

  it('stars use their glow radius', () => {
    expect(displayRadiusFor(state('sirius'), VP)).toBeCloseTo(starGlowRadiusPx(-1.46), 12);
  });
});

describe('centeredThreshold', () => {
  it('is exactly 0.35 for the Moon, Sun, every planet and every star at today sizes', () => {
    for (const id of [
      'moon',
      'sun',
      'mercury',
      'venus',
      'mars',
      'jupiter',
      'saturn',
      'uranus',
      'neptune',
      'polaris',
      'sirius',
      'betelgeuse',
      'vega',
      'arcturus',
    ]) {
      const s = computeTargetState(getTarget(id)!, DATE, POS);
      expect(centeredThreshold(displayRadiusFor(s, VP), VP), id).toBe(0.35);
    }
    // And for the Moon at the exact v1 radius used in the Phase 2 characterization run.
    expect(centeredThreshold(43.6902507469285, VP)).toBe(0.35);
  });

  it('loosens for big objects and caps at 0.8', () => {
    // half = 200: 0.8 * r / 200 > 0.35 once r > 87.5 px
    expect(centeredThreshold(87.5, VP)).toBe(0.35);
    expect(centeredThreshold(100, VP)).toBeCloseTo(0.4, 12);
    expect(centeredThreshold(150, VP)).toBeCloseTo(0.6, 12);
    expect(centeredThreshold(5000, VP)).toBe(0.8);
  });

  it('a narrow field of view makes M31 and the LMC loose', () => {
    const narrow = { ...VP, vFovDeg: 10 };
    for (const id of ['m31', 'lmc']) {
      const s = computeTargetState(getTarget(id)!, DATE, POS);
      expect(centeredThreshold(displayRadiusFor(s, narrow), narrow), id).toBeGreaterThan(0.35);
    }
  });
});
