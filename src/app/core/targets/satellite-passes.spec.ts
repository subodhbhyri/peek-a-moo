import { FIXTURE_ELEMENTS } from '../gp/testing/gp-fixture';
import { scanCrossings } from './crossings';
import { getTarget } from './catalog';
import { computeAvailability } from './availability';
import { satelliteTargetState } from './providers/satellite';
import {
  type PassProbes,
  SATELLITE_SCAN,
  computeSatelliteAvailability,
  findPasses,
  isPassVisible,
  passIntervals,
  peakElevation,
} from './satellite-passes';

const POS = { latitude: 39.6, longitude: -104.7, heightM: 1800 };
const MIN = 60_000;
const H = 3_600_000;

describe('pass detection on a synthetic altitude function', () => {
  // elevation(t) = 50 sin(2 pi t / P): above 10 degrees when sin > 0.2.
  const P = 90 * MIN;
  const T0 = Date.UTC(2026, 9, 28, 0, 0, 0);
  const elevationAt = (ms: number) => 50 * Math.sin((2 * Math.PI * (ms - T0)) / P);
  const rise1 = T0 + (P * Math.asin(0.2)) / (2 * Math.PI);
  const set1 = T0 + P / 2 - (rise1 - T0);
  const peak1 = T0 + P / 4;

  const crossings = (from: Date) =>
    scanCrossings((d) => elevationAt(d.getTime()), from, SATELLITE_SCAN);
  const allSky: PassProbes = {
    elevationAt,
    sunlitAt: () => true,
    sunAltitudeAt: () => -30,
  };

  it('finds rise, maximum and set to within a second or two', () => {
    const from = new Date(T0 - 5 * MIN); // before the first rise (below the horizon limit)
    // Start just before T0, when sin < 0.2 so we are "down".
    const windowEnd = new Date(from.getTime() + 24 * H);
    const passes = findPasses(crossings(from), from, windowEnd, allSky);
    expect(passes.length).toBeGreaterThanOrEqual(15);
    const first = passes[0];
    expect(Math.abs(first.start.getTime() - rise1)).toBeLessThanOrEqual(1500);
    expect(Math.abs(first.end.getTime() - set1)).toBeLessThanOrEqual(1500);
    expect(Math.abs(first.maxAt.getTime() - peak1)).toBeLessThan(2000);
    expect(first.maxElevationDeg).toBeCloseTo(50, 1);
    expect(first.ongoing).toBe(false);
  });

  it('a pass already under way at the start is marked ongoing and ends at the set', () => {
    const from = new Date(peak1); // overhead right now
    const windowEnd = new Date(from.getTime() + 24 * H);
    const iv = passIntervals(crossings(from), from, windowEnd);
    expect(iv[0].ongoing).toBe(true);
    expect(iv[0].start).toEqual(from);
    expect(Math.abs(iv[0].end.getTime() - set1)).toBeLessThanOrEqual(1500);
    expect(iv[1].ongoing).toBe(false);
  });

  it('never below the limit: no passes; always above: one ongoing pass to the end of the window', () => {
    const from = new Date(T0);
    const end = new Date(from.getTime() + 24 * H);
    const down = scanCrossings(() => 0, from, SATELLITE_SCAN);
    expect(passIntervals(down, from, end)).toEqual([]);
    const up = scanCrossings(() => 80, from, SATELLITE_SCAN);
    expect(passIntervals(up, from, end)).toEqual([{ start: from, end, ongoing: true }]);
  });

  it('peakElevation finds the top of a single-peaked curve', () => {
    const peak = peakElevation(elevationAt, rise1, set1);
    expect(Math.abs(peak.ms - peak1)).toBeLessThan(1000);
    expect(peak.elevationDeg).toBeCloseTo(50, 2);
  });

  it('classifies only up to the first visible upcoming pass', () => {
    const from = new Date(T0 - 5 * MIN);
    const windowEnd = new Date(from.getTime() + 24 * H);
    const passes = findPasses(crossings(from), from, windowEnd, allSky);
    expect(passes[0].visible).toBe(true);
    expect(passes.slice(1).every((p) => !p.visible)).toBe(true);
  });

  it('the pass under way does not hide the next visible one', () => {
    const from = new Date(peak1);
    const windowEnd = new Date(from.getTime() + 24 * H);
    const passes = findPasses(crossings(from), from, windowEnd, allSky);
    expect(passes[0].ongoing && passes[0].visible).toBe(true);
    expect(passes[1].visible).toBe(true);
    expect(passes[2].visible).toBe(false);
  });
});

describe('visibility classification', () => {
  const S = 0;
  const E = 10 * MIN;
  const probes = (over: Partial<PassProbes> = {}): PassProbes => ({
    elevationAt: () => 45,
    sunlitAt: () => true,
    sunAltitudeAt: () => -20,
    ...over,
  });

  it('sunlit + above 10 degrees + Sun below -6: visible', () => {
    expect(isPassVisible(S, E, probes())).toBe(true);
  });
  it('in Earth shadow the whole pass: not visible', () => {
    expect(isPassVisible(S, E, probes({ sunlitAt: () => false }))).toBe(false);
  });
  it('daylight (Sun above -6): not visible', () => {
    expect(isPassVisible(S, E, probes({ sunAltitudeAt: () => 10 }))).toBe(false);
    expect(isPassVisible(S, E, probes({ sunAltitudeAt: () => -5 }))).toBe(false);
  });
  it('never above 10 degrees: not visible', () => {
    expect(isPassVisible(S, E, probes({ elevationAt: () => 9 }))).toBe(false);
  });
  it('at some point is enough: sunlit only in the second half', () => {
    expect(isPassVisible(S, E, probes({ sunlitAt: (t) => t > 5 * MIN }))).toBe(true);
  });
  it('the conditions must hold at the same moment', () => {
    // Sunlit in the first half, high only in the second half.
    expect(
      isPassVisible(
        S,
        E,
        probes({ sunlitAt: (t) => t < 5 * MIN, elevationAt: (t) => (t < 5 * MIN ? 5 : 45) }),
      ),
    ).toBe(false);
  });
  it('the Sun crossing -6 mid-pass counts once it is dark enough', () => {
    expect(isPassVisible(S, E, probes({ sunAltitudeAt: (t) => -3 - (t / E) * 6 }))).toBe(true);
  });
});

describe('real satellites (fixture elements)', { timeout: 30_000 }, () => {
  const TIMES = [
    '2026-10-28T20:00:00Z',
    '2026-10-29T02:00:00Z',
    '2026-10-29T08:00:00Z',
    '2026-10-29T14:00:00Z',
  ];

  let comparedPasses = 0;
  for (const id of ['iss', 'tiangong', 'hubble']) {
    it(`${id}: the next visible pass is confirmed by a brute-force minute-by-minute search`, () => {
      const def = getTarget(id)!;
      for (const iso of TIMES) {
        const now = new Date(iso);
        const a = computeAvailability(def, now, POS, { elements: FIXTURE_ELEMENTS });
        // Independent oracle: the provider's own state (apparent altitude, sunlit, Sun altitude) per minute.
        let firstVisible: number | null = null;
        for (
          let t = now.getTime();
          t < now.getTime() + 24 * H && firstVisible === null;
          t += 30_000
        ) {
          const s = satelliteTargetState(def, new Date(t), POS, FIXTURE_ELEMENTS);
          if (s.altitudeDeg > 10.2 && s.satellite!.sunlit && s.sunAltitudeDeg! < -6.05) {
            firstVisible = t;
          }
        }
        // The overhead-now case is reported as currentPass; look beyond it.
        const next = a.nextVisiblePass;
        if (firstVisible === null) {
          expect(next, `${id} ${iso}`).toBeNull();
          continue;
        }
        const nowState = satelliteTargetState(def, now, POS, FIXTURE_ELEMENTS);
        if (a.currentPass && a.visibleNow && nowState.altitudeDeg > 10.2) continue; // first visible moment is now
        const target = a.currentPass ? (a.currentPass.visible ? a.currentPass : next) : next;
        expect(target, `${id} ${iso}`).not.toBeNull();
        comparedPasses++;
        expect(firstVisible, `${id} ${iso}`).toBeGreaterThanOrEqual(
          target!.start.getTime() - 60_000,
        );
        expect(firstVisible, `${id} ${iso}`).toBeLessThanOrEqual(target!.end.getTime() + 60_000);
        expect(target!.maxElevationDeg).toBeGreaterThan(10);
        expect(target!.end.getTime()).toBeGreaterThan(target!.start.getTime());
      }
    });
  }

  it('the brute-force comparison really compared passes (not just agreed on "none")', () => {
    expect(comparedPasses).toBeGreaterThanOrEqual(3);
  });

  it('describes the pass in progress and whether it can be seen', () => {
    const def = getTarget('iss')!;
    // Find a moment with the ISS above 10 degrees.
    let now: Date | null = null;
    for (let t = Date.UTC(2026, 9, 28, 20); t < Date.UTC(2026, 9, 30) && !now; t += 30_000) {
      const s = satelliteTargetState(def, new Date(t), POS, FIXTURE_ELEMENTS);
      if (s.altitudeDeg > 20) now = new Date(t);
    }
    expect(now).not.toBeNull();
    const a = computeAvailability(def, now!, POS, { elements: FIXTURE_ELEMENTS });
    expect(a.currentPass).not.toBeNull();
    expect(a.currentPass!.ongoing).toBe(true);
    expect(a.currentPass!.end.getTime()).toBeGreaterThan(now!.getTime());
    expect(a.altitudeDeg).toBeGreaterThan(10);
    expect(a.orbitAgeDays).toBeGreaterThan(0);
    expect(a.orbitStale).toBe(false);
    // Visible now == "up-visible" (what "Best right now" looks at).
    expect(a.visibility === 'up-visible').toBe(a.visibleNow);
  });

  it('without orbit data: orbitDataUnavailable, nothing else claimed', () => {
    const a = computeSatelliteAvailability(getTarget('iss')!, new Date(), POS, undefined);
    expect(a.orbitDataUnavailable).toBe(true);
    expect(a.nextVisiblePass).toBeUndefined();
    expect(a.currentPass).toBeUndefined();
  });

  it('a very old element set is reported as stale', () => {
    const a = computeAvailability(getTarget('iss')!, new Date('2026-12-01T00:00:00Z'), POS, {
      elements: FIXTURE_ELEMENTS,
    });
    expect(a.orbitStale).toBe(true);
    expect(a.orbitAgeDays!).toBeGreaterThan(14);
  });

  it('the 3-satellite pass scan stays well under a second (measured ~50 ms for all three; see phase6-report.md)', () => {
    const now = new Date('2026-10-28T20:00:00Z');
    const runs: number[] = [];
    for (let i = 0; i < 4; i++) {
      const t0 = performance.now();
      for (const id of ['iss', 'tiangong', 'hubble']) {
        computeAvailability(getTarget(id)!, now, POS, { elements: FIXTURE_ELEMENTS });
      }
      runs.push(Math.round(performance.now() - t0));
    }
    expect(Math.min(...runs)).toBeLessThan(1000);
  });
});
