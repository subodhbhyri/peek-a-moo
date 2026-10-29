/** Generic horizon-crossing search, shared by the target availability and the satellite pass search. */

export interface ScanOptions {
  /** Sampling step. Default 20 min; Phase 6 passes a smaller one for satellites. */
  stepMs: number;
  /** How far ahead to look. Default 48 h. */
  windowMs: number;
  /** Bisection resolution for each crossing. Default 30 s. */
  resolutionMs: number;
  /** "Up" means altitude above this. Default 0 (apparent horizon). */
  horizonDeg: number;
}

export const DEFAULT_SCAN: ScanOptions = {
  stepMs: 20 * 60_000,
  windowMs: 48 * 3_600_000,
  resolutionMs: 30_000,
  horizonDeg: 0,
};

export interface Crossings {
  rises: Date[];
  sets: Date[];
  /** Up at every sample (and so at the start). */
  alwaysUp: boolean;
  /** Down at every sample. */
  neverUp: boolean;
}

/**
 * Generic horizon-crossing search for any altitude function: sample every `stepMs` over `windowMs`,
 * then bisect each sign change down to `resolutionMs`. No per-kind special cases.
 */
export function scanCrossings(
  altitudeAt: (d: Date) => number,
  from: Date,
  opts: Partial<ScanOptions> = {},
): Crossings {
  const o = { ...DEFAULT_SCAN, ...opts };
  const isUp = (ms: number) => altitudeAt(new Date(ms)) > o.horizonDeg;
  const start = from.getTime();
  const steps = Math.ceil(o.windowMs / o.stepMs);
  const rises: Date[] = [];
  const sets: Date[] = [];
  let prevMs = start;
  let prevUp = isUp(start);
  let anyUp = prevUp;
  let anyDown = !prevUp;

  for (let i = 1; i <= steps; i++) {
    const ms = Math.min(start + i * o.stepMs, start + o.windowMs);
    const up = isUp(ms);
    if (up) anyUp = true;
    else anyDown = true;
    if (up !== prevUp) {
      // Narrow [lo, hi] until it is within the resolution; hi is on the new side.
      let lo = prevMs;
      let hi = ms;
      while (hi - lo > o.resolutionMs) {
        const mid = Math.floor((lo + hi) / 2);
        if (isUp(mid) === up) hi = mid;
        else lo = mid;
      }
      (up ? rises : sets).push(new Date(hi));
    }
    prevMs = ms;
    prevUp = up;
  }
  return { rises, sets, alwaysUp: !anyDown, neverUp: !anyUp };
}
