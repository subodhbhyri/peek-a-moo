import { Body, Equator, Horizon, Illumination, MoonPhase, Observer } from 'astronomy-engine';
import { Vec3, directionFromAzAlt } from '../math/vec3';

export interface GeoPosition {
  latitude: number;
  longitude: number;
  /** Meters above sea level; 0 is fine if unknown. */
  heightM?: number;
}

export type MoonPhaseName =
  | 'new'
  | 'waxing-crescent'
  | 'first-quarter'
  | 'waxing-gibbous'
  | 'full'
  | 'waning-gibbous'
  | 'last-quarter'
  | 'waning-crescent';

export interface MoonState {
  computedAt: Date;
  /** True azimuth, degrees clockwise from true north. */
  azimuthDeg: number;
  /** Apparent altitude (includes atmospheric refraction), degrees. */
  altitudeDeg: number;
  /** Unit vector toward the Moon in ENU. */
  direction: Vec3;
  /** Unit vector toward the Sun in ENU (used to orient the lit side). */
  sunDirection: Vec3;
  sunAltitudeDeg: number;
  /** 0 = new, 1 = full. */
  illuminatedFraction: number;
  /** Ecliptic elongation 0..360: 0 new, 90 first quarter, 180 full, 270 last quarter. */
  phaseDeg: number;
  phaseName: MoonPhaseName;
  waxing: boolean;
  distanceKm: number;
  angularDiameterDeg: number;
}

const AU_KM = 149_597_870.7;
const MOON_RADIUS_KM = 1737.4;

export function phaseNameFromDegrees(phaseDeg: number): MoonPhaseName {
  const p = ((phaseDeg % 360) + 360) % 360;
  // Named quarters get a ±~7° window (about half a day either side), the rest are ranges.
  if (p < 7 || p >= 353) return 'new';
  if (p < 83) return 'waxing-crescent';
  if (p < 97) return 'first-quarter';
  if (p < 173) return 'waxing-gibbous';
  if (p < 187) return 'full';
  if (p < 263) return 'waning-gibbous';
  if (p < 277) return 'last-quarter';
  return 'waning-crescent';
}

/**
 * Topocentric (observer-relative) Moon position. Topocentric matters for the Moon: parallax shifts it
 * by up to ~1° versus a geocentric calculation, about two Moon-widths.
 */
export function computeMoonState(date: Date, pos: GeoPosition): MoonState {
  const observer = new Observer(pos.latitude, pos.longitude, pos.heightM ?? 0);

  const moonEq = Equator(Body.Moon, date, observer, true, true);
  const moonHor = Horizon(date, observer, moonEq.ra, moonEq.dec, 'normal');

  const sunEq = Equator(Body.Sun, date, observer, true, true);
  const sunHor = Horizon(date, observer, sunEq.ra, sunEq.dec, 'normal');

  const illum = Illumination(Body.Moon, date);
  const phaseDeg = MoonPhase(date);
  const distanceKm = moonEq.dist * AU_KM;

  return {
    computedAt: date,
    azimuthDeg: moonHor.azimuth,
    altitudeDeg: moonHor.altitude,
    direction: directionFromAzAlt(moonHor.azimuth, moonHor.altitude),
    sunDirection: directionFromAzAlt(sunHor.azimuth, sunHor.altitude),
    sunAltitudeDeg: sunHor.altitude,
    illuminatedFraction: illum.phase_fraction,
    phaseDeg,
    phaseName: phaseNameFromDegrees(phaseDeg),
    waxing: phaseDeg < 180,
    distanceKm,
    angularDiameterDeg: (2 * Math.asin(MOON_RADIUS_KM / distanceKm) * 180) / Math.PI,
  };
}
