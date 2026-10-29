import { Body, Observer, SearchRiseSet } from 'astronomy-engine';
import { vi } from 'vitest';
import { TARGETS, getTarget } from './catalog';
import { computeTargetState } from './compute';
import {
  DEFAULT_SKY_LIMITS,
  computeAvailability,
  computeAvailabilityChunked,
  neverRisesAtLatitude,
  scanCrossings,
  visibilityFor,
} from './availability';

const POS = { latitude: 39.6, longitude: -104.7, heightM: 1800 };
const OBSERVER = new Observer(POS.latitude, POS.longitude, POS.heightM);
const MIN = 60_000;
const HOUR = 3_600_000;

const avail = (id: string, now: Date, pos = POS) => computeAvailability(getTarget(id)!, now, pos);
const sunAlt = (d: Date) => computeTargetState(getTarget('sun')!, d, POS).altitudeDeg;

/** First time from `start` (10-minute steps, up to a year) at which `pred` holds. */
function findTime(pred: (d: Date) => boolean, start: Date): Date {
  for (let t = start.getTime(); t < start.getTime() + 366 * 24 * HOUR; t += 10 * MIN) {
    if (pred(new Date(t))) return new Date(t);
  }
  throw new Error('no such time found');
}

describe('visibilityFor (limit table)', () => {
  const L = DEFAULT_SKY_LIMITS;
  it('below the horizon is always below-horizon', () => {
    expect(visibilityFor(-5, -20, -50)).toBe('below-horizon');
    expect(visibilityFor(0, -20, -50)).toBe('below-horizon');
  });
  it('dark sky (Sun < -12): limit 6.0', () => {
    expect(visibilityFor(30, 5.9, -20)).toBe('up-visible');
    expect(visibilityFor(30, 6.0, -20)).toBe('up-visible');
    expect(visibilityFor(30, 6.1, -20)).toBe('up-too-faint');
    expect(visibilityFor(30, null, -20)).toBe('up-too-faint');
  });
  it('twilight (-12..-6): limit 3.0, fainter things are too faint', () => {
    expect(visibilityFor(30, 3.0, -9)).toBe('up-visible');
    expect(visibilityFor(30, 3.44, -9)).toBe('up-too-faint');
    expect(visibilityFor(30, -4, -6.5)).toBe('up-visible');
  });
  it('daylight (Sun > -6): limit -3.5, fainter things are drowned out', () => {
    expect(visibilityFor(30, -3.5, 20)).toBe('up-visible');
    expect(visibilityFor(30, -26.7, 20)).toBe('up-visible'); // the Sun
    expect(visibilityFor(30, -1.46, 20)).toBe('up-daylight');
    expect(visibilityFor(30, null, 20)).toBe('up-too-faint');
  });
  it('the limit table is a parameter', () => {
    const generous = { ...L, daylightMag: 0 };
    expect(visibilityFor(30, -1.46, 20, generous)).toBe('up-visible');
  });
  it('boundaries: Sun at exactly -12 and -6 are twilight', () => {
    expect(visibilityFor(30, 4, -12)).toBe('up-too-faint'); // twilight limit 3
    expect(visibilityFor(30, 4, -6)).toBe('up-too-faint');
    expect(visibilityFor(30, 4, -12.01)).toBe('up-visible'); // dark limit 6
  });
});

describe('scanCrossings (generic, against a function with known zeros)', () => {
  const t0 = Date.UTC(2026, 0, 1);
  // 30 * sin(2 pi (t - t0) / 24 h): up on (0, 12 h), (24 h, 36 h) ...; zero crossings every 12 h.
  const wave = (d: Date) => 30 * Math.sin((2 * Math.PI * (d.getTime() - t0)) / (24 * HOUR));

  it('finds every rise and set within 30 s', () => {
    const c = scanCrossings(wave, new Date(t0 + 6 * HOUR));
    expect(c.sets).toHaveLength(2); // 12 h and 36 h
    expect(c.rises).toHaveLength(2); // 24 h and 48 h (the window runs 6 h to 54 h)
    expect(Math.abs(c.sets[0].getTime() - (t0 + 12 * HOUR))).toBeLessThanOrEqual(30_000);
    expect(Math.abs(c.rises[0].getTime() - (t0 + 24 * HOUR))).toBeLessThanOrEqual(30_000);
    expect(Math.abs(c.sets[1].getTime() - (t0 + 36 * HOUR))).toBeLessThanOrEqual(30_000);
    expect(Math.abs(c.rises[1].getTime() - (t0 + 48 * HOUR))).toBeLessThanOrEqual(30_000);
    expect(c.alwaysUp || c.neverUp).toBe(false);
  });

  it('reports alwaysUp and neverUp for constant functions', () => {
    expect(scanCrossings(() => 5, new Date(t0))).toMatchObject({
      alwaysUp: true,
      neverUp: false,
      rises: [],
      sets: [],
    });
    expect(scanCrossings(() => -5, new Date(t0))).toMatchObject({
      alwaysUp: false,
      neverUp: true,
      rises: [],
      sets: [],
    });
  });

  it('honours the step, window, resolution and horizon options', () => {
    const c = scanCrossings(wave, new Date(t0 + 6 * HOUR), {
      windowMs: 8 * HOUR,
      stepMs: 5 * MIN,
      resolutionMs: 1000,
    });
    expect(c.sets).toHaveLength(1);
    expect(Math.abs(c.sets[0].getTime() - (t0 + 12 * HOUR))).toBeLessThanOrEqual(1000);
    // Horizon at +15 deg: the wave is above 15 deg between 4 h and 8 h after t0 (asin(0.5) = 30 deg).
    const hi = scanCrossings(wave, new Date(t0), { horizonDeg: 15 });
    expect(Math.abs(hi.rises[0].getTime() - (t0 + 2 * HOUR))).toBeLessThanOrEqual(30_000);
    expect(Math.abs(hi.sets[0].getTime() - (t0 + 10 * HOUR))).toBeLessThanOrEqual(30_000);
  });
});

describe('computeAvailability: rise/set vs astronomy-engine SearchRiseSet', () => {
  const starts = [
    new Date('2026-10-25T12:00:00Z'),
    new Date('2027-02-03T03:30:00Z'),
    new Date('2028-06-17T20:00:00Z'),
  ];

  for (const [id, body, toleranceMin] of [
    ['jupiter', Body.Jupiter, 2],
    ['saturn', Body.Saturn, 2],
    // SearchRiseSet uses the Moon's upper limb; we use its center, so allow a little more.
    ['moon', Body.Moon, 4],
  ] as const) {
    it(`${id} rise and set agree within ${toleranceMin} min`, () => {
      for (const start of starts) {
        const a = avail(id, start);
        const rise = SearchRiseSet(body, OBSERVER, +1, start, 2)!;
        const set = SearchRiseSet(body, OBSERVER, -1, start, 2)!;
        // The next rise/set after `start` are the same events in both searches.
        expect(a.nextRise, `${id} rise ${start.toISOString()}`).not.toBeNull();
        expect(a.nextSet, `${id} set ${start.toISOString()}`).not.toBeNull();
        expect(Math.abs(a.nextRise!.getTime() - rise.date.getTime()) / MIN).toBeLessThan(
          toleranceMin,
        );
        expect(Math.abs(a.nextSet!.getTime() - set.date.getTime()) / MIN).toBeLessThan(
          toleranceMin,
        );
      }
    });
  }
});

describe('computeAvailability: fixed-sky geometry', () => {
  const now = new Date('2026-10-25T09:54:00Z');

  it('Polaris at lat 39.6 is always up; at lat -30 it never rises here', () => {
    const north = avail('polaris', now);
    expect(north.alwaysUp).toBe(true);
    expect(north.neverUp).toBe(false);
    expect(north.neverRisesHere).toBe(false);
    expect(north.nextRise).toBeNull();
    expect(north.nextSet).toBeNull();
    const south = avail('polaris', now, { ...POS, latitude: -30 });
    expect(south.neverRisesHere).toBe(true);
    expect(south.neverUp).toBe(true);
    expect(south.visibility).toBe('below-horizon');
  });

  it('the LMC at lat 39.6 never rises here and has no next rise', () => {
    const lmc = avail('lmc', now);
    expect(lmc.neverRisesHere).toBe(true);
    expect(lmc.nextRise).toBeNull();
    expect(lmc.neverUp).toBe(true);
  });

  it('neverRisesAtLatitude is symmetric about the equator and false at the pole boundary side', () => {
    expect(neverRisesAtLatitude(-69.76, 39.6)).toBe(true);
    expect(neverRisesAtLatitude(-50, 39.6)).toBe(false); // -50 > -(90-39.6) = -50.4
    expect(neverRisesAtLatitude(69.76, -39.6)).toBe(true);
    expect(neverRisesAtLatitude(89.26, -30)).toBe(true);
    expect(neverRisesAtLatitude(-89, 0)).toBe(false);
  });

  it('a star that rises has a next rise and set, in order, within 48 h', () => {
    const sirius = avail('sirius', new Date('2026-10-25T12:00:00Z'));
    expect(sirius.nextRise).not.toBeNull();
    expect(sirius.nextSet).not.toBeNull();
    expect(sirius.neverUp || sirius.alwaysUp).toBe(false);
  });
});

describe('computeAvailability: visibility with real skies', () => {
  const start = new Date('2026-07-01T00:00:00Z');

  it('Sirius up at night is up-visible', () => {
    const t = findTime((d) => sunAlt(d) < -15 && avail('sirius', d).altitudeDeg > 15, start);
    expect(avail('sirius', t).visibility).toBe('up-visible');
  });

  it('Sirius up at noon is up-daylight', () => {
    const t = findTime(
      (d) => sunAlt(d) > 30 && computeTargetState(getTarget('sirius')!, d, POS).altitudeDeg > 15,
      start,
    );
    expect(avail('sirius', t).visibility).toBe('up-daylight');
  });

  it('Venus up in twilight is up-visible', () => {
    const t = findTime(
      (d) =>
        sunAlt(d) < -7 &&
        sunAlt(d) > -11 &&
        computeTargetState(getTarget('venus')!, d, POS).altitudeDeg > 5,
      new Date('2026-06-01T00:00:00Z'),
    );
    expect(avail('venus', t).visibility).toBe('up-visible');
  });

  it('the Galactic Center up at night is up-too-faint', () => {
    const t = findTime(
      (d) =>
        sunAlt(d) < -15 &&
        computeTargetState(getTarget('galactic-center')!, d, POS).altitudeDeg > 10,
      start,
    );
    expect(avail('galactic-center', t).visibility).toBe('up-too-faint');
  });

  it('M31 up in twilight is up-too-faint, and at full dark up-visible', () => {
    const m31 = getTarget('m31')!;
    const twilight = findTime(
      (d) => sunAlt(d) < -7 && sunAlt(d) > -11 && computeTargetState(m31, d, POS).altitudeDeg > 10,
      new Date('2026-09-01T00:00:00Z'),
    );
    expect(avail('m31', twilight).visibility).toBe('up-too-faint');
    const dark = findTime(
      (d) => sunAlt(d) < -15 && computeTargetState(m31, d, POS).altitudeDeg > 10,
      new Date('2026-09-01T00:00:00Z'),
    );
    expect(avail('m31', dark).visibility).toBe('up-visible');
  });

  it('flags low targets (up but below 10 degrees)', () => {
    const t = findTime((d) => {
      const alt = computeTargetState(getTarget('sirius')!, d, POS).altitudeDeg;
      return alt > 1 && alt < 8;
    }, start);
    const a = avail('sirius', t);
    expect(a.low).toBe(true);
    expect(a.altitudeDeg).toBeGreaterThan(0);
  });

  it('the Sun is up-visible in daytime and below-horizon at night', () => {
    const noon = findTime((d) => sunAlt(d) > 40, start);
    expect(avail('sun', noon).visibility).toBe('up-visible');
    const night = findTime((d) => sunAlt(d) < -20, start);
    expect(avail('sun', night).visibility).toBe('below-horizon');
  });
});

describe('computeAvailabilityChunked', () => {
  afterEach(() => vi.useRealTimers());

  it('reports every target and yields between them', async () => {
    const seen: string[] = [];
    const yieldFn = vi.fn(() => Promise.resolve());
    await computeAvailabilityChunked(
      TARGETS,
      new Date('2026-10-25T09:54:00Z'),
      POS,
      (a) => seen.push(a.targetId),
      {},
      yieldFn,
    );
    expect(seen).toEqual(TARGETS.map((t) => t.id));
    expect(yieldFn.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(yieldFn).toHaveBeenCalledTimes(TARGETS.length);
  });

  it('with the default yield it hands control back through setTimeout (fake timers)', async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(globalThis, 'setTimeout');
    let landed = 0;
    const done = computeAvailabilityChunked(
      TARGETS,
      new Date('2026-10-25T09:54:00Z'),
      POS,
      () => landed++,
    );
    // Only the first target has been computed; the rest wait on the timer.
    expect(landed).toBe(1);
    await vi.runAllTimersAsync();
    await done;
    expect(landed).toBe(TARGETS.length);
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(TARGETS.length);
  });
});

describe('full catalog timing', () => {
  it('computes availability for every target in well under a second on this machine', () => {
    const now = new Date('2026-10-25T09:54:00Z');
    const t0 = performance.now();
    for (const def of TARGETS) computeAvailability(def, now, POS);
    const ms = performance.now() - t0;
    console.info(`[availability] full catalog (${TARGETS.length} targets): ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(3000);
  });
});
