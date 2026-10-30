import { FIXTURE_ELEMENTS } from '../gp/testing/gp-fixture';
import { getTarget } from './catalog';
import { computeTargetState } from './compute';
import { LIGHT_KM_PER_S, formatLightTime, formatLightYears, liveStats } from './live-stats';

const POS = { latitude: 39.6, longitude: -104.7, heightM: 1800 };
const WEEK = 7 * 86_400_000;
const stats = (id: string, date: Date, locale = 'en-US') => {
  const def = getTarget(id)!;
  const state = computeTargetState(def, date, POS, FIXTURE_ELEMENTS);
  return liveStats(def, state, date, { locale, elements: FIXTURE_ELEMENTS });
};
const row = (rows: { label: string; value: string }[], label: string) =>
  rows.find((r) => r.label === label)?.value;
const firstNumber = (s: string) => Number(s.replace(/,/g, '').match(/[\d.]+/)![0]);

describe('liveStats', () => {
  it('Moon distance stays within 356,000-407,000 km over 2026-2027 (weekly samples)', () => {
    const start = Date.UTC(2026, 0, 1);
    let min = Infinity;
    let max = 0;
    for (let t = start; t < Date.UTC(2028, 0, 1); t += WEEK) {
      const km = firstNumber(row(stats('moon', new Date(t)), 'Distance right now')!);
      min = Math.min(min, km);
      max = Math.max(max, km);
    }
    expect(min).toBeGreaterThanOrEqual(356_000);
    expect(max).toBeLessThanOrEqual(407_000);
  });

  it('Moon light time is distance / c, about 1.2-1.4 seconds', () => {
    const rows = stats('moon', new Date('2026-10-26T03:00:00Z'));
    const km = firstNumber(row(rows, 'Distance right now')!);
    const seconds = firstNumber(row(rows, 'Light takes')!);
    expect(row(rows, 'Light takes')).toMatch(/seconds$/);
    expect(seconds).toBeCloseTo(km / LIGHT_KM_PER_S, 0);
    expect(seconds).toBeGreaterThan(1.1);
    expect(seconds).toBeLessThan(1.5);
  });

  it('Venus light time stays within 2-15 minutes over a year', () => {
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += WEEK) {
      const rows = stats('venus', new Date(t));
      const v = row(rows, 'Light takes')!;
      expect(v, v).toMatch(/minutes$/);
      const minutes = firstNumber(v);
      expect(minutes).toBeGreaterThanOrEqual(2);
      expect(minutes).toBeLessThanOrEqual(15);
    }
  });

  it('planets and the Sun: millions of km with AU; planets get brightness, the Sun does not', () => {
    const d = new Date('2026-10-26T15:00:00Z');
    expect(row(stats('jupiter', d), 'Distance right now')).toMatch(
      /^\d[\d.,]* million km \(\d\.\d AU\)$/,
    );
    expect(row(stats('jupiter', d), 'Brightness')).toMatch(/^magnitude -?\d\.\d$/);
    expect(row(stats('neptune', d), 'Light takes')).toMatch(/hours$/);
    const sun = stats('sun', d);
    expect(row(sun, 'Distance right now')).toMatch(/million km \(1\.0 AU\)$/);
    expect(row(sun, 'Light takes')).toMatch(/^8\.\d minutes$/);
    expect(row(sun, 'Brightness')).toBeUndefined();
  });

  it('ISS height stays within 370-460 km and speed near 7.66 km/s for +-1 day from the epoch', () => {
    const epoch = Date.parse('2026-10-28T14:18:15Z');
    for (let h = -24; h <= 24; h += 3) {
      const rows = stats('iss', new Date(epoch + h * 3_600_000));
      const height = firstNumber(row(rows, 'Height')!);
      const speed = firstNumber(row(rows, 'Speed')!);
      expect(height, `${h}h`).toBeGreaterThanOrEqual(370);
      expect(height, `${h}h`).toBeLessThanOrEqual(460);
      expect(speed, `${h}h`).toBeGreaterThan(7.5);
      expect(speed, `${h}h`).toBeLessThan(7.8);
      expect(['Yes', 'No']).toContain(row(rows, 'Sunlit'));
    }
  });

  it('a satellite without orbit data still gets Sunlit-free, safe output (no height or speed rows)', () => {
    const def = getTarget('iss')!;
    const date = new Date('2026-10-28T20:00:00Z');
    const state = computeTargetState(def, date, POS, FIXTURE_ELEMENTS);
    const rows = liveStats(def, state, date, { locale: 'en-US' });
    expect(row(rows, 'Height')).toBeUndefined();
    expect(row(rows, 'Speed')).toBeUndefined();
    expect(row(rows, 'Up from here')).toBeDefined();
  });

  it('stars and deep sky: distance in light-years and how long ago the light left', () => {
    const d = new Date('2026-10-26T03:00:00Z');
    let rows = stats('sirius', d);
    expect(row(rows, 'Distance')).toBe('about 8.6 light-years');
    expect(row(rows, "Light you're seeing left it")).toBe('about 8.6 years ago');
    rows = stats('m31', d);
    expect(row(rows, 'Distance')).toBe('about 2.5 million light-years');
    expect(row(rows, "Light you're seeing left it")).toBe('about 2.5 million years ago');
    rows = stats('galactic-center', d);
    expect(row(rows, 'Distance')).toBe('about 26,000 light-years');
    rows = stats('betelgeuse', d);
    expect(row(rows, 'Distance')).toBe("about 550 light-years, but it's uncertain");
    expect(row(rows, "Light you're seeing left it")).toBe('about 550 years ago (roughly)');
  });

  it('everything says whether it is up from here, with the altitude', () => {
    for (const id of ['moon', 'jupiter', 'sirius', 'iss']) {
      const def = getTarget(id)!;
      const date = new Date('2026-10-26T03:00:00Z');
      const state = computeTargetState(def, date, POS, FIXTURE_ELEMENTS);
      const v = row(
        liveStats(def, state, date, { locale: 'en-US', elements: FIXTURE_ELEMENTS }),
        'Up from here',
      )!;
      expect(v).toBe(
        state.altitudeDeg > 0
          ? `${Math.round(state.altitudeDeg)}° above the horizon`
          : 'Below the horizon',
      );
    }
  });

  it('uses the locale for numbers', () => {
    const d = new Date('2026-10-26T03:00:00Z');
    expect(row(stats('galactic-center', d, 'de-DE'), 'Distance')).toBe('about 26.000 light-years');
    expect(row(stats('sirius', d, 'de-DE'), 'Distance')).toBe('about 8,6 light-years');
    expect(row(stats('moon', d, 'de-DE'), 'Distance right now')).toMatch(/^\d{3}\.\d{3} km$/);
  });
});

describe('formatting', () => {
  it('light-years: decimals under 100, whole numbers above, "million" from a million', () => {
    expect(formatLightYears(8.6, 'en-US')).toBe('8.6');
    expect(formatLightYears(25, 'en-US')).toBe('25');
    expect(formatLightYears(430, 'en-US')).toBe('430');
    expect(formatLightYears(1350, 'en-US')).toBe('1,350');
    expect(formatLightYears(160_000, 'en-US')).toBe('160,000');
    expect(formatLightYears(2_500_000, 'en-US')).toBe('2.5 million');
    expect(formatLightYears(1_000_000, 'en-US')).toBe('1 million');
  });

  it('light time: seconds, minutes, hours', () => {
    expect(formatLightTime(1.28, 'en-US')).toBe('1.3 seconds');
    expect(formatLightTime(499, 'en-US')).toBe('8.3 minutes');
    expect(formatLightTime(14_500, 'en-US')).toBe('4 hours');
  });
});
