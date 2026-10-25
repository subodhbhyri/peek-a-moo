import { Body, Equator, Horizon, Illumination, Observer } from 'astronomy-engine';
import type { GeoPosition } from '../../astro/ephemeris';
import { RAD, directionFromAzAlt } from '../../math/vec3';
import type { PlanetPhaseName, TargetDef, TargetState } from '../target.types';

const AU_KM = 149_597_870.7;
/** Sun's visual magnitude, constant to the precision we need. */
const SUN_MAGNITUDE = -26.7;

/** Bucketed name for a planet's illuminated fraction (waxing/waning is shown by the lit limb instead). */
export function planetPhaseName(fraction: number): PlanetPhaseName {
  if (fraction < 0.03) return 'new';
  if (fraction < 0.45) return 'crescent';
  if (fraction < 0.55) return 'quarter';
  if (fraction < 0.97) return 'gibbous';
  return 'full';
}

/** Apparent (refraction-included) horizontal coordinates of a body, same path as the Moon. */
function horizontal(body: Body, date: Date, observer: Observer) {
  const eq = Equator(body, date, observer, true, true);
  const hor = Horizon(date, observer, eq.ra, eq.dec, 'normal');
  return { eq, hor, direction: directionFromAzAlt(hor.azimuth, hor.altitude) };
}

/** Sun and the seven other planets. Position via Equator -> Horizon; brightness via Illumination. */
export function solarSystemTargetState(
  def: TargetDef,
  date: Date,
  observerPos: GeoPosition,
): TargetState {
  if (!def.body || !def.planet) {
    throw new Error(`Target "${def.id}" has no body/planet data for the solar-system provider.`);
  }
  const body = def.body as Body;
  const observer = new Observer(
    observerPos.latitude,
    observerPos.longitude,
    observerPos.heightM ?? 0,
  );
  const { eq, hor, direction } = horizontal(body, date, observer);
  const distanceKm = eq.dist * AU_KM;
  const angularSizeDeg = 2 * Math.asin(def.planet.radiusKm / distanceKm) * RAD;

  const state: TargetState = {
    id: def.id,
    computedAt: date,
    direction,
    azimuthDeg: hor.azimuth,
    altitudeDeg: hor.altitude,
    magnitude: SUN_MAGNITUDE,
    angularSizeDeg,
  };
  if (body === Body.Sun) return state;

  const illum = Illumination(body, date);
  state.magnitude = illum.mag;
  const sun = horizontal(Body.Sun, date, observer);
  state.sunDirection = sun.direction;
  state.sunAltitudeDeg = sun.hor.altitude;
  if (def.planet.phased) {
    // Same convention as the Moon: phaseDeg 0 = new, 180 = full (phase_angle is 0 at full).
    state.phase = {
      kind: 'planet',
      illuminatedFraction: illum.phase_fraction,
      phaseDeg: 180 - illum.phase_angle,
      name: planetPhaseName(illum.phase_fraction),
    };
  }
  if (def.planet.rings && illum.ring_tilt !== undefined) {
    state.rings = { tiltDeg: illum.ring_tilt };
  }
  return state;
}
