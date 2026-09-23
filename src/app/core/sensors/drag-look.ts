import { clamp, wrap360 } from '../math/vec3';

export interface LookAngles {
  azimuthDeg: number;
  altitudeDeg: number;
}

/**
 * Turns a pointer drag into a new pointing direction. Used when there's no orientation sensor
 * (desktop, or a device that denies/lacks motion): drag right to look right (azimuth increases,
 * since azimuth is clockwise from north), drag up to look up.
 */
export function dragToLook(
  current: LookAngles,
  deltaXPx: number,
  deltaYPx: number,
  degPerPx = 0.25,
): LookAngles {
  return {
    azimuthDeg: wrap360(current.azimuthDeg + deltaXPx * degPerPx),
    altitudeDeg: clamp(current.altitudeDeg - deltaYPx * degPerPx, -89, 89),
  };
}

/** Same idea, one keyboard step at a time (arrow keys), for accessibility. */
export function keyToLook(current: LookAngles, key: string, stepDeg = 2): LookAngles | null {
  switch (key) {
    case 'ArrowLeft':
      return { ...current, azimuthDeg: wrap360(current.azimuthDeg - stepDeg) };
    case 'ArrowRight':
      return { ...current, azimuthDeg: wrap360(current.azimuthDeg + stepDeg) };
    case 'ArrowUp':
      return { ...current, altitudeDeg: clamp(current.altitudeDeg + stepDeg, -89, 89) };
    case 'ArrowDown':
      return { ...current, altitudeDeg: clamp(current.altitudeDeg - stepDeg, -89, 89) };
    default:
      return null;
  }
}
