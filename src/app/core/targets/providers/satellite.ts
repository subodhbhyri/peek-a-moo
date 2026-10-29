import { Body, Equator, Horizon, Observer, Refraction } from 'astronomy-engine';
import {
  type EcfVec3,
  type GeodeticLocation,
  type SatRec,
  degreesToRadians,
  ecfToLookAngles,
  eciToEcf,
  gstime,
  json2satrec,
  propagate,
} from '../../satellite-lib';
import type { GeoPosition } from '../../astro/ephemeris';
import { type OmmRecord, type SatelliteElements, ageFlags } from '../../gp/gp.types';
import { RAD, Vec3, directionFromAzAlt } from '../../math/vec3';
import type { TargetDef, TargetState } from '../target.types';

/** Earth's equatorial radius, km: the radius of the cylindrical shadow. */
const EARTH_RADIUS_KM = 6378;
/** The trail: directions at t-1 s ... t-12 s. */
export const TRAIL_POINTS = 12;

/** Why a satellite has no position: the UI says "Orbit data unavailable" instead of crashing. */
export class SatelliteDataError extends Error {
  constructor(
    readonly code: 'no-elements' | 'propagation-failed',
    message: string,
  ) {
    super(message);
    this.name = 'SatelliteDataError';
  }
}

const satrecCache = new Map<string, SatRec>();

/** One satrec per element set (NORAD id + EPOCH). */
export function satrecFor(omm: OmmRecord): SatRec {
  const key = `${omm.NORAD_CAT_ID}:${omm.EPOCH}`;
  let rec = satrecCache.get(key);
  if (!rec) {
    rec = json2satrec(omm as unknown as Parameters<typeof json2satrec>[0]);
    satrecCache.set(key, rec);
  }
  return rec;
}

export function observerGeodetic(pos: GeoPosition): GeodeticLocation {
  return {
    latitude: degreesToRadians(pos.latitude),
    longitude: degreesToRadians(pos.longitude),
    height: (pos.heightM ?? 0) / 1000,
  };
}

export interface LookResult {
  azimuthDeg: number;
  /** Geometric (no refraction). */
  elevationDeg: number;
  rangeKm: number;
}

/** Look angles of a satellite at an ECF position, seen from `observer`. */
export function lookAngles(observer: GeodeticLocation, ecf: EcfVec3<number>): LookResult {
  const l = ecfToLookAngles(observer, ecf);
  return { azimuthDeg: l.azimuth * RAD, elevationDeg: l.elevation * RAD, rangeKm: l.rangeSat };
}

export interface SatelliteFix extends LookResult {
  /** ECI (TEME) position, km. */
  eci: Vec3;
}

/** Position of `satrec` at `date` seen from `observer`. Throws SatelliteDataError on SGP4 failure. */
export function satelliteFix(satrec: SatRec, date: Date, observer: GeodeticLocation): SatelliteFix {
  const pv = propagate(satrec, date);
  if (!pv || typeof pv.position === 'boolean') {
    throw new SatelliteDataError(
      'propagation-failed',
      'SGP4 could not propagate this orbit (decayed or bad elements).',
    );
  }
  const { x, y, z } = pv.position;
  const ecf = eciToEcf(pv.position, gstime(date));
  return { ...lookAngles(observer, ecf), eci: [x, y, z] };
}

/** Apparent (refraction-included) direction, so a satellite and a star at the same spot agree. */
function apparentDirection(fix: LookResult): { direction: Vec3; altitudeDeg: number } {
  const altitudeDeg = fix.elevationDeg + Refraction('normal', fix.elevationDeg);
  return { direction: directionFromAzAlt(fix.azimuthDeg, altitudeDeg), altitudeDeg };
}

/**
 * Cylindrical Earth shadow. `r` is the satellite's ECI position (km), `sunUnit` the unit vector toward
 * the Sun. In shadow iff the satellite is on the night side and within one Earth radius of the axis.
 */
export function isSunlit(r: Vec3, sunUnit: Vec3): boolean {
  const along = r[0] * sunUnit[0] + r[1] * sunUnit[1] + r[2] * sunUnit[2];
  if (along >= 0) return true;
  const px = r[0] - along * sunUnit[0];
  const py = r[1] - along * sunUnit[1];
  const pz = r[2] - along * sunUnit[2];
  return Math.hypot(px, py, pz) >= EARTH_RADIUS_KM;
}

/**
 * The Sun at `date`: unit vector in the true equator of date (TEME to well under a degree) and its
 * altitude from the observer.
 */
export function sunForSatellites(
  date: Date,
  pos: GeoPosition,
): { unit: Vec3; altitudeDeg: number } {
  const observer = new Observer(pos.latitude, pos.longitude, pos.heightM ?? 0);
  const eq = Equator(Body.Sun, date, observer, true, true);
  const hor = Horizon(date, observer, eq.ra, eq.dec, 'normal');
  const { x, y, z } = eq.vec;
  const n = Math.hypot(x, y, z);
  return { unit: [x / n, y / n, z / n], altitudeDeg: hor.altitude };
}

/** The element set for a satellite target, or a SatelliteDataError when it is not loaded. */
export function elementsFor(def: TargetDef, elements: SatelliteElements | undefined): OmmRecord {
  const noradId = def.satellite?.noradId;
  if (noradId === undefined) {
    throw new Error(`Target "${def.id}" has no satellite data for the satellite provider.`);
  }
  const omm = elements?.get(noradId);
  if (!omm) {
    throw new SatelliteDataError(
      'no-elements',
      `No provider data for target "${def.id}": orbit data is not loaded.`,
    );
  }
  return omm;
}

export function satelliteTargetState(
  def: TargetDef,
  date: Date,
  pos: GeoPosition,
  elements: SatelliteElements | undefined,
): TargetState {
  const omm = elementsFor(def, elements);
  const satrec = satrecFor(omm);
  const observer = observerGeodetic(pos);
  const fix = satelliteFix(satrec, date, observer);
  const { direction, altitudeDeg } = apparentDirection(fix);

  const trail: Vec3[] = [];
  for (let s = 1; s <= TRAIL_POINTS; s++) {
    const past = satelliteFix(satrec, new Date(date.getTime() - s * 1000), observer);
    trail.push(apparentDirection(past).direction);
  }

  const sun = sunForSatellites(date, pos);
  const sunlit = isSunlit(fix.eci, sun.unit);
  return {
    id: def.id,
    computedAt: date,
    direction,
    azimuthDeg: fix.azimuthDeg,
    altitudeDeg,
    magnitude: sunlit ? def.satellite!.magnitude : null,
    // A point source: the renderer draws a fixed-size dot.
    angularSizeDeg: 0,
    sunAltitudeDeg: sun.altitudeDeg,
    satellite: { sunlit, rangeKm: fix.rangeKm, ...ageFlags(omm, date), trail },
  };
}
