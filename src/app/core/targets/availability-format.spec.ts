import type { Availability } from './availability';
import { formatAvailability, formatDuration, introNote, riseText } from './availability-format';
import { getTarget } from './catalog';

const LOCALE = 'en-US';
const TZ = 'America/Denver';
// 2026-10-26 08:00 in Denver (MDT, UTC-6) = 14:00Z. A Monday.
const NOW = new Date('2026-10-26T14:00:00Z');

function make(over: Partial<Availability> = {}): Availability {
  return {
    targetId: 'jupiter',
    computedAt: NOW,
    altitudeDeg: 40,
    magnitude: -2,
    visibility: 'up-visible',
    low: false,
    nextRise: null,
    nextSet: null,
    alwaysUp: false,
    neverUp: false,
    neverRisesHere: false,
    ...over,
  };
}
const below = (riseAt: Date | null, over: Partial<Availability> = {}) =>
  make({ visibility: 'below-horizon', altitudeDeg: -20, low: false, nextRise: riseAt, ...over });
const fmt = (a: Availability, id = 'jupiter') =>
  formatAvailability(a, NOW, LOCALE, { timeZone: TZ, def: getTarget(id)! });
const after = (ms: number) => new Date(NOW.getTime() + ms);
const H = 3_600_000;
const M = 60_000;

describe('formatAvailability: every row of the table', () => {
  it('up-visible, not low: "Up now" (good)', () => {
    expect(fmt(make())).toEqual({ label: 'Up now', tone: 'good' });
  });

  it('up-visible, low: "Up now · low in the sky" (good)', () => {
    expect(fmt(make({ low: true, altitudeDeg: 6 }))).toEqual({
      label: 'Up now · low in the sky',
      tone: 'good',
    });
  });

  it('up-daylight (meh)', () => {
    expect(fmt(make({ visibility: 'up-daylight' }))).toEqual({
      label: "Up, but the sky's too bright",
      tone: 'meh',
    });
  });

  it('up-too-faint (meh)', () => {
    expect(fmt(make({ visibility: 'up-too-faint' }))).toEqual({
      label: 'Up, but too faint to see',
      tone: 'meh',
    });
  });

  it('below, rises in under 12 h: "Rises in 3h 12m" (meh)', () => {
    expect(fmt(below(after(3 * H + 12 * M + 20_000)))).toEqual({
      label: 'Rises in 3h 12m',
      tone: 'meh',
    });
    expect(fmt(below(after(45 * M))).label).toBe('Rises in 45m');
    expect(fmt(below(after(11 * H + 59 * M))).label).toBe('Rises in 11h 59m');
  });

  it('below, rises later tomorrow: "Rises tomorrow 9:42 PM" (off)', () => {
    // 9:42 PM Denver on Tue Oct 27 = 03:42Z on Oct 28.
    expect(fmt(below(new Date('2026-10-28T03:42:00Z')))).toEqual({
      label: 'Rises tomorrow 9:42 PM',
      tone: 'off',
    });
  });

  it('below, rises later today (12 h or more away, same date): "Rises today 8:15 PM"', () => {
    // 8:15 PM Denver on Mon Oct 26 = 02:15Z on Oct 27; 12 h 15 m after NOW.
    expect(fmt(below(new Date('2026-10-27T02:15:00Z')))).toEqual({
      label: 'Rises today 8:15 PM',
      tone: 'off',
    });
  });

  it('below, rises two or more days out: "Rises Wed 4:10 AM" (off)', () => {
    // Wed Oct 28 4:10 AM Denver = 10:10Z.
    expect(fmt(below(new Date('2026-10-28T10:10:00Z')))).toEqual({
      label: 'Rises Wed 4:10 AM',
      tone: 'off',
    });
  });

  it('alwaysUp: "Up all night", with the visibility caveat when not visible', () => {
    expect(fmt(make({ alwaysUp: true }), 'polaris')).toEqual({
      label: 'Up all night',
      tone: 'good',
    });
    expect(fmt(make({ alwaysUp: true, visibility: 'up-daylight' }), 'polaris')).toEqual({
      label: "Up all night · sky's too bright",
      tone: 'meh',
    });
    expect(fmt(make({ alwaysUp: true, visibility: 'up-too-faint' }), 'polaris')).toEqual({
      label: 'Up all night · too faint to see',
      tone: 'meh',
    });
  });

  it('neverRisesHere: "Never rises from here" (off)', () => {
    expect(fmt(below(null, { neverRisesHere: true, neverUp: true }), 'lmc')).toEqual({
      label: 'Never rises from here',
      tone: 'off',
    });
  });

  it('neverUp for any other reason: "Not up in the next 2 days" (off)', () => {
    expect(fmt(below(null, { neverUp: true }))).toEqual({
      label: 'Not up in the next 2 days',
      tone: 'off',
    });
  });

  it('Galactic Center, when up: "Up · hidden behind dust" (meh), whatever the sky', () => {
    for (const visibility of ['up-too-faint', 'up-visible', 'up-daylight'] as const) {
      expect(fmt(make({ visibility, targetId: 'galactic-center' }), 'galactic-center')).toEqual({
        label: 'Up · hidden behind dust',
        tone: 'meh',
      });
    }
    // Below the horizon it reads like any other target.
    expect(fmt(below(after(2 * H), { targetId: 'galactic-center' }), 'galactic-center').label).toBe(
      'Rises in 2h',
    );
  });

  it('Sun: when up "Up — never look at it" (meh); the row always carries the warning', () => {
    expect(fmt(make({ targetId: 'sun' }), 'sun')).toEqual({
      label: 'Up — never look at it',
      tone: 'meh',
      warn: true,
    });
    expect(fmt(below(after(5 * H), { targetId: 'sun' }), 'sun')).toEqual({
      label: 'Rises in 5h',
      tone: 'meh',
      warn: true,
    });
  });
});

describe('riseText and formatDuration', () => {
  it('formats durations', () => {
    expect(formatDuration(30_000)).toBe('1m');
    expect(formatDuration(59 * M)).toBe('59m');
    expect(formatDuration(60 * M)).toBe('1h');
    expect(formatDuration(3 * H + 12 * M + 59_000)).toBe('3h 12m');
  });

  it('returns null with no rise, and uses plain spaces in times', () => {
    expect(riseText(make(), NOW, LOCALE, TZ)).toBeNull();
    const r = riseText(below(new Date('2026-10-28T03:42:00Z')), NOW, LOCALE, TZ)!;
    expect(r.phrase).not.toMatch(/[\u202f\u00a0]/);
    expect(r.soon).toBe(false);
  });

  it('respects the locale for the clock', () => {
    const r = riseText(below(new Date('2026-10-28T03:42:00Z')), NOW, 'de-DE', TZ)!;
    expect(r.phrase).toContain('21:42');
  });
});

describe('introNote', () => {
  const note = (a: Availability, id: string) => introNote(a, getTarget(id)!, NOW, LOCALE, TZ);

  it('is null when the target is simply visible', () => {
    expect(note(make(), 'jupiter')).toBeNull();
    expect(note(make({ low: true }), 'moon')).toBeNull();
  });

  it('below the horizon: when it rises, and that you can still point at it', () => {
    expect(note(below(after(3 * H + 12 * M + 5_000), { targetId: 'jupiter' }), 'jupiter')).toBe(
      'Jupiter is below the horizon right now — it rises in 3h 12m. You can still point at it through the ground.',
    );
    expect(note(below(new Date('2026-10-28T03:42:00Z')), 'm31')).toBe(
      'The Andromeda Galaxy is below the horizon right now — it rises tomorrow 9:42 PM. You can still point at it through the ground.',
    );
  });

  it('Galactic Center up: hidden behind dust', () => {
    expect(note(make({ visibility: 'up-too-faint' }), 'galactic-center')).toBe(
      'The Galactic Center is up, but hidden behind dust.',
    );
  });

  it('never rises from here', () => {
    expect(note(below(null, { neverRisesHere: true, neverUp: true }), 'lmc')).toBe(
      'The Large Magellanic Cloud never rises from here.',
    );
  });

  it('too bright / too faint / not up for two days', () => {
    expect(note(make({ visibility: 'up-daylight' }), 'sirius')).toBe(
      'Sirius is up, but the sky is too bright to see it right now.',
    );
    expect(note(make({ visibility: 'up-too-faint' }), 'neptune')).toBe(
      'Neptune is up, but too faint to see by eye.',
    );
    expect(note(below(null, { neverUp: true }), 'mars')).toBe('Mars is not up in the next 2 days.');
  });
});

describe('satellite labels', () => {
  const pass = (startMs: number, maxElevationDeg = 63.4, visible = true) => ({
    start: after(startMs),
    end: after(startMs + 6 * M),
    maxElevationDeg,
    maxAt: after(startMs + 3 * M),
    visible,
    ongoing: false,
  });
  const sat = (over: Partial<Availability> = {}) =>
    make({
      targetId: 'iss',
      magnitude: -3.5,
      visibility: 'below-horizon',
      altitudeDeg: -30,
      currentPass: null,
      nextVisiblePass: null,
      visibleNow: false,
      orbitAgeDays: 0.5,
      orbitStale: false,
      ...over,
    });
  const label = (a: Availability) => fmt(a, 'iss');

  it('overhead now and visible: "Overhead now — look fast" (good)', () => {
    const current = { ...pass(-2 * M), ongoing: true };
    expect(label(sat({ currentPass: current, visibleNow: true }))).toEqual({
      label: 'Overhead now — look fast',
      tone: 'good',
    });
  });

  it('overhead now but daylight or shadow: "Overhead now, but not visible" (meh)', () => {
    const current = { ...pass(-2 * M, 70, false), ongoing: true };
    expect(label(sat({ currentPass: current, visibleNow: false }))).toEqual({
      label: 'Overhead now, but not visible',
      tone: 'meh',
    });
  });

  it('next visible pass under 12 h: "Visible pass in 2h 14m · 63° high" (meh)', () => {
    expect(label(sat({ nextVisiblePass: pass(2 * H + 14 * M + 5_000) }))).toEqual({
      label: 'Visible pass in 2h 14m · 63° high',
      tone: 'meh',
    });
  });

  it('a later visible pass: "Visible pass tomorrow 6:12 AM" (off)', () => {
    // 2026-10-27 06:12 in Denver (MDT) = 12:12Z; NOW is Monday 08:00 Denver, so 22 h away, tomorrow.
    const start = new Date('2026-10-27T12:12:00Z').getTime() - NOW.getTime();
    expect(label(sat({ nextVisiblePass: pass(start) }))).toEqual({
      label: 'Visible pass tomorrow 6:12 AM',
      tone: 'off',
    });
  });

  it('no visible pass in 24 h: "No visible passes today" (off)', () => {
    expect(label(sat())).toEqual({ label: 'No visible passes today', tone: 'off' });
  });

  it('stale orbit data says so and downgrades the tone one step', () => {
    const stale = { orbitStale: true, orbitAgeDays: 16.4 };
    expect(
      label(sat({ ...stale, currentPass: { ...pass(-M), ongoing: true }, visibleNow: true })),
    ).toEqual({
      label: 'Overhead now — look fast · orbit data is 16 days old',
      tone: 'meh',
    });
    expect(label(sat({ ...stale, nextVisiblePass: pass(3 * H) }))).toEqual({
      label: 'Visible pass in 3h · 63° high · orbit data is 16 days old',
      tone: 'off',
    });
    expect(label(sat({ ...stale }))).toEqual({
      label: 'No visible passes today · orbit data is 16 days old',
      tone: 'off',
    });
  });

  it('"approximate" orbit data (3-14 days) is not mentioned: only stale data (> 14 days) is labelled', () => {
    const fresh = label(sat({ nextVisiblePass: pass(3 * H) }));
    for (const days of [3, 7.5, 14]) {
      expect(
        label(sat({ nextVisiblePass: pass(3 * H), orbitAgeDays: days, orbitStale: false })),
      ).toEqual(fresh);
    }
    expect(
      label(sat({ nextVisiblePass: pass(3 * H), orbitAgeDays: 14.2, orbitStale: true })).label,
    ).toContain('orbit data is 14 days old');
  });

  it('no orbit data at all: "Orbit data unavailable"', () => {
    expect(label(sat({ orbitDataUnavailable: true }))).toEqual({
      label: 'Orbit data unavailable',
      tone: 'off',
    });
  });

  it('intro: the pass label, plus "you can still find it" when there is no visible pass', () => {
    const n = (a: Availability) => introNote(a, getTarget('iss')!, NOW, LOCALE, TZ);
    expect(n(sat({ nextVisiblePass: pass(2 * H + 14 * M + 5_000) }))).toBe(
      'Visible pass in 2h 14m · 63° high.',
    );
    expect(n(sat())).toBe(
      'No visible passes today. You can still find where it is right now — even in daylight.',
    );
    expect(n(sat({ orbitDataUnavailable: true }))).toBe(
      'Orbit data unavailable. Check your connection and try again.',
    );
  });
});
