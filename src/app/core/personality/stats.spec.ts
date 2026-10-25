import { TestBed } from '@angular/core/testing';
import { EMPTY_STATS, applyFind, dateKey, migrateStats, pushRecentLine } from './stats';
import { StatsService } from './stats.service';

describe('applyFind', () => {
  it('records the first find', () => {
    const s = applyFind(EMPTY_STATS, 'moon', 4200, new Date('2026-09-22T10:00:00Z'));
    expect(s.lifetime.finds).toBe(1);
    expect(s.lifetime.fastestMs).toBe(4200);
    expect(s.lifetime.streakDays).toBe(1);
    expect(s.lifetime.lastFindDay).toBe('2026-09-22');
    expect(s.perTarget['moon']).toEqual({
      finds: 1,
      fastestMs: 4200,
      lastFoundAt: Date.parse('2026-09-22T10:00:00Z'),
    });
  });

  it('tracks the fastest time across finds', () => {
    let s = applyFind(EMPTY_STATS, 'moon', 5000, new Date('2026-09-22T10:00:00Z'));
    s = applyFind(s, 'moon', 2000, new Date('2026-09-22T11:00:00Z'));
    s = applyFind(s, 'moon', 3000, new Date('2026-09-22T12:00:00Z'));
    expect(s.lifetime.fastestMs).toBe(2000);
    expect(s.lifetime.finds).toBe(3);
  });

  it('does not double-count the streak for a second find the same day', () => {
    let s = applyFind(EMPTY_STATS, 'moon', 1000, new Date('2026-09-22T10:00:00Z'));
    s = applyFind(s, 'moon', 1000, new Date('2026-09-22T22:00:00Z'));
    expect(s.lifetime.streakDays).toBe(1);
  });

  it('extends the streak on the very next UTC day', () => {
    let s = applyFind(EMPTY_STATS, 'moon', 1000, new Date('2026-09-22T23:50:00Z'));
    s = applyFind(s, 'moon', 1000, new Date('2026-09-23T00:10:00Z'));
    expect(s.lifetime.streakDays).toBe(2);
  });

  it('resets the streak after a gap', () => {
    let s = applyFind(EMPTY_STATS, 'moon', 1000, new Date('2026-09-20T10:00:00Z'));
    s = applyFind(s, 'moon', 1000, new Date('2026-09-23T10:00:00Z'));
    expect(s.lifetime.streakDays).toBe(1);
  });

  it('keeps per-target fastest times independent, while the streak and lifetime are shared', () => {
    let s = applyFind(EMPTY_STATS, 'moon', 5000, new Date('2026-09-22T10:00:00Z'));
    s = applyFind(s, 'jupiter', 9000, new Date('2026-09-23T10:00:00Z'));
    s = applyFind(s, 'moon', 3000, new Date('2026-09-23T11:00:00Z'));
    s = applyFind(s, 'jupiter', 12000, new Date('2026-09-23T12:00:00Z'));
    expect(s.perTarget['moon'].fastestMs).toBe(3000);
    expect(s.perTarget['moon'].finds).toBe(2);
    expect(s.perTarget['jupiter'].fastestMs).toBe(9000);
    expect(s.perTarget['jupiter'].finds).toBe(2);
    expect(s.lifetime.finds).toBe(4);
    expect(s.lifetime.fastestMs).toBe(3000);
    expect(s.lifetime.streakDays).toBe(2);
  });

  it('does not mutate its input', () => {
    applyFind(EMPTY_STATS, 'moon', 1, new Date('2026-09-22T10:00:00Z'));
    expect(EMPTY_STATS.lifetime.finds).toBe(0);
    expect(EMPTY_STATS.perTarget).toEqual({});
  });
});

describe('pushRecentLine', () => {
  it('adds newest first and caps the list', () => {
    let s = EMPTY_STATS;
    for (let i = 0; i < 10; i++) s = pushRecentLine(s, `line-${i}`);
    expect(s.recentLines[0]).toBe('line-9');
    expect(s.recentLines.length).toBe(6);
  });
});

describe('dateKey', () => {
  it('formats as UTC yyyy-mm-dd', () => {
    expect(dateKey(new Date('2026-01-05T23:59:00Z'))).toBe('2026-01-05');
  });
});

/** What v1 actually wrote to localStorage. */
const V1_JSON = JSON.stringify({
  lifetimeFinds: 14,
  fastestMs: 2310,
  streakDays: 3,
  lastFoundDateKey: '2026-10-24',
  recentLines: ['Oh. It is you.', 'There it is.', 'Took you long enough.'],
});

describe('migrateStats', () => {
  it('migrates v1: lifetime copies over, everything goes to the Moon', () => {
    const s = migrateStats(JSON.parse(V1_JSON));
    expect(s).toEqual({
      version: 2,
      lifetime: { finds: 14, fastestMs: 2310, streakDays: 3, lastFindDay: '2026-10-24' },
      perTarget: {
        moon: { finds: 14, fastestMs: 2310, lastFoundAt: Date.parse('2026-10-24T00:00:00Z') },
      },
      recentLines: ['Oh. It is you.', 'There it is.', 'Took you long enough.'],
    });
  });

  it('migrates a v1 record with no finds to empty per-target stats', () => {
    const s = migrateStats({
      lifetimeFinds: 0,
      fastestMs: null,
      streakDays: 0,
      lastFoundDateKey: null,
      recentLines: [],
    });
    expect(s.perTarget).toEqual({});
    expect(s.lifetime.finds).toBe(0);
  });

  it('passes valid v2 through unchanged', () => {
    const v2 = applyFind(EMPTY_STATS, 'moon', 1500, new Date('2026-10-01T10:00:00Z'));
    expect(migrateStats(JSON.parse(JSON.stringify(v2)))).toEqual(v2);
  });

  it('returns fresh v2 for null, wrong types and unknown shapes', () => {
    for (const bad of [
      null,
      undefined,
      'x',
      42,
      [],
      {},
      { lifetimeFinds: 'many' },
      { version: 1 },
    ]) {
      expect(migrateStats(bad)).toEqual(EMPTY_STATS);
    }
  });

  it('repairs a v2 record with garbage fields instead of crashing', () => {
    const s = migrateStats({ version: 2, lifetime: { finds: -4 }, perTarget: { moon: 'x' } });
    expect(s.lifetime.finds).toBe(0);
    expect(s.perTarget['moon']).toEqual({ finds: 0, fastestMs: null, lastFoundAt: null });
    expect(s.recentLines).toEqual([]);
  });
});

describe('StatsService storage', () => {
  const KEY = 'find-the-moon.stats.v1';
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('migrates stored v1 JSON on load and writes it back as v2', () => {
    localStorage.setItem(KEY, V1_JSON);
    const svc = TestBed.inject(StatsService);
    expect(svc.stats().lifetime.finds).toBe(14);
    expect(svc.stats().perTarget['moon'].finds).toBe(14);
    const stored = JSON.parse(localStorage.getItem(KEY)!);
    expect(stored.version).toBe(2);
    expect(stored.perTarget.moon.finds).toBe(14);
  });

  it('corrupt JSON gives fresh v2 stats and does not throw', () => {
    localStorage.setItem(KEY, '{not json');
    const svc = TestBed.inject(StatsService);
    expect(svc.stats()).toEqual(EMPTY_STATS);
  });

  it('records finds per target and persists them', () => {
    const svc = TestBed.inject(StatsService);
    svc.recordFind('moon', 2000, new Date('2026-10-25T10:00:00Z'));
    expect(JSON.parse(localStorage.getItem(KEY)!).perTarget.moon.finds).toBe(1);
  });
});
