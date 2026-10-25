import type { GeoPosition } from '../astro/ephemeris';
import { moonTargetState } from './providers/moon';
import type { TargetDef, TargetState } from './target.types';

/** Dispatches by kind. Kinds without a provider yet throw; later phases fill them in. */
export function computeTargetState(def: TargetDef, date: Date, observer: GeoPosition): TargetState {
  switch (def.kind) {
    case 'moon':
      return moonTargetState(date, observer);
    default:
      throw new Error(`No provider for target "${def.id}" (kind "${def.kind}") yet.`);
  }
}
