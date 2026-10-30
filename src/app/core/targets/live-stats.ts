import { Body, GeoVector } from 'astronomy-engine';
import { gstime, eciToGeodetic, propagate } from '../satellite-lib';
import type { SatelliteElements } from '../gp/gp.types';
import { DEG } from '../math/vec3';
import { satrecFor } from './providers/satellite';
import type { TargetDef, TargetState } from './target.types';

export interface LiveStat {
  label: string;
  value: string;
}

export interface LiveStatsOptions {
  /** BCP 47 tag for number formatting; defaults to the browser's. */
  locale?: string;
  /** Needed for a satellite's height and speed; without it those rows are left out. */
  elements?: SatelliteElements;
}

/** Speed of light, km/s (exact by definition of the metre). */
export const LIGHT_KM_PER_S = 299_792.458;
/** Astronomical unit, km (IAU 2012, exact). */
export const AU_KM = 149_597_870.7;

const defaultLocale = () => (typeof navigator !== 'undefined' ? navigator.language : 'en-US');

function num(n: number, locale: string, maxDigits = 0, minDigits = 0): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: maxDigits,
    minimumFractionDigits: minDigits,
  }).format(n);
}

/** Distance from the apparent angular diameter: d = R / sin(theta / 2). */
function distanceFromAngularSize(radiusKm: number, angularSizeDeg: number): number {
  return radiusKm / Math.sin((angularSizeDeg * DEG) / 2);
}

/** "1.3 seconds", "8.3 minutes", "4.1 hours". */
export function formatLightTime(seconds: number, locale: string): string {
  if (seconds < 60) return `${num(seconds, locale, 1)} seconds`;
  if (seconds < 3600) return `${num(seconds / 60, locale, 1)} minutes`;
  return `${num(seconds / 3600, locale, 1)} hours`;
}

/**
 * Light-years as a number phrase: "8.6", "430", "26,000", "2.5 million". Under 100 keeps a decimal,
 * above that is rounded to a whole number; millions use one decimal.
 */
export function formatLightYears(ly: number, locale: string): string {
  if (ly >= 1_000_000) return `${num(ly / 1_000_000, locale, 1)} million`;
  if (ly < 100) return num(ly, locale, 1);
  return num(ly, locale, 0);
}

/** Planets and the Sun: "778 million km (5.2 AU)". */
function formatMillionsKm(km: number, locale: string): string {
  const millions = km / 1e6;
  return `${num(millions, locale, millions >= 100 ? 0 : 1)} million km (${num(km / AU_KM, locale, 1, 1)} AU)`;
}

const upFromHere = (state: TargetState, locale: string): LiveStat => ({
  label: 'Up from here',
  value:
    state.altitudeDeg > 0
      ? `${num(state.altitudeDeg, locale, 0)}° above the horizon`
      : 'Below the horizon',
});

function satelliteStats(
  def: TargetDef,
  state: TargetState,
  now: Date,
  locale: string,
  elements: SatelliteElements | undefined,
): LiveStat[] {
  const out: LiveStat[] = [];
  const omm = def.satellite && elements?.get(def.satellite.noradId);
  if (omm) {
    const pv = propagate(satrecFor(omm), now);
    if (pv && typeof pv.position !== 'boolean' && typeof pv.velocity !== 'boolean') {
      const height = eciToGeodetic(pv.position, gstime(now)).height;
      const speed = Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z);
      out.push({ label: 'Height', value: `${num(height, locale, 0)} km above Earth` });
      out.push({ label: 'Speed', value: `${num(speed, locale, 2)} km/s` });
    }
  }
  if (state.satellite) out.push({ label: 'Sunlit', value: state.satellite.sunlit ? 'Yes' : 'No' });
  return out;
}

/**
 * The live rows shown under a target's description. Pure: pass the state and the time.
 *  - Moon, Sun, planets: distance right now and light travel time (distance / c); planets add brightness.
 *  - Stars and deep sky: distance in light-years and how long ago the light you see left.
 *  - Satellites: height above Earth (geodetic), speed, sunlit.
 *  - Everything: whether (and how high) it is up from here.
 */
export function liveStats(
  def: TargetDef,
  state: TargetState,
  now: Date,
  opts: LiveStatsOptions = {},
): LiveStat[] {
  const locale = opts.locale ?? defaultLocale();
  const out: LiveStat[] = [];

  if (def.kind === 'moon') {
    // Earth-Moon distance (geocentric), so it stays within the usual 356,000-407,000 km range wherever you stand.
    const km = GeoVector(Body.Moon, now, true).Length() * AU_KM;
    out.push({ label: 'Distance right now', value: `${num(km, locale, 0)} km` });
    out.push({ label: 'Light takes', value: formatLightTime(km / LIGHT_KM_PER_S, locale) });
  } else if ((def.kind === 'sun' || def.kind === 'planet') && def.planet) {
    const km = distanceFromAngularSize(def.planet.radiusKm, state.angularSizeDeg);
    out.push({ label: 'Distance right now', value: formatMillionsKm(km, locale) });
    out.push({ label: 'Light takes', value: formatLightTime(km / LIGHT_KM_PER_S, locale) });
    if (def.kind === 'planet' && state.magnitude !== null) {
      out.push({ label: 'Brightness', value: `magnitude ${num(state.magnitude, locale, 1, 1)}` });
    }
  } else if (def.kind === 'fixed' && def.info.distanceLy !== undefined) {
    const ly = def.info.distanceLy;
    const uncertain = def.id === 'betelgeuse';
    out.push({
      label: 'Distance',
      value: `about ${formatLightYears(ly, locale)} light-years${uncertain ? ", but it's uncertain" : ''}`,
    });
    out.push({
      label: "Light you're seeing left it",
      value: `about ${formatLightYears(ly, locale)} years ago${uncertain ? ' (roughly)' : ''}`,
    });
  } else if (def.kind === 'satellite') {
    out.push(...satelliteStats(def, state, now, locale, opts.elements));
  }

  if (def.kind === 'constellation') {
    out.push({
      label: 'Right now',
      value:
        state.altitudeDeg > 0
          ? 'Up from here'
          : state.constellation?.partlyUp
            ? 'Partly up'
            : 'Below the horizon',
    });
    return out;
  }
  out.push(upFromHere(state, locale));
  return out;
}
