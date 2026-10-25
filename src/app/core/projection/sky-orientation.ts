import { DEG, Vec3, directionFromAzAlt, dot, length, scale, sub } from '../math/vec3';
import type { CameraBasis } from '../sensors/orientation-math';

/** Unit ENU vector to the north celestial pole for an observer at latitude φ: az 0, alt φ. */
export function northCelestialPole(latitudeDeg: number): Vec3 {
  return directionFromAzAlt(0, latitudeDeg);
}

/**
 * Screen angle (y-up radians; 0 = right, π/2 = up) of celestial north at the target: the tangent at the
 * target toward the pole, expressed in screen axes. Same pattern as brightLimbScreenAngle.
 * At the pole itself there is no tangent; falls back to "up" (π/2) rather than NaN.
 */
export function skyNorthScreenAngle(targetDir: Vec3, ncp: Vec3, cam: CameraBasis): number {
  const t = sub(ncp, scale(targetDir, dot(ncp, targetDir)));
  if (length(t) < 1e-9) return Math.PI / 2;
  return Math.atan2(dot(t, cam.up), dot(t, cam.right));
}

/**
 * Screen angle for a sky position angle (degrees, measured from north through EAST). Seen from the
 * ground east is to the left of north, so position angle runs counterclockwise on screen.
 */
export function positionAngleToScreen(northScreenRad: number, paDeg: number): number {
  return northScreenRad + paDeg * DEG;
}
