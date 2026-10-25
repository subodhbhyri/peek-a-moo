export interface LifetimeStats {
  finds: number;
  fastestMs: number | null;
  /** Consecutive calendar days (UTC) with at least one find. */
  streakDays: number;
  /** UTC yyyy-mm-dd of the last find, or null. */
  lastFindDay: string | null;
}

export interface TargetStats {
  finds: number;
  fastestMs: number | null;
  /** Epoch ms of the last find, or null. */
  lastFoundAt: number | null;
}

/** Stored shape since Phase 2. Lifetime totals plus a per-target breakdown. */
export interface StatsV2 {
  version: 2;
  lifetime: LifetimeStats;
  perTarget: Record<string, TargetStats>;
  /** Most recently shown lines, newest first — used to avoid immediate repeats. */
  recentLines: string[];
}

export const EMPTY_STATS: StatsV2 = {
  version: 2,
  lifetime: { finds: 0, fastestMs: null, streakDays: 0, lastFindDay: null },
  perTarget: {},
  recentLines: [],
};

const EMPTY_TARGET_STATS: TargetStats = { finds: 0, fastestMs: null, lastFoundAt: null };

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

/** Records one find for `targetId`. Pure — pass `now` explicitly so this is trivially testable. */
export function applyFind(
  stats: StatsV2,
  targetId: string,
  durationMs: number,
  now: Date,
): StatsV2 {
  const todayKey = dateKey(now);
  const { lifetime } = stats;
  const fastestMs =
    lifetime.fastestMs === null ? durationMs : Math.min(lifetime.fastestMs, durationMs);

  let streakDays: number;
  if (lifetime.lastFindDay === todayKey) {
    streakDays = Math.max(lifetime.streakDays, 1);
  } else if (lifetime.lastFindDay && isConsecutiveDay(lifetime.lastFindDay, todayKey)) {
    streakDays = lifetime.streakDays + 1;
  } else {
    streakDays = 1;
  }

  const prev = stats.perTarget[targetId] ?? EMPTY_TARGET_STATS;
  const target: TargetStats = {
    finds: prev.finds + 1,
    fastestMs: prev.fastestMs === null ? durationMs : Math.min(prev.fastestMs, durationMs),
    lastFoundAt: now.getTime(),
  };

  return {
    ...stats,
    lifetime: { finds: lifetime.finds + 1, fastestMs, streakDays, lastFindDay: todayKey },
    perTarget: { ...stats.perTarget, [targetId]: target },
  };
}

export function pushRecentLine(stats: StatsV2, text: string): StatsV2 {
  return { ...stats, recentLines: [text, ...stats.recentLines].slice(0, RECENT_LINES_MAX) };
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const numOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const lines = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/**
 * Turns whatever was stored into a valid StatsV2.
 *  - v2 data is validated and passed through.
 *  - v1 data (no `version`: lifetimeFinds / fastestMs / streakDays / lastFoundDateKey / recentLines)
 *    is migrated: lifetime fields copy over and every existing find and the fastest time go to the Moon.
 *  - Anything else (null, corrupt, wrong types) becomes fresh stats.
 */
export function migrateStats(raw: unknown): StatsV2 {
  if (!raw || typeof raw !== 'object') return EMPTY_STATS;
  const r = raw as Record<string, unknown>;

  if (r['version'] === 2) {
    const l = (r['lifetime'] ?? {}) as Record<string, unknown>;
    const perTarget: Record<string, TargetStats> = {};
    const pt = r['perTarget'];
    if (pt && typeof pt === 'object') {
      for (const [id, v] of Object.entries(pt as Record<string, unknown>)) {
        const t = (v ?? {}) as Record<string, unknown>;
        perTarget[id] = {
          finds: isCount(t['finds']) ? t['finds'] : 0,
          fastestMs: numOrNull(t['fastestMs']),
          lastFoundAt: numOrNull(t['lastFoundAt']),
        };
      }
    }
    return {
      version: 2,
      lifetime: {
        finds: isCount(l['finds']) ? l['finds'] : 0,
        fastestMs: numOrNull(l['fastestMs']),
        streakDays: isCount(l['streakDays']) ? l['streakDays'] : 0,
        lastFindDay: strOrNull(l['lastFindDay']),
      },
      perTarget,
      recentLines: lines(r['recentLines']),
    };
  }

  if (r['version'] === undefined && isCount(r['lifetimeFinds'])) {
    const finds = r['lifetimeFinds'];
    const fastestMs = numOrNull(r['fastestMs']);
    const lastFindDay = strOrNull(r['lastFoundDateKey']);
    const lastDayMs = lastFindDay ? Date.parse(lastFindDay + 'T00:00:00Z') : NaN;
    return {
      version: 2,
      lifetime: {
        finds,
        fastestMs,
        streakDays: isCount(r['streakDays']) ? r['streakDays'] : 0,
        lastFindDay,
      },
      perTarget:
        finds > 0
          ? {
              // v1 only stored a day, so the per-find timestamp is the start of that UTC day.
              moon: {
                finds,
                fastestMs,
                lastFoundAt: Number.isFinite(lastDayMs) ? lastDayMs : null,
              },
            }
          : {},
      recentLines: lines(r['recentLines']),
    };
  }

  return EMPTY_STATS;
}
