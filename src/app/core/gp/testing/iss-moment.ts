import type { GeoPosition } from '../../astro/ephemeris';
import { getTarget } from '../../targets/catalog';
import { satelliteTargetState } from '../../targets/providers/satellite';
import { FIXTURE_ELEMENTS } from './gp-fixture';

/** The first moment after the fixture's fetch time when the ISS is above `minAltitudeDeg` from `pos`. */
export function issOverheadMoment(pos: GeoPosition, minAltitudeDeg = 25): Date {
  const iss = getTarget('iss')!;
  for (let t = Date.parse('2026-10-29T20:30:00Z'); ; t += 30_000) {
    if (
      satelliteTargetState(iss, new Date(t), pos, FIXTURE_ELEMENTS).altitudeDeg > minAltitudeDeg
    ) {
      return new Date(t);
    }
  }
}
