import { DEG, directionFromAzAlt, wrap180 } from '../math/vec3';
import { CameraBasis, cameraBasisFromAzAlt } from '../sensors/orientation-math';
import { northCelestialPole, positionAngleToScreen, skyNorthScreenAngle } from './sky-orientation';

/** Roll the phone about its viewing axis: screen-up tilts toward screen-right by `deg`. */
function roll(b: CameraBasis, deg: number): CameraBasis {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  const mix = (a: CameraBasis['up'], b2: CameraBasis['up'], ca: number, cb: number) =>
    [0, 1, 2].map((i) => ca * a[i] + cb * b2[i]) as unknown as CameraBasis['up'];
  return { forward: b.forward, up: mix(b.up, b.right, c, s), right: mix(b.right, b.up, c, -s) };
}

const circDeg = (a: number, b: number) => Math.abs(wrap180((a - b) / DEG));

describe('northCelestialPole', () => {
  it('is due north at the observer latitude altitude', () => {
    const p = northCelestialPole(40);
    const e = directionFromAzAlt(0, 40);
    p.forEach((v, i) => expect(v).toBeCloseTo(e[i], 12));
  });
});

describe('skyNorthScreenAngle', () => {
  const ncp = northCelestialPole(40);
  const target = directionFromAzAlt(180, 30); // due south on the meridian
  const cam = cameraBasisFromAzAlt(180, 30); // upright phone facing it, no roll

  it('north is up on screen when facing south at the meridian', () => {
    expect(skyNorthScreenAngle(target, ncp, cam)).toBeCloseTo(Math.PI / 2, 9);
  });

  it('position angle 90 deg (east) is to the LEFT of north', () => {
    const north = skyNorthScreenAngle(target, ncp, cam);
    const east = positionAngleToScreen(north, 90);
    expect(east).toBeCloseTo(Math.PI, 9);
    // Independent check: facing south, screen-right points west (-x), so geographic east is screen-left.
    expect(cam.right[0]).toBeLessThan(0);
  });

  it('rolling the phone by +20 deg shifts north and east by the same +20 deg', () => {
    const rolled = roll(cam, 20);
    const north = skyNorthScreenAngle(target, ncp, rolled);
    expect(circDeg(north, Math.PI / 2 + 20 * DEG)).toBeLessThan(1e-9);
    expect(circDeg(positionAngleToScreen(north, 90), Math.PI + 20 * DEG)).toBeLessThan(1e-9);
  });

  it('target at the pole has a defined fallback (up), not NaN', () => {
    const a = skyNorthScreenAngle(ncp, ncp, cameraBasisFromAzAlt(0, 40));
    expect(a).toBe(Math.PI / 2);
  });

  it('away from the meridian the angle is finite and north stays in the upper half', () => {
    const t = directionFromAzAlt(90, 30);
    const a = skyNorthScreenAngle(t, ncp, cameraBasisFromAzAlt(90, 30));
    expect(Number.isFinite(a)).toBe(true);
    expect(Math.sin(a)).toBeGreaterThan(0);
  });
});
