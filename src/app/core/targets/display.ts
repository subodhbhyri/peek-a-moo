import { DEG } from '../math/vec3';
import { Viewport, displayRadiusPx, focalLengthPx } from '../projection/projection';
import { getTarget } from './catalog';
import type { TargetState } from './target.types';

/** Centered = within this fraction of half the shorter screen side from the center. */
const CENTERED_THRESHOLD = 0.35;
/** Planets never draw smaller than this fraction of the shorter screen side (radius). */
export const MIN_PLANET_FRACTION = 0.035;

/**
 * On-screen radius in CSS px.
 *  - Moon and Sun: the v1 exaggerated-Moon formula with the body's own angular diameter.
 *  - Planets: true size when it is larger than the minimum sprite, else the minimum.
 *    (Saturn's rings are drawn out to 2.25 globe radii around this radius.)
 */
export function displayRadiusFor(state: TargetState, viewport: Viewport): number {
  const kind = getTarget(state.id)?.kind;
  if (kind === 'planet') {
    const minPx = MIN_PLANET_FRACTION * Math.min(viewport.width, viewport.height);
    const truePx = focalLengthPx(viewport) * Math.tan((state.angularSizeDeg * DEG) / 2);
    return Math.max(minPx, truePx);
  }
  return displayRadiusPx(viewport, state.angularSizeDeg);
}

/**
 * How close to the center (fraction of half the shorter screen side) counts as "found".
 * TODO(Phase 3/4): scale with the displayed size, so a 3° galaxy does not need pinpoint centering.
 */
// Parameters are unused until the threshold scales with size; callers already pass them.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function centeredThreshold(_radiusPx: number, _viewport: Viewport): number {
  return CENTERED_THRESHOLD;
}
