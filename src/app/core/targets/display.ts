import { Viewport, displayRadiusPx } from '../projection/projection';
import type { TargetState } from './target.types';

/** Centered = within this fraction of half the shorter screen side from the center. */
const CENTERED_THRESHOLD = 0.35;

/** On-screen radius in CSS px. For the Moon this is exactly the v1 exaggerated size. */
export function displayRadiusFor(state: TargetState, viewport: Viewport): number {
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
