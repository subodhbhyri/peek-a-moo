import { Refraction, RotationMatrix } from 'astronomy-engine';
import type { GeoPosition } from '../astro/ephemeris';
import { RAD } from '../math/vec3';
import type { Viewport } from '../projection/projection';
import { focalLengthPx } from '../projection/projection';
import type { CameraBasis } from '../sensors/orientation-math';
import { horizonRotation } from './horizon-rotation';
import type { SkyGeometry } from './sky-geometry';

/**
 * Rotates EQJ unit vectors (x, y, z triples in `src`) into our ENU frame, with refraction, into `dst`.
 *
 * astronomy-engine's horizontal vector has x = North, y = West, z = Up. That is not assumed here: the
 * mapping East = -y, North = x, Up = z is the one signed axis permutation that reproduces the Phase 4
 * fixed-sky provider for the five catalog stars (sky-field.spec.ts searches all 48 and requires exactly
 * this one). Its rotation convention is RotateVector's: out[j] = sum_i rot[i][j] * v[i].
 *
 * Refraction is added to the altitude exactly as HorizonFromVector(v, 'normal') does, by re-scaling the
 * horizontal part of the vector, so the direction matches the fixed-sky provider's.
 */
export function rotateToEnu(
  rotation: RotationMatrix,
  src: Float64Array,
  dst: Float64Array,
  count: number,
): void {
  const r = rotation.rot;
  const r00 = r[0][0],
    r10 = r[1][0],
    r20 = r[2][0];
  const r01 = r[0][1],
    r11 = r[1][1],
    r21 = r[2][1];
  const r02 = r[0][2],
    r12 = r[1][2],
    r22 = r[2][2];
  for (let i = 0, k = 0; i < count; i++, k += 3) {
    const x = src[k],
      y = src[k + 1],
      z = src[k + 2];
    const north = r00 * x + r10 * y + r20 * z;
    const west = r01 * x + r11 * y + r21 * z;
    const up = r02 * x + r12 * y + r22 * z;
    const east = -west;
    const horizontal = Math.hypot(east, north);
    const altDeg = Math.atan2(up, horizontal) * RAD;
    const refr = Refraction('normal', altDeg);
    if (refr === 0 || horizontal < 1e-12) {
      dst[k] = east;
      dst[k + 1] = north;
      dst[k + 2] = up;
    } else {
      const alt = (altDeg + refr) / RAD;
      const s = Math.cos(alt) / horizontal;
      dst[k] = east * s;
      dst[k + 1] = north * s;
      dst[k + 2] = Math.sin(alt);
    }
  }
}

/** Behind the camera, or so far off-axis that it cannot be drawn (same limit as projectDirection). */
const MIN_FORWARD = 1e-3;

function projectInto(
  enu: Float64Array,
  count: number,
  basis: CameraBasis,
  viewport: Viewport,
  focal: number,
  outX: Float32Array,
  outY: Float32Array,
  inFront: Uint8Array,
): void {
  const [rx, ry, rz] = basis.right;
  const [ux, uy, uz] = basis.up;
  const [fx, fy, fz] = basis.forward;
  const cx = viewport.width / 2;
  const cy = viewport.height / 2;
  for (let i = 0, k = 0; i < count; i++, k += 3) {
    const x = enu[k],
      y = enu[k + 1],
      z = enu[k + 2];
    const zc = x * fx + y * fy + z * fz;
    if (zc <= MIN_FORWARD) {
      inFront[i] = 0;
      continue;
    }
    inFront[i] = 1;
    outX[i] = cx + (focal * (x * rx + y * ry + z * rz)) / zc;
    outY[i] = cy - (focal * (x * ux + y * uy + z * uz)) / zc;
  }
}

/**
 * Every star and constellation point of a SkyGeometry in the observer's horizon frame, plus their screen
 * positions for the current camera. All arrays are allocated once. `update` (the expensive part) runs
 * about once a second; `project` is a few dot products per point and runs every frame.
 */
export class SkyField {
  readonly starEnu: Float64Array;
  readonly pointEnu: Float64Array;
  readonly starX: Float32Array;
  readonly starY: Float32Array;
  readonly starInFront: Uint8Array;
  readonly pointX: Float32Array;
  readonly pointY: Float32Array;
  readonly pointInFront: Uint8Array;

  /** How long the last `update` / `project` took (ms), for diagnostics and the Phase 10 report. */
  lastTransformMs = 0;
  lastProjectMs = 0;

  private key = '';

  constructor(readonly geometry: SkyGeometry) {
    const { starCount, pointCount } = geometry;
    this.starEnu = new Float64Array(starCount * 3);
    this.pointEnu = new Float64Array(pointCount * 3);
    this.starX = new Float32Array(starCount);
    this.starY = new Float32Array(starCount);
    this.starInFront = new Uint8Array(starCount);
    this.pointX = new Float32Array(pointCount);
    this.pointY = new Float32Array(pointCount);
    this.pointInFront = new Uint8Array(pointCount);
  }

  /** Re-rotates everything if the second or the place changed. Returns whether it did any work. */
  update(date: Date, pos: GeoPosition): boolean {
    const key = `${Math.floor(date.getTime() / 1000)}|${pos.latitude}|${pos.longitude}|${pos.heightM ?? 0}`;
    if (key === this.key) return false;
    this.key = key;
    const t0 = performance.now();
    const { rotation } = horizonRotation(date, pos);
    rotateToEnu(rotation, this.geometry.starEqj, this.starEnu, this.geometry.starCount);
    rotateToEnu(rotation, this.geometry.pointEqj, this.pointEnu, this.geometry.pointCount);
    this.lastTransformMs = performance.now() - t0;
    return true;
  }

  /** Screen positions (CSS px, y down) for the camera. Points behind the camera get inFront = 0. */
  project(basis: CameraBasis, viewport: Viewport): void {
    const t0 = performance.now();
    const focal = focalLengthPx(viewport);
    const { starCount, pointCount } = this.geometry;
    projectInto(
      this.starEnu,
      starCount,
      basis,
      viewport,
      focal,
      this.starX,
      this.starY,
      this.starInFront,
    );
    projectInto(
      this.pointEnu,
      pointCount,
      basis,
      viewport,
      focal,
      this.pointX,
      this.pointY,
      this.pointInFront,
    );
    this.lastProjectMs = performance.now() - t0;
  }
}
