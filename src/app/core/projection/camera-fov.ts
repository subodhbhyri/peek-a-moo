import { DEG, RAD } from '../math/vec3';

export interface CameraFovInput {
  /** Intrinsic video size, as delivered (portrait on phones held in portrait). */
  videoWidth: number;
  videoHeight: number;
  /** CSS px of the cover-fitted element. */
  viewportWidth: number;
  viewportHeight: number;
  /** FOV across the video's LONG side. */
  longSideFovDeg: number;
}

/** Default: a 26 mm-equivalent main camera, 2·atan(18/26) across the long side. */
export const DEFAULT_LONG_SIDE_FOV_DEG = 69;
export const MIN_LONG_SIDE_FOV_DEG = 45;
export const MAX_LONG_SIDE_FOV_DEG = 90;

/** Vertical FOV actually visible on screen with object-fit: cover. */
export function displayedVerticalFovDeg(i: CameraFovInput): number {
  const longSide = Math.max(i.videoWidth, i.videoHeight);
  // Pinhole: tan(F_dim / 2) scales linearly with the sensor dimension.
  const tanLong = Math.tan((i.longSideFovDeg * DEG) / 2);
  const tanVideoH = (tanLong * i.videoHeight) / longSide;
  // object-fit: cover scales the video until it fills the viewport, then crops the overflow.
  const s = Math.max(i.viewportWidth / i.videoWidth, i.viewportHeight / i.videoHeight);
  const visibleFraction = i.viewportHeight / s / i.videoHeight;
  return 2 * Math.atan(tanVideoH * visibleFraction) * RAD;
}
