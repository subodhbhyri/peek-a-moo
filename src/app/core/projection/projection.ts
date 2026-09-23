import { DEG, RAD, Vec3, clamp, dot, length, scale, sub } from '../math/vec3';
import { CameraBasis } from '../sensors/orientation-math';

export interface Viewport {
  /** CSS pixels. */
  width: number;
  height: number;
  /**
   * Vertical field of view in degrees. Phone main cameras are roughly 60–70° vertical in portrait.
   * We don't show the camera feed by default, so this is a feel parameter: smaller = moon moves
   * faster across the screen and is harder to find.
   */
  vFovDeg: number;
}

export interface ScreenProjection {
  /** Target is in front of the screen plane (not behind the user). */
  inFront: boolean;
  /** Screen position in CSS px, y down. Only meaningful when inFront. */
  x: number;
  y: number;
  /** True if a circle of `radiusPx` at (x, y) overlaps the viewport. */
  onScreen: boolean;
  /** Distance of (x, y) from the screen center, normalized so 1 = half the shorter side. */
  centerDistance: number;
  /** Angle between where the phone points and the target. */
  angularDistanceDeg: number;
  /**
   * Screen-space direction from the center toward the target, radians, y UP (0 = right, π/2 = up).
   * Valid even when the target is behind you; use it for the "glow on the nearest edge" hint.
   */
  edgeAngleRad: number;
}

export function focalLengthPx(vp: Viewport): number {
  return vp.height / 2 / Math.tan((vp.vFovDeg * DEG) / 2);
}

/**
 * Pinhole projection of a world direction onto the phone screen.
 * Because it's a true perspective projection, a target just outside the frustum lands just outside the
 * screen on the correct side, so the Moon naturally slides in from the right edge as you pan.
 */
export function projectDirection(
  target: Vec3,
  cam: CameraBasis,
  vp: Viewport,
  radiusPx = 0,
): ScreenProjection {
  const xc = dot(target, cam.right);
  const yc = dot(target, cam.up);
  const zc = dot(target, cam.forward);
  const angularDistanceDeg = Math.acos(clamp(zc / (length(target) || 1), -1, 1)) * RAD;
  const edgeAngleRad = Math.atan2(yc, xc);
  const half = Math.min(vp.width, vp.height) / 2;

  // Anything at or behind ~90° off-axis can't be drawn meaningfully.
  if (zc <= 1e-3) {
    return {
      inFront: false,
      x: NaN,
      y: NaN,
      onScreen: false,
      centerDistance: Infinity,
      angularDistanceDeg,
      edgeAngleRad,
    };
  }

  const f = focalLengthPx(vp);
  const x = vp.width / 2 + (f * xc) / zc;
  const y = vp.height / 2 - (f * yc) / zc;
  const onScreen =
    x + radiusPx >= 0 && x - radiusPx <= vp.width && y + radiusPx >= 0 && y - radiusPx <= vp.height;
  const centerDistance = Math.hypot(x - vp.width / 2, y - vp.height / 2) / half;
  return { inFront: true, x, y, onScreen, centerDistance, angularDistanceDeg, edgeAngleRad };
}

/**
 * On-screen direction the Moon's LIT limb faces, radians, y UP (0 = lit side on the right).
 * Computed as the great-circle direction from the Moon toward the Sun, expressed in screen axes,
 * so it automatically accounts for latitude, time of night and how the phone is rolled.
 * Draw the phase with the terminator perpendicular to this angle.
 */
export function brightLimbScreenAngle(moonDir: Vec3, sunDir: Vec3, cam: CameraBasis): number {
  const t = sub(sunDir, scale(moonDir, dot(sunDir, moonDir)));
  if (length(t) < 1e-9) return 0;
  return Math.atan2(dot(t, cam.up), dot(t, cam.right));
}

/**
 * Size to draw the Moon. The real disc is ~0.5°, i.e. ~6 px on a phone, so we exaggerate
 * (position stays exact; only size is artistic). Scales slightly with real distance so perigee
 * "supermoons" come out bigger.
 */
export function displayRadiusPx(vp: Viewport, angularDiameterDeg: number, base = 0.11): number {
  const meanDiameter = 0.518;
  return Math.min(vp.width, vp.height) * base * (angularDiameterDeg / meanDiameter);
}

/**
 * Point on the viewport's border (inset by `margin`) in the given screen direction, y UP,
 * matching the convention of ScreenProjection.edgeAngleRad. Used to place the "you're close" glow
 * on the edge nearest an off-screen target, including one that's behind the user.
 */
export function edgeGlowPoint(
  vp: Viewport,
  edgeAngleRad: number,
  margin = 0,
): { x: number; y: number } {
  const cx = vp.width / 2;
  const cy = vp.height / 2;
  const dx = Math.cos(edgeAngleRad);
  const dy = -Math.sin(edgeAngleRad); // y-up angle -> y-down pixels
  const halfW = Math.max(vp.width / 2 - margin, 0);
  const halfH = Math.max(vp.height / 2 - margin, 0);
  const tX = dx !== 0 ? halfW / Math.abs(dx) : Infinity;
  const tY = dy !== 0 ? halfH / Math.abs(dy) : Infinity;
  const t = Math.min(tX, tY);
  return { x: cx + dx * t, y: cy + dy * t };
}
