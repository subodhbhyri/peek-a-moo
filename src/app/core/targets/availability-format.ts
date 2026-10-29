import type { Availability } from './availability';
import type { TargetDef } from './target.types';

export type StatusTone = 'good' | 'meh' | 'off';

export interface StatusLabel {
  label: string;
  tone: StatusTone;
  /** Shown as a warning mark in the picker row (the Sun). */
  warn?: boolean;
}

export interface FormatOptions {
  /** IANA zone for times and "tomorrow"; defaults to the device's. */
  timeZone?: string;
  /** Needed for the Sun and the Galactic Center wording. */
  def?: TargetDef;
}

const SOON_MS = 12 * 3_600_000;

/** Intl output uses a narrow no-break space before AM/PM in newer ICU; normalise to a plain space. */
const tidy = (s: string) => s.replace(/[\u202f\u00a0]/g, ' ');

function clock(d: Date, locale: string, timeZone?: string): string {
  return tidy(
    new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone }).format(d),
  );
}

function dayNumber(d: Date, timeZone?: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d); // YYYY-MM-DD
  return Date.parse(parts + 'T00:00:00Z') / 86_400_000;
}

/** "3h 12m", "2h" on the hour, or "45m" under an hour. Always at least 1m. */
export function formatDuration(ms: number): string {
  const mins = Math.max(1, Math.floor(ms / 60_000));
  const h = Math.floor(mins / 60);
  if (h === 0) return `${mins}m`;
  return mins % 60 === 0 ? `${h}h` : `${h}h ${mins % 60}m`;
}

/**
 * When the next rise happens, as a phrase that follows "rises": "in 3h 12m" (under 12 h),
 * "today 2:00 PM", "tomorrow 9:42 PM" or "Tue 4:10 AM". null when there is no rise in the window.
 */
export function riseText(
  a: Availability,
  now: Date,
  locale: string,
  timeZone?: string,
): { phrase: string; soon: boolean } | null {
  if (!a.nextRise) return null;
  const delta = a.nextRise.getTime() - now.getTime();
  if (delta < SOON_MS) return { phrase: `in ${formatDuration(delta)}`, soon: true };
  const time = clock(a.nextRise, locale, timeZone);
  const dayDiff = dayNumber(a.nextRise, timeZone) - dayNumber(now, timeZone);
  if (dayDiff <= 0) return { phrase: `today ${time}`, soon: false };
  if (dayDiff === 1) return { phrase: `tomorrow ${time}`, soon: false };
  const weekday = tidy(
    new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone }).format(a.nextRise),
  );
  return { phrase: `${weekday} ${time}`, soon: false };
}

const isUp = (a: Availability) => a.visibility !== 'below-horizon';
const isHidden = (def?: TargetDef) => def?.fixed?.style === 'marker';

/** One short status line for a picker row, with a tone for its color. */
export function formatAvailability(
  a: Availability,
  now: Date,
  locale: string,
  opts: FormatOptions = {},
): StatusLabel {
  const { def, timeZone } = opts;
  const warn = def?.kind === 'sun' ? true : undefined;
  const out = (label: string, tone: StatusTone): StatusLabel =>
    warn ? { label, tone, warn } : { label, tone };

  if (isUp(a) && def?.kind === 'sun') return out('Up — never look at it', 'meh');
  if (isUp(a) && isHidden(def)) return out('Up · hidden behind dust', 'meh');
  if (a.neverRisesHere) return out('Never rises from here', 'off');

  if (isUp(a)) {
    if (a.alwaysUp) {
      if (a.visibility === 'up-visible') return out('Up all night', 'good');
      const caveat = a.visibility === 'up-daylight' ? "sky's too bright" : 'too faint to see';
      return out(`Up all night · ${caveat}`, 'meh');
    }
    switch (a.visibility) {
      case 'up-visible':
        return out(a.low ? 'Up now · low in the sky' : 'Up now', 'good');
      case 'up-daylight':
        return out("Up, but the sky's too bright", 'meh');
      default:
        return out('Up, but too faint to see', 'meh');
    }
  }

  const rise = riseText(a, now, locale, timeZone);
  if (rise) return out(`Rises ${rise.phrase}`, rise.soon ? 'meh' : 'off');
  return out('Not up in the next 2 days', 'off');
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The one honest sentence for the intro when the target is not simply visible, or null when it is.
 * e.g. "Jupiter is below the horizon right now — it rises in 3h 12m. You can still point at it
 * through the ground."
 */
export function introNote(
  a: Availability,
  def: TargetDef,
  now: Date,
  locale: string,
  timeZone?: string,
): string | null {
  const name = capitalize(def.nameInSentence);
  if (a.neverRisesHere) return `${name} never rises from here.`;
  if (isUp(a)) {
    if (isHidden(def)) return `${name} is up, but hidden behind dust.`;
    switch (a.visibility) {
      case 'up-visible':
        return null;
      case 'up-daylight':
        return `${name} is up, but the sky is too bright to see it right now.`;
      default:
        return `${name} is up, but too faint to see by eye.`;
    }
  }
  const rise = riseText(a, now, locale, timeZone);
  if (rise) {
    return `${name} is below the horizon right now — it rises ${rise.phrase}. You can still point at it through the ground.`;
  }
  return `${name} is not up in the next 2 days.`;
}
