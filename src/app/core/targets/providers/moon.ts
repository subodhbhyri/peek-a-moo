import { Body, Illumination } from 'astronomy-engine';
import { GeoPosition, computeMoonState } from '../../astro/ephemeris';
import type { TargetState } from '../target.types';

/** The Moon as a TargetState. Wraps the v1 ephemeris untouched, so numbers are identical to v1. */
export function moonTargetState(date: Date, observer: GeoPosition): TargetState {
  const m = computeMoonState(date, observer);
  return {
    id: 'moon',
    computedAt: m.computedAt,
    direction: m.direction,
    azimuthDeg: m.azimuthDeg,
    altitudeDeg: m.altitudeDeg,
    magnitude: Illumination(Body.Moon, date).mag,
    angularSizeDeg: m.angularDiameterDeg,
    phase: {
      illuminatedFraction: m.illuminatedFraction,
      phaseDeg: m.phaseDeg,
      name: m.phaseName,
    },
    sunDirection: m.sunDirection,
    sunAltitudeDeg: m.sunAltitudeDeg,
  };
}
