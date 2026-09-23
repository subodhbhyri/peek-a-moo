export interface StatsRecord {
  lifetimeFinds: number;
  fastestMs: number | null;
  /** Consecutive calendar days (UTC) with at least one find. */
  streakDays: number;
  /** UTC yyyy-mm-dd of the last find, or null. */
  lastFoundDateKey: string | null;
  /** Most recently shown lines, newest first — used to avoid immediate repeats. */
  recentLines: string[];
}

export const EMPTY_STATS: StatsRecord = {
  lifetimeFinds: 0,
  fastestMs: null,
  streakDays: 0,
  lastFoundDateKey: null,
  recentLines: [],
};

const RECENT_LINES_MAX = 6;
const MS_PER_DAY = 86_400_000;

export function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isConsecutiveDay(prevKey: string, todayKey: string): boolean {
  const prev = Date.parse(prevKey + 'T00:00:00Z');
  const today = Date.parse(todayKey + 'T00:00:00Z');
  return today - prev === MS_PER_DAY;
}

/** Records one find. Pure — pass `now` explicitly so this is trivially testable. */
export function applyFind(stats: StatsRecord, durationMs: number, now: Date): StatsRecord {
  const todayKey = dateKey(now);
  const lifetimeFinds = stats.lifetimeFinds + 1;
  const fastestMs = stats.fastestMs === null ? durationMs : Math.min(stats.fastestMs, durationMs);

  let streakDays: number;
  if (stats.lastFoundDateKey === todayKey) {
    streakDays = Math.max(stats.streakDays, 1);
  } else if (stats.lastFoundDateKey && isConsecutiveDay(stats.lastFoundDateKey, todayKey)) {
    streakDays = stats.streakDays + 1;
  } else {
    streakDays = 1;
  }

  return { ...stats, lifetimeFinds, fastestMs, streakDays, lastFoundDateKey: todayKey };
}

export function pushRecentLine(stats: StatsRecord, text: string): StatsRecord {
  return { ...stats, recentLines: [text, ...stats.recentLines].slice(0, RECENT_LINES_MAX) };
}
