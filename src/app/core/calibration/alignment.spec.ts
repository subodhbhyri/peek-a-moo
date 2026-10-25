import { Vec3, azAltFromDirection, directionFromAzAlt, dot, length, wrap180 } from '../math/vec3';
import {
  cameraBasisFromAzAlt,
  cameraBasisFromRotation,
  describeBasis,
  rotationFromEuler,
} from '../sensors/orientation-math';
import {
  ALIGNMENT_MAX_AGE_MS,
  StoredAlignment,
  applyYawCorrection,
  computeYawCorrection,
  distanceKm,
  isAlignmentValid,
} from './alignment';

const circ = (a: number, b: number) => Math.abs(wrap180(a - b));
// A rolled, tilted basis (not just az/alt) so roll preservation is actually exercised.
const rolled = (alpha: number, beta: number, gamma: number) =>
  cameraBasisFromRotation(rotationFromEuler(alpha, beta, gamma), 0);

describe('applyYawCorrection', () => {
  const bases = [
    cameraBasisFromAzAlt(0, 0),
    cameraBasisFromAzAlt(217, 33),
    rolled(30, 100, 20),
    rolled(300, 70, -25),
  ];

  it('positive yaw turns the phone clockwise: north + 90 = east (sign pinned by explicit vectors)', () => {
    const b = applyYawCorrection(cameraBasisFromAzAlt(0, 0), 90);
    expect(b.forward[0]).toBeCloseTo(1, 12);
    expect(b.forward[1]).toBeCloseTo(0, 12);
    expect(b.right[1]).toBeCloseTo(-1, 12); // right was east; after turning clockwise it is south
  });

  it('azimuth increases by yawDeg; altitude and roll unchanged; basis stays orthonormal', () => {
    for (const b of bases) {
      const d0 = describeBasis(b);
      for (const yaw of [0, 12, -12, 90, -90, 179, -179, 180, 359]) {
        const out = applyYawCorrection(b, yaw);
        const d1 = describeBasis(out);
        expect(circ(d1.azimuthDeg, d0.azimuthDeg + yaw)).toBeLessThan(1e-9);
        expect(Math.abs(d1.altitudeDeg - d0.altitudeDeg)).toBeLessThan(1e-9);
        expect(circ(d1.rollDeg, d0.rollDeg)).toBeLessThan(1e-9);
        for (const v of [out.forward, out.up, out.right]) expect(length(v)).toBeCloseTo(1, 12);
        expect(dot(out.forward, out.up)).toBeCloseTo(0, 12);
        expect(dot(out.forward, out.right)).toBeCloseTo(0, 12);
        expect(dot(out.up, out.right)).toBeCloseTo(0, 12);
      }
    }
  });

  it('matches the direction built independently from az/alt', () => {
    const out = applyYawCorrection(cameraBasisFromAzAlt(100, 40), 55);
    const expected = directionFromAzAlt(155, 40);
    out.forward.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 12));
  });
});

describe('computeYawCorrection', () => {
  const cases: [number, number][] = [
    [10, 22],
    [350, 10], // wraps forward
    [10, 350], // wraps backward
    [0, 179],
    [0, 181],
    [200, 20],
    [90, 90],
  ];

  it('applying the correction points at the target azimuth', () => {
    for (const [pAz, tAz] of cases) {
      const b = cameraBasisFromAzAlt(pAz, 15);
      const t: Vec3 = directionFromAzAlt(tAz, 40);
      const c = computeYawCorrection(b, t);
      expect(Math.abs(c)).toBeLessThanOrEqual(180);
      expect(circ(describeBasis(applyYawCorrection(b, c)).azimuthDeg, tAz)).toBeLessThan(1e-9);
      expect(circ(azAltFromDirection(t).azimuthDeg, tAz)).toBeLessThan(1e-9);
    }
  });

  it('is the shortest signed turn, wrap180', () => {
    expect(
      computeYawCorrection(cameraBasisFromAzAlt(350, 0), directionFromAzAlt(10, 30)),
    ).toBeCloseTo(20, 9);
    expect(
      computeYawCorrection(cameraBasisFromAzAlt(10, 0), directionFromAzAlt(350, 30)),
    ).toBeCloseTo(-20, 9);
    expect(
      Math.abs(computeYawCorrection(cameraBasisFromAzAlt(0, 0), directionFromAzAlt(180, 0))),
    ).toBeCloseTo(180, 9);
  });

  it('round-trips ±179°, ±90° and 0', () => {
    for (const yaw of [179, -179, 0, 90, -90]) {
      const b = rolled(40, 95, 10);
      const target = describeBasis(applyYawCorrection(b, yaw));
      const c = computeYawCorrection(b, directionFromAzAlt(target.azimuthDeg, target.altitudeDeg));
      expect(circ(c, yaw)).toBeLessThan(1e-9);
    }
  });
});

describe('isAlignmentValid', () => {
  const now = 1_000_000_000_000;
  const a: StoredAlignment = { yawDeg: 12, setAt: now, lat: 40, lon: -75, source: 'absolute' };

  it('valid when fresh, near, same source', () => {
    expect(isAlignmentValid(a, 40.1, -75.1, 'absolute', now + 60_000)).toBe(true);
  });
  it('invalid once 6 h old', () => {
    expect(isAlignmentValid(a, 40, -75, 'absolute', now + ALIGNMENT_MAX_AGE_MS - 1)).toBe(true);
    expect(isAlignmentValid(a, 40, -75, 'absolute', now + ALIGNMENT_MAX_AGE_MS)).toBe(false);
  });
  it('invalid when more than 50 km away', () => {
    expect(isAlignmentValid(a, 40.3, -75, 'absolute', now)).toBe(true); // ~33 km
    expect(isAlignmentValid(a, 40.6, -75, 'absolute', now)).toBe(false); // ~67 km
  });
  it('invalid for a different heading source', () => {
    expect(isAlignmentValid(a, 40, -75, 'ios-compass', now)).toBe(false);
  });
});

describe('distanceKm', () => {
  it('matches known distances', () => {
    expect(distanceKm(0, 0, 0, 1)).toBeCloseTo(111.19, 1);
    expect(distanceKm(51.5074, -0.1278, 48.8566, 2.3522)).toBeCloseTo(343.6, 0); // London-Paris
  });
});
