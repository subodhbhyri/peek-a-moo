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
 * Heading of the device top edge (+y axis), but ONLY when the phone is close enough to flat (and screen-up)
 * for iOS's `webkitCompassHeading` to be unambiguous: there it is the top-edge heading. When the phone is
 * upright, which axis iOS reports is unverified (and reportedly changed in iOS 26), so we never sample then.
 * Returns null unless the top edge's horizontal component is >= 0.85 (within ~32° of flat).
 */
export function flatReferenceHeading(r: Mat3): number | null {
  const y = column(r, 1);
  if (Math.hypot(y[0], y[1]) < FLAT_MIN_HORIZONTAL) return null;
  // Screen must face up (device z has a positive Up component); face-down is not a pose we trust.
  if (column(r, 2)[2] <= 0) return null;
  return wrap360(Math.atan2(y[0], y[1]) / DEG);
}

const FLAT_MIN_HORIZONTAL = 0.85;
/** Accepted samples needed (in ms of sensor time) before the offset counts as calibrated. */
export const CALIBRATED_MIN_MS = 1000;
export const CALIBRATED_MAX_SPREAD = 0.05;
/** A calibration older than this is flagged, because gyro-referenced alpha drifts. */
export const STALE_AFTER_MS = 10 * 60_000;
/** Longest gap between two events that still counts as continuous sensor time. */
const MAX_SAMPLE_DT_MS = 250;

export type CompassCalibration = 'uncalibrated' | 'calibrating' | 'calibrated' | 'stale';

/**
 * Circular exponential moving average of the iOS "raw alpha -> magnetic north" offset.
 * iOS reports `alpha` relative to an arbitrary start heading, while `webkitCompassHeading` is absolute
 * (magnetic) but noisy. We fuse them: alpha gives smooth, fast rotation; the compass pins it to north.
 * offset() is the value to ADD to raw alpha so it becomes magnetic-north referenced.
 *
 * The compass is only sampled in the one pose where it is unambiguous: phone near-flat, portrait UI.
 * Everything else is ignored and the held offset keeps working because alpha is gyro-stable.
 */
export class HeadingOffsetCalibrator {
  private sumSin = 0;
  private sumCos = 0;
  private samples = 0;
  private acceptedMs = 0;
  private lastAcceptedAt: number | null = null;

  constructor(
    private readonly tauMs = 1500,
    private readonly now: () => number = () => performance.now(),
  ) {}

  update(
    rawAlpha: number,
    beta: number,
    gamma: number,
    compassHeadingDeg: number,
    dtMs: number,
    screenAngleDeg: number,
  ): number | null {
    if (!Number.isFinite(compassHeadingDeg) || compassHeadingDeg < 0) return this.offset();
    if (screenAngleDeg !== 0) return this.offset();
    const ref = flatReferenceHeading(rotationFromEuler(rawAlpha, beta, gamma));
    if (ref === null) return this.offset();

    const t = this.now();
    if (this.lastAcceptedAt !== null && t - this.lastAcceptedAt > STALE_AFTER_MS) {
      // The held offset is too old to trust (gyro drift): start over from this fresh measurement.
      this.sumSin = this.sumCos = this.samples = this.acceptedMs = 0;
    }
    // alpha += delta rotates the world view about Up and DEcreases every azimuth by delta.
    const delta = wrap180(ref - compassHeadingDeg) * DEG;
    const dt = Math.min(Math.max(dtMs, 1), MAX_SAMPLE_DT_MS);
    // Plain running mean while the history is short, EMA once it is longer than tau.
    const k = Math.max(1 - Math.exp(-dt / this.tauMs), 1 / (this.samples + 1));
    this.sumSin = this.sumSin * (1 - k) + Math.sin(delta) * k;
    this.sumCos = this.sumCos * (1 - k) + Math.cos(delta) * k;
    this.samples++;
    this.acceptedMs += dt;
    this.lastAcceptedAt = t;
    return this.offset();
  }

  offset(): number | null {
    return this.samples === 0 ? null : Math.atan2(this.sumSin, this.sumCos) / DEG;
  }

  /** 0 when recent samples agree; grows toward 1 when they don't (bad assumption or magnetic interference). */
  spread(): number {
    return this.samples === 0 ? 0 : 1 - Math.hypot(this.sumSin, this.sumCos);
  }

  state(): CompassCalibration {
    if (this.samples === 0 || this.lastAcceptedAt === null) return 'uncalibrated';
    if (this.acceptedMs < CALIBRATED_MIN_MS || this.spread() > CALIBRATED_MAX_SPREAD) {
      return 'calibrating';
    }
    return this.now() - this.lastAcceptedAt > STALE_AFTER_MS ? 'stale' : 'calibrated';
  }

  /** ms since the last accepted compass sample; null if there has been none. */
  lastSampleAgeMs(): number | null {
    return this.lastAcceptedAt === null ? null : this.now() - this.lastAcceptedAt;
  }

  reset(): void {
    this.sumSin = this.sumCos = this.samples = this.acceptedMs = 0;
    this.lastAcceptedAt = null;
  }
}
