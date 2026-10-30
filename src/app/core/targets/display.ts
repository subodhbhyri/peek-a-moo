import { DEG } from '../math/vec3';
import { Viewport, displayRadiusPx, focalLengthPx } from '../projection/projection';
import { SATELLITE_CORE_PX } from '../render/draw-satellite';
import { starGlowRadiusPx } from '../render/draw-star';
import { getTarget } from './catalog';
import type { TargetState } from './target.types';

/** Centered = within this fraction of half the shorter screen side from the center. */
const CENTERED_THRESHOLD = 0.35;
/** Planets never draw smaller than this fraction of the shorter screen side (radius). */
export const MIN_PLANET_FRACTION = 0.035;
/** A constellation's display radius is computed from at most this half-angle. */
const MAX_FIGURE_HALF_DEG = 70;

/**
 * On-screen radius in CSS px.
 *  - Moon and Sun: the v1 exaggerated-Moon formula with the body's own angular diameter.
 *  - Planets and extended objects (semi-major axis): true size when larger than the minimum sprite,
 *    else the minimum. (Saturn's rings are drawn out to 2.25 globe radii around this radius.)
 *  - Stars: their visible glow radius, from magnitude.
 *  - Satellites: a fixed dot, whatever their (tiny) true size.
 *  - Constellations: the figure's true size (twice the largest angle from its center to a vertex).
 */
export function displayRadiusFor(state: TargetState, viewport: Viewport): number {
  const def = getTarget(state.id);
  if (def?.render === 'star') return starGlowRadiusPx(state.magnitude ?? 6);
  if (def?.render === 'satellite') return SATELLITE_CORE_PX;
  // Planets and extended objects: true size, but never smaller than the minimum sprite.
  if (def?.render === 'constellation') {
    // The figure at its true size (capped so a huge one cannot blow up the tangent).
    const halfDeg = Math.min(state.angularSizeDeg / 2, MAX_FIGURE_HALF_DEG);
    return focalLengthPx(viewport) * Math.tan(halfDeg * DEG);
  }
  if (def?.kind === 'planet' || def?.render === 'extended') {
    const minPx = MIN_PLANET_FRACTION * Math.min(viewport.width, viewport.height);
    const truePx = focalLengthPx(viewport) * Math.tan((state.angularSizeDeg * DEG) / 2);
    return Math.max(minPx, truePx);
  }
  return displayRadiusPx(viewport, state.angularSizeDeg);
}

/**
 * How close to the center (fraction of half the shorter screen side) counts as "found".
 * 0.35 for anything small (the Moon, planets, stars at today's sizes); large objects get a looser
 * threshold, up to 0.8, so you do not have to pinpoint the middle of a big galaxy.
 */
export function centeredThreshold(radiusPx: number, viewport: Viewport): number {
  const half = Math.min(viewport.width, viewport.height) / 2;
  return Math.max(CENTERED_THRESHOLD, Math.min(0.8, (0.8 * radiusPx) / half));
}
