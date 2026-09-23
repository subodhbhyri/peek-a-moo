import { EMPTY_STATS, applyFind, dateKey, pushRecentLine } from './stats';

describe('applyFind', () => {
  it('records the first find', () => {
    const s = applyFind(EMPTY_STATS, 4200, new Date('2026-09-22T10:00:00Z'));
    expect(s.lifetimeFinds).toBe(1);
    expect(s.fastestMs).toBe(4200);
    expect(s.streakDays).toBe(1);
    expect(s.lastFoundDateKey).toBe('2026-09-22');
  });

  it('tracks the fastest time across finds', () => {
    let s = applyFind(EMPTY_STATS, 5000, new Date('2026-09-22T10:00:00Z'));
    s = applyFind(s, 2000, new Date('2026-09-22T11:00:00Z'));
    s = applyFind(s, 3000, new Date('2026-09-22T12:00:00Z'));
    expect(s.fastestMs).toBe(2000);
    expect(s.lifetimeFinds).toBe(3);
  });

  it('does not double-count the streak for a second find the same day', () => {
    let s = applyFind(EMPTY_STATS, 1000, new Date('2026-09-22T10:00:00Z'));
    s = applyFind(s, 1000, new Date('2026-09-22T22:00:00Z'));
    expect(s.streakDays).toBe(1);
  });

  it('extends the streak on the very next UTC day', () => {
    let s = applyFind(EMPTY_STATS, 1000, new Date('2026-09-22T23:50:00Z'));
    s = applyFind(s, 1000, new Date('2026-09-23T00:10:00Z'));
    expect(s.streakDays).toBe(2);
  });

  it('resets the streak after a gap', () => {
    let s = applyFind(EMPTY_STATS, 1000, new Date('2026-09-20T10:00:00Z'));
    s = applyFind(s, 1000, new Date('2026-09-23T10:00:00Z'));
    expect(s.streakDays).toBe(1);
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
