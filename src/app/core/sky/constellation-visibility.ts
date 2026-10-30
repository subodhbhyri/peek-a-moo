import type { ConstellationGeo } from './sky-geometry';

/**
 * True when no part of the figure can ever clear the horizon at this latitude: every vertex is further
 * from the observer's visible half of the sky than the horizon allows. A star of declination d reaches a
 * maximum altitude of 90 - |latitude - d| degrees, so it never rises when that is not above zero.
 */
export function neverRisesFor(geo: ConstellationGeo, latitudeDeg: number): boolean {
  return latitudeDeg >= 0
    ? geo.decMaxDeg < -(90 - latitudeDeg)
    : geo.decMinDeg > 90 - Math.abs(latitudeDeg);
}
