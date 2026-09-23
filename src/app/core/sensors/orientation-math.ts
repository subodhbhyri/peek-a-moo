import {
  DEG,
  Mat3,
  Vec3,
  add,
  azAltFromDirection,
  column,
  cross,
  directionFromAzAlt,
  dot,
  mul3,
  normalize,
  scale,
  wrap180,
  wrap360,
} from '../math/vec3';

/**
 * Where the phone's camera is looking, in the ENU world frame.
 * `forward` points out of the BACK of the phone (the direction the user "looks through" the screen).
 * `up` / `right` are the on-screen up and right directions, already corrected for portrait/landscape.
 */
export interface CameraBasis {
  forward: Vec3;
  up: Vec3;
  right: Vec3;
}

/**
 * W3C DeviceOrientation rotation matrix: R = Rz(alpha) * Rx(beta) * Ry(gamma) (intrinsic Z-X'-Y'').
 * Columns of R are the device axes expressed in the earth frame.
 * Device axes: x = screen right, y = screen top, z = out of the screen toward the user.
 * The earth frame is ENU only when alpha is referenced to north.
 */
export function rotationFromEuler(alphaDeg: number, betaDeg: number, gammaDeg: number): Mat3 {
  const a = alphaDeg * DEG,
    b = betaDeg * DEG,
    g = gammaDeg * DEG;
  const ca = Math.cos(a),
    sa = Math.sin(a);
  const cb = Math.cos(b),
    sb = Math.sin(b);
  const cg = Math.cos(g),
    sg = Math.sin(g);
  const rz: Mat3 = [ca, -sa, 0, sa, ca, 0, 0, 0, 1];
  const rx: Mat3 = [1, 0, 0, 0, cb, -sb, 0, sb, cb];
  const ry: Mat3 = [cg, 0, sg, 0, 1, 0, -sg, 0, cg];
  return mul3(mul3(rz, rx), ry);
}

/**
 * Camera basis from a device rotation matrix and the screen orientation angle
 * (screen.orientation.angle: 0 = portrait, 90 = device turned counter-clockwise, 270 = clockwise).
 */
export function cameraBasisFromRotation(r: Mat3, screenAngleDeg: number): CameraBasis {
  const xD = column(r, 0);
  const yD = column(r, 1);
  const zD = column(r, 2);
  const t = screenAngleDeg * DEG;
  const c = Math.cos(t),
    s = Math.sin(t);
  return {
    forward: scale(zD, -1),
    up: normalize(add(scale(yD, c), scale(xD, s))),
    right: normalize(add(scale(xD, c), scale(yD, -s))),
  };
}

/** A synthetic camera basis looking at azimuth/altitude with no roll. Used for desktop drag mode and tests. */
export function cameraBasisFromAzAlt(azimuthDeg: number, altitudeDeg: number): CameraBasis {
  const forward = directionFromAzAlt(azimuthDeg, altitudeDeg);
  const az = azimuthDeg * DEG;
  const right: Vec3 = [Math.cos(az), -Math.sin(az), 0];
  return { forward, right, up: cross(right, forward) };
}

/** Human-readable pointing direction, for the debug overlay. */
export function describeBasis(b: CameraBasis): {
  azimuthDeg: number;
  altitudeDeg: number;
  rollDeg: number;
} {
  const { azimuthDeg, altitudeDeg } = azAltFromDirection(b.forward);
  const ideal = cameraBasisFromAzAlt(azimuthDeg, altitudeDeg);
  const rollDeg = Math.atan2(dot(b.up, ideal.right), dot(b.up, ideal.up)) / DEG;
  return { azimuthDeg, altitudeDeg, rollDeg };
}

/**
 * The heading iOS's `webkitCompassHeading` is assumed to report: the azimuth of whichever of
 * {device top edge (+y), back camera (-z)} is more horizontal. Flat phone -> top edge; upright phone -> camera.
 * Returns null when neither is horizontal enough to trust.
 *
 * ⚠️ VERIFY ON DEVICE: this is the one assumption in the sensor pipeline that can't be proven offline.
 * The debug overlay (?debug) shows the calibrator's offset and spread; a spread that stays near 0 while
 * you tilt between flat and upright means the assumption holds.
 */
export function referenceHeading(r: Mat3): { headingDeg: number; horizontal: number } | null {
  const y = column(r, 1);
  const back = scale(column(r, 2), -1);
  const hy = Math.hypot(y[0], y[1]);
  const hb = Math.hypot(back[0], back[1]);
  const v = hy >= hb ? y : back;
  const h = Math.max(hy, hb);
  if (h < 0.5) return null;
  return { headingDeg: wrap360(Math.atan2(v[0], v[1]) / DEG), horizontal: h };
}

/**
 * Circular exponential moving average of the iOS "raw alpha -> magnetic north" offset.
 * iOS reports `alpha` relative to an arbitrary start heading, while `webkitCompassHeading` is absolute
 * (magnetic) but noisy. We fuse them: alpha gives smooth, fast rotation; the compass slowly pins it to north.
 * offset() is the value to ADD to raw alpha so it becomes magnetic-north referenced.
 */
export class HeadingOffsetCalibrator {
  private sumSin = 0;
  private sumCos = 0;
  private samples = 0;

  constructor(private readonly tauMs = 1500) {}

  update(
    rawAlpha: number,
    beta: number,
    gamma: number,
    compassHeadingDeg: number,
    dtMs: number,
  ): number | null {
    if (!Number.isFinite(compassHeadingDeg) || compassHeadingDeg < 0) return this.offset();
    const ref = referenceHeading(rotationFromEuler(rawAlpha, beta, gamma));
    if (!ref) return this.offset();
    // alpha += delta rotates the world view about Up and DEcreases every azimuth by delta.
    const delta = wrap180(ref.headingDeg - compassHeadingDeg) * DEG;
    const k = this.samples === 0 ? 1 : 1 - Math.exp(-Math.max(dtMs, 1) / this.tauMs);
    this.sumSin = this.sumSin * (1 - k) + Math.sin(delta) * k;
    this.sumCos = this.sumCos * (1 - k) + Math.cos(delta) * k;
    this.samples++;
    return this.offset();
  }

  offset(): number | null {
    return this.samples === 0 ? null : Math.atan2(this.sumSin, this.sumCos) / DEG;
  }

  /** 0 when recent samples agree; grows toward 1 when they don't (bad assumption or magnetic interference). */
  spread(): number {
    return this.samples === 0 ? 0 : 1 - Math.hypot(this.sumSin, this.sumCos);
  }

  reset(): void {
    this.sumSin = this.sumCos = this.samples = 0;
  }
}
