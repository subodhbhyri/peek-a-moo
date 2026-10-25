import { Mat3, Vec3, column, dot, wrap180, wrap360 } from '../math/vec3';
import {
  HeadingOffsetCalibrator,
  STALE_AFTER_MS,
  cameraBasisFromAzAlt,
  cameraBasisFromRotation,
  describeBasis,
  flatReferenceHeading,
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

describe('flatReferenceHeading', () => {
  it('returns the top-edge heading when the phone is flat', () => {
    expect(flatReferenceHeading(rotationFromEuler(0, 0, 0))).toBeCloseTo(0, 6);
    expect(flatReferenceHeading(rotationFromEuler(90, 0, 0))).toBeCloseTo(270, 6);
    expect(flatReferenceHeading(rotationFromEuler(200, 20, 5))).not.toBeNull();
  });

  it('returns null when upright, steeply tilted, or face down', () => {
    expect(flatReferenceHeading(rotationFromEuler(0, 90, 0))).toBeNull();
    expect(flatReferenceHeading(rotationFromEuler(0, 45, 0))).toBeNull();
    expect(flatReferenceHeading(rotationFromEuler(0, 180, 0))).toBeNull();
  });

  it('cuts off at a horizontal component of 0.85 (~32° from flat)', () => {
    expect(flatReferenceHeading(rotationFromEuler(0, 31, 0))).not.toBeNull();
    expect(flatReferenceHeading(rotationFromEuler(0, 33, 0))).toBeNull();
  });
});

/** Feeds `ms` of flat, portrait samples at 60 Hz into a calibrator, with a fake clock. */
function feedFlat(
  cal: HeadingOffsetCalibrator,
  clock: { t: number },
  ms: number,
  opts: { magAlpha: number; offset: number; noiseDeg?: number; screenAngle?: number },
  rnd: () => number = () => 0.5,
): void {
  const dt = 1000 / 60;
  for (let elapsed = 0; elapsed < ms; elapsed += dt) {
    clock.t += dt;
    const noise = (opts.noiseDeg ?? 0) * (rnd() * 2 - 1);
    const compass = wrap360(360 - opts.magAlpha + noise);
    cal.update(opts.magAlpha - opts.offset, 0, 0, compass, dt, opts.screenAngle ?? 0);
  }
}

function lcg(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a * 1664525 + 1013904223) % 4294967296;
    return a / 4294967296;
  };
}

describe('HeadingOffsetCalibrator (iOS relative alpha + compass)', () => {
  const make = () => {
    const clock = { t: 0 };
    return { clock, cal: new HeadingOffsetCalibrator(1500, () => clock.t) };
  };

  it('starts uncalibrated', () => {
    const { cal } = make();
    expect(cal.state()).toBe('uncalibrated');
    expect(cal.offset()).toBeNull();
    expect(cal.lastSampleAgeMs()).toBeNull();
  });

  it('recovers the unknown alpha offset from flat samples and goes calibrated after 1 s', () => {
    const { cal, clock } = make();
    feedFlat(cal, clock, 400, { magAlpha: 123, offset: 37 });
    expect(cal.state()).toBe('calibrating');
    feedFlat(cal, clock, 800, { magAlpha: 123, offset: 37 });
    expect(cal.state()).toBe('calibrated');
    expect(wrap180(cal.offset()! - 37)).toBeCloseTo(0, 6);
    expect(cal.spread()).toBeLessThan(1e-9);
  });

  it('ignores upright samples: the held offset does not change', () => {
    const { cal, clock } = make();
    feedFlat(cal, clock, 1200, { magAlpha: 50, offset: 37 });
    const before = cal.offset();
    const age = cal.lastSampleAgeMs();
    clock.t += 5000;
    // Upright, facing 120°, with a deliberately wrong compass value: must be ignored.
    cal.update(300, 90, 0, 10, 16, 0);
    cal.update(300, 100, 0, 200, 16, 0);
    expect(cal.offset()).toBe(before);
    expect(cal.lastSampleAgeMs()!).toBeCloseTo(age! + 5000, 6);
  });

  it('ignores landscape samples (screen angle 90 / 270)', () => {
    const { cal, clock } = make();
    feedFlat(cal, clock, 1200, { magAlpha: 50, offset: 37, screenAngle: 90 });
    expect(cal.state()).toBe('uncalibrated');
    feedFlat(cal, clock, 1200, { magAlpha: 50, offset: 37, screenAngle: 270 });
    expect(cal.state()).toBe('uncalibrated');
    expect(cal.offset()).toBeNull();
  });

  it('ignores invalid compass readings', () => {
    const { cal } = make();
    expect(cal.update(0, 0, 0, -1, 16, 0)).toBeNull();
    expect(cal.update(0, 0, 0, NaN, 16, 0)).toBeNull();
    expect(cal.state()).toBe('uncalibrated');
  });

  it('session with ±3° noise: calibrated, offset within 1°, then upright pointing stays within 1° of truth', () => {
    const { cal, clock } = make();
    const X = 81; // raw alpha = magnetic alpha - X
    feedFlat(cal, clock, 1200, { magAlpha: 200, offset: X, noiseDeg: 3 }, lcg(7));
    expect(cal.state()).toBe('calibrated');
    expect(Math.abs(wrap180(cal.offset()! - X))).toBeLessThan(1);

    // Raise the phone and turn to face azimuth 120° (magnetic alpha = 240). Compass is not consulted.
    const truthAz = 120;
    const magAlpha = 360 - truthAz;
    const raw = magAlpha - X;
    cal.update(raw, 90, 0, 999, 16, 0);
    for (const [beta, gamma] of [
      [90, 0],
      [110, 3],
      [70, -4],
    ] as const) {
      const off = cal.update(raw, beta, gamma, 17, 16, 0)!;
      const p = describeBasis(cameraBasisFromRotation(rotationFromEuler(raw + off, 90, 0), 0));
      expect(Math.abs(wrap180(p.azimuthDeg - truthAz))).toBeLessThan(1);
    }
    expect(cal.state()).toBe('calibrated');
  });

  it('handles true offsets near ±180° with ±3° noise, including the short-history period', () => {
    for (const X of [179, -179, 180, -180, 177, -177]) {
      const { cal, clock } = make();
      const rnd = lcg(Math.abs(X) + 11);
      const opts = { magAlpha: 123, offset: X, noiseDeg: 3 };
      // Short history (running-mean phase): never worse than the single-sample noise bound.
      for (let step = 0; step < 6; step++) {
        feedFlat(cal, clock, 50, opts, rnd);
        expect(Math.abs(wrap180(cal.offset()! - X)), `X=${X} step=${step}`).toBeLessThan(3.01);
      }
      feedFlat(cal, clock, 900, opts, rnd);
      expect(cal.state(), `X=${X}`).toBe('calibrated');
      expect(Math.abs(wrap180(cal.offset()! - X)), `X=${X}`).toBeLessThan(1);
      expect(cal.spread()).toBeLessThan(0.05);
    }
  });

  it('goes stale after 10 min without an accepted sample, and recalibrates from a fresh one', () => {
    const { cal, clock } = make();
    feedFlat(cal, clock, 1200, { magAlpha: 50, offset: 10 });
    expect(cal.state()).toBe('calibrated');
    clock.t += STALE_AFTER_MS - 1000;
    expect(cal.state()).toBe('calibrated');
    clock.t += 2000;
    expect(cal.state()).toBe('stale');
    // Fresh flat sample: the old offset is dropped, state restarts at calibrating, then calibrated.
    feedFlat(cal, clock, 100, { magAlpha: 50, offset: 25 });
    expect(cal.state()).toBe('calibrating');
    feedFlat(cal, clock, 1000, { magAlpha: 50, offset: 25 });
    expect(cal.state()).toBe('calibrated');
    expect(wrap180(cal.offset()! - 25)).toBeCloseTo(0, 6);
  });

  it('inconsistent compass samples keep it from calibrating (spread > 0.05)', () => {
    const { cal, clock } = make();
    const dt = 1000 / 60;
    for (let i = 0; i < 120; i++) {
      clock.t += dt;
      cal.update(0, 0, 0, i % 2 === 0 ? 0 : 120, dt, 0);
    }
    expect(cal.state()).toBe('calibrating');
  });
});
