import { DEG, Vec3, azAltFromDirection, wrap180 } from '../math/vec3';
import type { CameraBasis } from '../sensors/orientation-math';
import type { HeadingSource } from '../sensors/orientation.service';

/** Degrees to ADD to the phone's pointing azimuth so it matches the target. wrap180. */
export function computeYawCorrection(pointing: CameraBasis, targetDir: Vec3): number {
  return wrap180(
    azAltFromDirection(targetDir).azimuthDeg - azAltFromDirection(pointing.forward).azimuthDeg,
  );
}

/** Rotate every basis vector about world Up so pointing azimuth increases by yawDeg. Alt and roll unchanged. */
export function applyYawCorrection(basis: CameraBasis, yawDeg: number): CameraBasis {
  // Azimuth runs clockwise seen from above, i.e. NEGATIVE about +Z in a right-handed ENU frame.
  const t = -yawDeg * DEG;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const rot = (v: Vec3): Vec3 => [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
  return { forward: rot(basis.forward), up: rot(basis.up), right: rot(basis.right) };
}

export interface StoredAlignment {
  yawDeg: number;
  /** Date.now() when locked. */
  setAt: number;
  lat: number;
  lon: number;
  source: HeadingSource;
}

export const ALIGNMENT_MAX_AGE_MS = 6 * 3_600_000;
export const ALIGNMENT_MAX_DISTANCE_KM = 50;

/** Great-circle distance, km (haversine). */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Valid while younger than 6 h, within 50 km of where it was set, and from the same heading source. */
export function isAlignmentValid(
  a: StoredAlignment,
  lat: number,
  lon: number,
  source: HeadingSource,
  now: number,
): boolean {
  return (
    a.source === source &&
    now - a.setAt >= 0 &&
    now - a.setAt < ALIGNMENT_MAX_AGE_MS &&
    distanceKm(a.lat, a.lon, lat, lon) <= ALIGNMENT_MAX_DISTANCE_KM
  );
}
