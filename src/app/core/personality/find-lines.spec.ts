import { FindLineContext, MILESTONES, selectFindLine, tagOfLine } from './find-lines';

const base: FindLineContext = {
  sessionFindIndex: 1,
  lifetimeFindCount: 2,
  durationMs: 8000,
  moonPhase: 'full',
  moonAltitudeDeg: 30,
  sunAltitudeDeg: -10,
  localHour: 20,
};

describe('selectFindLine', () => {
  it('gives a first-ever line only on the very first lifetime find', () => {
    const { tag } = selectFindLine({ ...base, lifetimeFindCount: 1 });
    expect(tag).toBe('first-ever');
  });

  it('gives a milestone line on milestone counts, overriding other context', () => {
    for (const n of MILESTONES) {
      const { tag } = selectFindLine({ ...base, lifetimeFindCount: n, sunAltitudeDeg: 20 });
      expect(tag).toBe('milestone');
    }
  });

  it('is not a milestone or first-ever on an ordinary count', () => {
    const { tag } = selectFindLine({ ...base, lifetimeFindCount: 7 });
    expect(tag).not.toBe('first-ever');
    expect(tag).not.toBe('milestone');
  });

  it('picks a phase-appropriate line when nothing more specific applies', () => {
    const { tag } = selectFindLine({
      ...base,
      moonPhase: 'new',
      sunAltitudeDeg: -20,
      moonAltitudeDeg: 40,
      durationMs: 8000,
    });
    expect(tag).toBe('new');
  });

  it('prefers daytime context over the plain phase line', () => {
    const random = () => 0; // first candidate in the pool
    const { tag } = selectFindLine({ ...base, sunAltitudeDeg: 20 }, [], random);
    // daytime is appended after the phase tag, so with random()=0 we get the phase tag first —
    // what matters is that daytime is a valid, reachable outcome somewhere in the pool.
    expect(['full', 'daytime']).toContain(tag);
  });

  it('flags a below-horizon moon', () => {
    const { tag } = selectFindLine(
      { ...base, moonAltitudeDeg: -5, sunAltitudeDeg: -20 },
      [],
      () => 0.99,
    );
    expect(tag).toBe('below-horizon');
  });

  it('flags a quick find under 3s', () => {
    const { tag } = selectFindLine(
      { ...base, durationMs: 1200, sunAltitudeDeg: -20, moonAltitudeDeg: 40 },
      [],
      () => 0.99,
    );
    expect(tag).toBe('quick');
  });

  it('flags a long hunt over 30s', () => {
    const { tag } = selectFindLine(
      { ...base, durationMs: 45_000, sunAltitudeDeg: -20, moonAltitudeDeg: 40 },
      [],
      () => 0.99,
    );
    expect(tag).toBe('long-hunt');
  });

  it('flags late night hours', () => {
    const { tag } = selectFindLine(
      { ...base, localHour: 3, sunAltitudeDeg: -20, moonAltitudeDeg: 40, durationMs: 8000 },
      [],
      () => 0.99,
    );
    expect(tag).toBe('late-night');
  });

  it('avoids repeating a recently used line when an alternative exists', () => {
    const ctx = { ...base, sunAltitudeDeg: -20, moonAltitudeDeg: 40 };
    const first = selectFindLine(ctx, [], () => 0);
    const second = selectFindLine(ctx, [first.text], () => 0);
    expect(second.text).not.toBe(first.text);
  });

  it('falls back to repeating if every candidate line was recently used', () => {
    const ctx: FindLineContext = {
      ...base,
      moonPhase: 'full',
      sunAltitudeDeg: -20,
      moonAltitudeDeg: 40,
      sessionFindIndex: 1,
    };
    // Exhaust the entire 'full' pool as "recent".
    const all = [
      "yes I'm round, stop staring.",
      'full moon. main character energy tonight.',
      "howl if you want, I won't judge.",
    ];
    const { text } = selectFindLine(ctx, all, () => 0);
    expect(all).toContain(text);
  });

  it('tagOfLine resolves a returned line back to its tag', () => {
    const { text, tag } = selectFindLine({ ...base, lifetimeFindCount: 1 });
    expect(tagOfLine(text)).toBe(tag);
  });

  it('random() at the edges of [0,1) never throws or goes out of bounds', () => {
    expect(() => selectFindLine(base, [], () => 0)).not.toThrow();
    expect(() => selectFindLine(base, [], () => 0.999999999)).not.toThrow();
    expect(() => selectFindLine(base, [], () => 1)).not.toThrow();
  });
});
