import { Mat3, Vec3, azAltFromDirection, column, dot, wrap180 } from '../math/vec3';
import {
  HeadingOffsetCalibrator,
  cameraBasisFromAzAlt,
  cameraBasisFromRotation,
  describeBasis,
  referenceHeading,
  rotationFromEuler,
} from './orientation-math';

const near = (a: Vec3, b: Vec3, eps = 1e-9) => a.every((v, i) => Math.abs(v - b[i]) < eps);
const pointing = (alpha: number, beta: number, gamma: number, screen = 0) =>
  describeBasis(cameraBasisFromRotation(rotationFromEuler(alpha, beta, gamma), screen));

describe('rotationFromEuler (W3C intrinsic Z-X-Y)', () => {
  it('flat phone, alpha 0: top edge points north, screen faces up', () => {
    const r = rotationFromEuler(0, 0, 0);
    expect(near(column(r, 1), [0, 1, 0])).toBe(true);
    expect(near(column(r, 2), [0, 0, 1])).toBe(true);
  });

  it('is orthonormal for arbitrary angles', () => {
    const r = rotationFromEuler(123, -47, 31);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(dot(column(r, i), column(r, j))).toBeCloseTo(i === j ? 1 : 0, 12);
      }
    }
  });
});

describe('camera pointing', () => {
  it('upright portrait facing north looks at the horizon due north', () => {
    const p = pointing(0, 90, 0);
    expect(p.azimuthDeg).toBeCloseTo(0, 6);
    expect(p.altitudeDeg).toBeCloseTo(0, 6);
    expect(p.rollDeg).toBeCloseTo(0, 6);
  });

  it('alpha is counter-clockwise: alpha 90 faces west', () => {
    expect(pointing(90, 90, 0).azimuthDeg).toBeCloseTo(270, 6);
    expect(pointing(270, 90, 0).azimuthDeg).toBeCloseTo(90, 6);
  });

  it('tilting the top back (beta > 90) looks up; forward (beta < 90) looks down', () => {
    expect(pointing(0, 135, 0).altitudeDeg).toBeCloseTo(45, 6);
    expect(pointing(0, 45, 0).altitudeDeg).toBeCloseTo(-45, 6);
  });

  it('near-vertical pointing (straight up) stays well-defined', () => {
    const p = pointing(10, 179.9, 0);
    expect(p.altitudeDeg).toBeGreaterThan(89);
  });

  it('landscape (screen angle 90): screen-up is the device +x axis', () => {
    // Device turned counter-clockwise while facing north: +x points up, back camera north, +y west.
    const r: Mat3 = [0, -1, 0, 0, 0, -1, 1, 0, 0]; // columns: x=(0,0,1), y=(-1,0,0), z=(0,-1,0)
    const b = cameraBasisFromRotation(r, 90);
    expect(near(b.forward, [0, 1, 0])).toBe(true);
    expect(near(b.up, [0, 0, 1])).toBe(true);
    expect(near(b.right, [1, 0, 0])).toBe(true);
  });

  it('cameraBasisFromAzAlt round-trips through describeBasis', () => {
    const d = describeBasis(cameraBasisFromAzAlt(217, 33));
    expect(d.azimuthDeg).toBeCloseTo(217, 9);
    expect(d.altitudeDeg).toBeCloseTo(33, 9);
    expect(d.rollDeg).toBeCloseTo(0, 9);
  });

  it('cameraBasisFromAzAlt is right-handed with right = east when facing north', () => {
    const b = cameraBasisFromAzAlt(0, 0);
    expect(near(b.right, [1, 0, 0])).toBe(true);
    expect(near(b.up, [0, 0, 1])).toBe(true);
  });
});

describe('referenceHeading', () => {
  it('uses the top edge when flat and the back camera when upright', () => {
    expect(referenceHeading(rotationFromEuler(0, 0, 0))!.headingDeg).toBeCloseTo(0, 6);
    expect(referenceHeading(rotationFromEuler(0, 90, 0))!.headingDeg).toBeCloseTo(0, 6);
    expect(referenceHeading(rotationFromEuler(90, 0, 0))!.headingDeg).toBeCloseTo(270, 6);
  });
});

describe('HeadingOffsetCalibrator (iOS relative alpha + compass)', () => {
  it('recovers the unknown alpha offset from compass headings across flat and upright poses', () => {
    const trueOffset = 37; // iOS alpha started 37° away from north
    const cal = new HeadingOffsetCalibrator(200);
    const poses: [number, number, number][] = [
      [10, 5, 0],
      [200, 90, 0],
      [300, 60, 10],
      [45, 110, -5],
    ];
    for (let i = 0; i < 50; i++) {
      for (const [absAlpha, beta, gamma] of poses) {
        const compass = referenceHeading(rotationFromEuler(absAlpha, beta, gamma))!.headingDeg;
        cal.update(absAlpha - trueOffset, beta, gamma, compass, 16);
      }
    }
    expect(wrap180(cal.offset()! - trueOffset)).toBeCloseTo(0, 6);
    expect(cal.spread()).toBeLessThan(1e-6);
  });

  it('ignores invalid compass readings', () => {
    const cal = new HeadingOffsetCalibrator();
    expect(cal.update(0, 90, 0, -1, 16)).toBeNull();
    expect(cal.update(0, 90, 0, NaN, 16)).toBeNull();
  });

  it('end to end: corrected alpha points the camera at the right true azimuth', () => {
    // Phone upright facing azimuth 120°, raw iOS alpha arbitrary.
    const absAlpha = 360 - 120;
    const raw = absAlpha - 81;
    const cal = new HeadingOffsetCalibrator();
    const compass = referenceHeading(rotationFromEuler(absAlpha, 90, 0))!.headingDeg;
    const off = cal.update(raw, 90, 0, compass, 16)!;
    const { azimuthDeg } = azAltFromDirection(
      cameraBasisFromRotation(rotationFromEuler(raw + off, 90, 0), 0).forward,
    );
    expect(azimuthDeg).toBeCloseTo(120, 6);
  });
});
