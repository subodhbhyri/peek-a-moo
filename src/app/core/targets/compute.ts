import type { GeoPosition } from '../astro/ephemeris';
import type { SatelliteElements } from '../gp/gp.types';
import type { SkyGeometry } from '../sky/sky-geometry';
import { constellationTargetState } from './providers/constellation';
import { fixedSkyTargetState } from './providers/fixed-sky';
import { moonTargetState } from './providers/moon';
import { satelliteTargetState } from './providers/satellite';
import { solarSystemTargetState } from './providers/solar-system';
import type { TargetDef, TargetState } from './target.types';

/**
 * Dispatches by kind. Satellites also need the loaded orbital elements (`satellites`); without them
 * they throw a SatelliteDataError, which the engine turns into "Orbit data unavailable". Constellations
 * likewise need the star map (`sky`) and throw a SkyDataError without it.
 */
export function computeTargetState(
  def: TargetDef,
  date: Date,
  observer: GeoPosition,
  satellites?: SatelliteElements,
  sky?: SkyGeometry,
): TargetState {
  switch (def.kind) {
    case 'moon':
      return moonTargetState(date, observer);
    case 'sun':
    case 'planet':
      return solarSystemTargetState(def, date, observer);
    case 'fixed':
      return fixedSkyTargetState(def, date, observer);
    case 'satellite':
      return satelliteTargetState(def, date, observer, satellites);
    case 'constellation':
      return constellationTargetState(def, date, observer, sky);
  }
}
