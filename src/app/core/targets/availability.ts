import type { GeoPosition } from '../astro/ephemeris';
import type { SatelliteElements } from '../gp/gp.types';
import { getTarget } from './catalog';
import { computeTargetState } from './compute';
import { type Crossings, type ScanOptions, scanCrossings } from './crossings';
import { type SatellitePass, computeSatelliteAvailability } from './satellite-passes';
import type { TargetDef } from './target.types';

export type Visibility =
  /** Above the horizon and bright enough for the current sky darkness. */
  | 'up-visible'
  /** Above the horizon, but the sky is too bright for this target. */
  | 'up-daylight'
  /** Above the horizon in a dark or twilight sky, but too faint (or magnitude unknown). */
  | 'up-too-faint'
  | 'below-horizon';

export interface Availability {
  targetId: string;
  computedAt: Date;
  altitudeDeg: number;
  /** Added in Phase 5: the target's magnitude at `computedAt`, for "Best right now" ordering. */
  magnitude: number | null;
  visibility: Visibility;
  /** Up, but below 10 degrees. */
  low: boolean;
  /** Within the search window. */
  nextRise: Date | null;
  nextSet: Date | null;
  /** Never sets within the window. */
  alwaysUp: boolean;
  /** Never rises within the window. */
  neverUp: boolean;
  /** Fixed targets only: geometrically impossible at this latitude. */
  neverRisesHere: boolean;
  /** Satellites only (Phase 6). Their orbit data could not be loaded: nothing else here is meaningful. */
  orbitDataUnavailable?: boolean;
  /** Satellites: the pass in progress (above 10 degrees now), if any. */
  currentPass?: SatellitePass | null;
  /** Satellites: the next pass that is sunlit, above 10 degrees and in a dark enough sky (within 24 h). */
  nextVisiblePass?: SatellitePass | null;
  /** Satellites: overhead now and actually visible (sunlit, dark enough sky). */
  visibleNow?: boolean;
  /** Satellites: age of the element set, days. */
  orbitAgeDays?: number;
  /** Satellites: older than 14 days. */
  orbitStale?: boolean;
}

/** Naked-eye limiting magnitude by sky darkness, from the Sun's altitude. */
export interface SkyLimits {
  /** Sun below this altitude: dark sky. */
  darkBelowSunDeg: number;
  /** Sun between darkBelow and this altitude: twilight. Above: daylight. */
  twilightBelowSunDeg: number;
  darkMag: number;
  twilightMag: number;
  daylightMag: number;
}

export const DEFAULT_SKY_LIMITS: SkyLimits = {
  darkBelowSunDeg: -12,
  twilightBelowSunDeg: -6,
  darkMag: 6.0,
  twilightMag: 3.0,
  daylightMag: -3.5,
};

export const LOW_ALTITUDE_DEG = 10;

/**
 * Visibility of a target given its altitude, magnitude and the Sun's altitude.
 *  - Daylight (Sun above -6 deg): visible only if brighter than the daylight limit, otherwise the
 *    sky is "too bright" (`up-daylight`).
 *  - Twilight / dark: visible if brighter than that limit, otherwise `up-too-faint`.
 *  - A null magnitude (e.g. the Galactic Center) is never visible by eye.
 */
export function visibilityFor(
  altitudeDeg: number,
  magnitude: number | null,
  sunAltitudeDeg: number,
  limits: SkyLimits = DEFAULT_SKY_LIMITS,
): Visibility {
  if (altitudeDeg <= 0) return 'below-horizon';
  const daylight = sunAltitudeDeg > limits.twilightBelowSunDeg;
  const limit = daylight
    ? limits.daylightMag
    : sunAltitudeDeg < limits.darkBelowSunDeg
      ? limits.darkMag
      : limits.twilightMag;
  if (magnitude !== null && magnitude <= limit) return 'up-visible';
  return daylight && magnitude !== null ? 'up-daylight' : 'up-too-faint';
}

/** Fixed targets: true when a star of this declination never clears the horizon at this latitude. */
export function neverRisesAtLatitude(decDeg: number, latitudeDeg: number): boolean {
  return latitudeDeg >= 0 ? decDeg < -(90 - latitudeDeg) : decDeg > 90 - Math.abs(latitudeDeg);
}

export { DEFAULT_SCAN, scanCrossings } from './crossings';
export type { Crossings, ScanOptions } from './crossings';

export interface AvailabilityOptions {
  limits?: SkyLimits;
  scan?: Partial<ScanOptions>;
  /** Orbital elements, needed for satellite targets. */
  elements?: SatelliteElements;
}

/** Availability of one target at `now` from `pos`. Pure: no clocks, no Angular. */
export function computeAvailability(
  def: TargetDef,
  now: Date,
  pos: GeoPosition,
  opts: AvailabilityOptions = {},
): Availability {
  if (def.kind === 'satellite') {
    return computeSatelliteAvailability(def, now, pos, opts.elements, opts.scan);
  }
  const state = computeTargetState(def, now, pos);
  const sunDef = getTarget('sun');
  const sunAlt =
    def.kind === 'sun' || !sunDef
      ? state.altitudeDeg
      : computeTargetState(sunDef, now, pos).altitudeDeg;
  const visibility = visibilityFor(state.altitudeDeg, state.magnitude, sunAlt, opts.limits);
  const up = state.altitudeDeg > 0;

  const neverRisesHere =
    def.kind === 'fixed' && !!def.fixed && neverRisesAtLatitude(def.fixed.decDeg, pos.latitude);

  // Geometry settles fixed targets that can never rise; everything else is scanned.
  const crossings: Crossings = neverRisesHere
    ? { rises: [], sets: [], alwaysUp: false, neverUp: true }
    : scanCrossings((d) => computeTargetState(def, d, pos).altitudeDeg, now, opts.scan);
  const nextRise = crossings.rises[0] ?? null;
  const nextSet = crossings.sets[0] ?? null;
  const { alwaysUp, neverUp } = crossings;

  return {
    targetId: def.id,
    computedAt: now,
    altitudeDeg: state.altitudeDeg,
    magnitude: state.magnitude,
    visibility,
    low: up && state.altitudeDeg < LOW_ALTITUDE_DEG,
    nextRise,
    nextSet,
    alwaysUp,
    neverUp,
    neverRisesHere,
  };
}

/** Yields to the browser between targets, so the UI stays responsive. */
export function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Computes availability for many targets, one at a time, yielding between them.
 * `onEach` fires as each result lands, so a sheet can fill in labels progressively.
 */
export async function computeAvailabilityChunked(
  defs: readonly TargetDef[],
  now: Date,
  pos: GeoPosition,
  onEach: (a: Availability) => void,
  opts: AvailabilityOptions = {},
  yieldFn: () => Promise<void> = yieldToBrowser,
): Promise<void> {
  for (const def of defs) {
    onEach(computeAvailability(def, now, pos, opts));
    await yieldFn();
  }
}
