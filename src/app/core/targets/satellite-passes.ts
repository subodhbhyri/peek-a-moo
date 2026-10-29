import type { GeoPosition } from '../astro/ephemeris';
import { type SatelliteElements, ageFlags } from '../gp/gp.types';
import { type Crossings, type ScanOptions, scanCrossings } from './crossings';
import {
  SatelliteDataError,
  elementsFor,
  isSunlit,
  observerGeodetic,
  satelliteFix,
  satrecFor,
  sunForSatellites,
} from './providers/satellite';
import type { Availability } from './availability';
import type { TargetDef } from './target.types';

/** Satellite settings for the generic crossing scan: 10 degree horizon, 20 s steps, 24 h, 1 s bisection. */
export const SATELLITE_SCAN: ScanOptions = {
  horizonDeg: 10,
  stepMs: 20_000,
  windowMs: 24 * 3_600_000,
  resolutionMs: 1000,
};

/** A pass is visible only when the sky is at least this dark (Sun altitude below it). */
export const VISIBLE_SUN_BELOW_DEG = -6;
const VISIBILITY_STEP_MS = 10_000;
/** The Sun barely moves during a pass; above this at both ends, the sky is too bright all through. */
const OBVIOUS_DAYLIGHT_DEG = -3;

export interface SatellitePass {
  start: Date;
  end: Date;
  maxElevationDeg: number;
  maxAt: Date;
  /** Sunlit, above the horizon limit and in a dark enough sky at some point. */
  visible: boolean;
  /** The pass began before the search window did (it is under way at `now`). */
  ongoing: boolean;
}

/** What the visibility test needs to know about the sky and the satellite, as functions of time. */
export interface PassProbes {
  elevationAt: (ms: number) => number;
  sunlitAt: (ms: number) => boolean;
  sunAltitudeAt: (ms: number) => number;
}

/** [start, end] intervals above the horizon limit, from a crossing scan. */
export function passIntervals(
  c: Crossings,
  from: Date,
  windowEnd: Date,
): { start: Date; end: Date; ongoing: boolean }[] {
  const out: { start: Date; end: Date; ongoing: boolean }[] = [];
  const firstRise = c.rises[0]?.getTime() ?? Infinity;
  const firstSet = c.sets[0]?.getTime() ?? Infinity;
  if (c.alwaysUp) return [{ start: from, end: windowEnd, ongoing: true }];
  if (firstSet < firstRise) out.push({ start: from, end: c.sets[0], ongoing: true });
  for (const rise of c.rises) {
    const set = c.sets.find((s) => s.getTime() > rise.getTime());
    out.push({ start: rise, end: set ?? windowEnd, ongoing: false });
  }
  return out;
}

/** Peak of a single-peaked elevation curve between two times (ternary search). */
export function peakElevation(
  elevationAt: (ms: number) => number,
  startMs: number,
  endMs: number,
): { ms: number; elevationDeg: number } {
  let lo = startMs;
  let hi = endMs;
  for (let i = 0; i < 30 && hi - lo > 500; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (elevationAt(m1) < elevationAt(m2)) lo = m1;
    else hi = m2;
  }
  const ms = Math.round((lo + hi) / 2);
  return { ms, elevationDeg: elevationAt(ms) };
}

/**
 * Visible iff, at some moment of the pass, the satellite is sunlit, above `minElevationDeg` and the Sun
 * is below -6 degrees. Sampled every 10 s.
 */
export function isPassVisible(
  startMs: number,
  endMs: number,
  probes: PassProbes,
  minElevationDeg = SATELLITE_SCAN.horizonDeg,
): boolean {
  if (
    probes.sunAltitudeAt(startMs) > OBVIOUS_DAYLIGHT_DEG &&
    probes.sunAltitudeAt(endMs) > OBVIOUS_DAYLIGHT_DEG
  ) {
    return false;
  }
  for (let t = startMs; t <= endMs; t += VISIBILITY_STEP_MS) {
    if (
      probes.elevationAt(t) > minElevationDeg &&
      probes.sunAltitudeAt(t) < VISIBLE_SUN_BELOW_DEG &&
      probes.sunlitAt(t)
    ) {
      return true;
    }
  }
  return false;
}

/** Passes in the window, with `visible` filled in for each pass up to (and including) the first visible one. */
export function findPasses(
  crossings: Crossings,
  from: Date,
  windowEnd: Date,
  probes: PassProbes,
): SatellitePass[] {
  const passes: SatellitePass[] = [];
  let foundVisible = false;
  for (const iv of passIntervals(crossings, from, windowEnd)) {
    const s = iv.start.getTime();
    const e = iv.end.getTime();
    const peak = peakElevation(probes.elevationAt, s, e);
    // Later passes than the first visible one are not needed: skip their sun/shadow work.
    const visible = foundVisible ? false : isPassVisible(s, e, probes);
    // The pass under way does not count as "next", so keep looking after it.
    if (visible && !iv.ongoing) foundVisible = true;
    passes.push({
      start: iv.start,
      end: iv.end,
      maxElevationDeg: peak.elevationDeg,
      maxAt: new Date(peak.ms),
      visible,
      ongoing: iv.ongoing,
    });
  }
  return passes;
}

/** Probes for a real satellite: SGP4 for elevation and shadow, astronomy-engine for the Sun (20 s cache). */
export function satelliteProbes(
  def: TargetDef,
  pos: GeoPosition,
  elements: SatelliteElements,
): PassProbes {
  const satrec = satrecFor(elementsFor(def, elements));
  const observer = observerGeodetic(pos);
  let cachedBucket = NaN;
  let cachedSun = sunForSatellites(new Date(0), pos);
  const sunAt = (ms: number) => {
    const bucket = Math.floor(ms / 20_000);
    if (bucket !== cachedBucket) {
      cachedBucket = bucket;
      cachedSun = sunForSatellites(new Date(bucket * 20_000 + 10_000), pos);
    }
    return cachedSun;
  };
  return {
    elevationAt: (ms) => satelliteFix(satrec, new Date(ms), observer).elevationDeg,
    sunlitAt: (ms) => isSunlit(satelliteFix(satrec, new Date(ms), observer).eci, sunAt(ms).unit),
    sunAltitudeAt: (ms) => sunAt(ms).altitudeDeg,
  };
}

/** Availability of a satellite: its current state plus the pass search. Pure. */
export function computeSatelliteAvailability(
  def: TargetDef,
  now: Date,
  pos: GeoPosition,
  elements: SatelliteElements | undefined,
  scan: Partial<ScanOptions> = {},
): Availability {
  const base: Availability = {
    targetId: def.id,
    computedAt: now,
    altitudeDeg: -90,
    magnitude: null,
    visibility: 'below-horizon',
    low: false,
    nextRise: null,
    nextSet: null,
    alwaysUp: false,
    neverUp: false,
    neverRisesHere: false,
  };
  let probes: PassProbes;
  let omm;
  try {
    omm = elementsFor(def, elements);
    probes = satelliteProbes(def, pos, elements!);
  } catch (e) {
    if (e instanceof SatelliteDataError) return { ...base, orbitDataUnavailable: true };
    throw e;
  }

  const opts = { ...SATELLITE_SCAN, ...scan };
  const t0 = now.getTime();
  const windowEnd = new Date(t0 + opts.windowMs);
  let crossings: Crossings;
  let passes: SatellitePass[];
  let elevationNow: number;
  let sunlitNow: boolean;
  let sunAltNow: number;
  try {
    crossings = scanCrossings((d) => probes.elevationAt(d.getTime()), now, opts);
    passes = findPasses(crossings, now, windowEnd, probes);
    elevationNow = probes.elevationAt(t0);
    sunlitNow = probes.sunlitAt(t0);
    sunAltNow = probes.sunAltitudeAt(t0);
  } catch (e) {
    if (e instanceof SatelliteDataError) return { ...base, orbitDataUnavailable: true };
    throw e;
  }

  const currentPass = passes.find((p) => p.ongoing) ?? null;
  const nextVisiblePass = passes.find((p) => p.visible && !p.ongoing) ?? null;
  const visibleNow = currentPass !== null && sunlitNow && sunAltNow < VISIBLE_SUN_BELOW_DEG;
  const up = elevationNow > 0;
  const age = ageFlags(omm, now);
  return {
    ...base,
    altitudeDeg: elevationNow,
    magnitude: sunlitNow ? def.satellite!.magnitude : null,
    // 'up-visible' for a satellite means "overhead now and you can see it": it is what "Best right now" needs.
    visibility: !up
      ? 'below-horizon'
      : visibleNow
        ? 'up-visible'
        : sunlitNow
          ? 'up-daylight'
          : 'up-too-faint',
    low: up && elevationNow < SATELLITE_SCAN.horizonDeg,
    nextRise: crossings.rises[0] ?? null,
    nextSet: crossings.sets[0] ?? null,
    currentPass,
    nextVisiblePass,
    visibleNow,
    orbitAgeDays: age.ageDays,
    orbitStale: age.stale,
  };
}
