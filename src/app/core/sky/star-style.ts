import { clamp } from '../math/vec3';
import { bvToColor, starBrightness } from '../render/draw-star';

/**
 * Background stars are drawn in batches (one path and one fill per size class and color), so each star is
 * reduced to two small indices once, at load. Same brightness curve and B-V color table as the Phase 4
 * star renderer, at a smaller scale: background stars are a texture, not targets.
 */

/** B-V bin centers; a star takes the nearest. A missing B-V counts as a sun-like 0.6. */
const BV_BINS = [-0.2, 0.1, 0.4, 0.8, 1.2, 1.6] as const;
/** A star is in class k when its magnitude is below SIZE_LIMITS[k] (the last class takes the rest). */
const SIZE_LIMITS = [0, 1, 2, 3, 4] as const;
/** Representative magnitude of each size class, for its radius and opacity. */
const SIZE_MAGS = [-0.5, 0.5, 1.5, 2.5, 3.5, 4.5] as const;

export const STAR_COLOR_COUNT = BV_BINS.length;
export const STAR_SIZE_COUNT = SIZE_MAGS.length;

export function starColorIndex(bv: number | null): number {
  const v = bv ?? 0.6;
  let best = 0;
  for (let i = 1; i < BV_BINS.length; i++) {
    if (Math.abs(BV_BINS[i] - v) < Math.abs(BV_BINS[best] - v)) best = i;
  }
  return best;
}

export function starSizeClass(mag: number): number {
  const k = SIZE_LIMITS.findIndex((limit) => mag < limit);
  return k === -1 ? SIZE_LIMITS.length : k;
}

/** CSS color per B-V bin. */
export const STAR_COLORS: readonly string[] = BV_BINS.map((bv) => bvToColor(bv));

/** Dot radius in CSS px per size class: 0.7 px for the faintest up to about 1.9 px for Sirius. */
export const STAR_RADIUS_PX: readonly number[] = SIZE_MAGS.map(
  (m) => 0.45 + 0.7 * Math.sqrt(starBrightness(m)),
);

/** Opacity per size class (before the below-horizon dimming): brighter is more opaque. */
export const STAR_ALPHA: readonly number[] = SIZE_MAGS.map((_, k) => clamp(0.95 - 0.08 * k, 0, 1));
