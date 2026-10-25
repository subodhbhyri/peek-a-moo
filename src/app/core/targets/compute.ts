import type { GeoPosition } from '../astro/ephemeris';
import { moonTargetState } from './providers/moon';
import { solarSystemTargetState } from './providers/solar-system';
import type { TargetDef, TargetState } from './target.types';

/** Dispatches by kind. Kinds without a provider yet throw; later phases fill them in. */
export function computeTargetState(def: TargetDef, date: Date, observer: GeoPosition): TargetState {
  switch (def.kind) {
    case 'moon':
      return moonTargetState(date, observer);
    case 'sun':
    case 'planet':
      return solarSystemTargetState(def, date, observer);
    default:
      throw new Error(`No provider for target "${def.id}" (kind "${def.kind}") yet.`);
  }
}
