import { TARGETS } from './catalog';

/** docs/phases/phase8.md: the distances for fixed-sky targets, used exactly. */
const DISTANCE_TABLE: Record<string, number> = {
  sirius: 8.6,
  vega: 25,
  arcturus: 37,
  polaris: 430,
  betelgeuse: 550,
  m45: 440,
  m42: 1350,
  'galactic-center': 26_000,
  lmc: 160_000,
  m31: 2_500_000,
};

describe('target info content', () => {
  it('every target has a type, a description of at most 220 characters and exactly 3 facts of at most 120', () => {
    for (const t of TARGETS) {
      expect(t.info, t.id).toBeDefined();
      expect(t.info.type.trim(), `${t.id} type`).not.toBe('');
      expect(t.info.description.trim().length, `${t.id} description`).toBeGreaterThan(0);
      expect(t.info.description.length, `${t.id} description`).toBeLessThanOrEqual(220);
      expect(t.info.facts, `${t.id} facts`).toHaveLength(3);
      for (const f of t.info.facts) {
        expect(f.trim().length, `${t.id}: ${f}`).toBeGreaterThan(0);
        expect(f.length, `${t.id}: ${f}`).toBeLessThanOrEqual(120);
      }
    }
  });

  it('every fixed-sky target (and only those) has distanceLy, matching the table', () => {
    for (const t of TARGETS) {
      if (t.kind === 'fixed') {
        expect(t.info.distanceLy, t.id).toBe(DISTANCE_TABLE[t.id]);
      } else {
        expect(t.info.distanceLy, t.id).toBeUndefined();
      }
    }
    expect(
      TARGETS.filter((t) => t.kind === 'fixed')
        .map((t) => t.id)
        .sort(),
    ).toEqual(Object.keys(DISTANCE_TABLE).sort());
  });

  it('no fact appears twice, anywhere', () => {
    const seen = new Map<string, string>();
    for (const t of TARGETS) {
      for (const f of t.info.facts) {
        expect(seen.has(f), `"${f}" in ${t.id} and ${seen.get(f)}`).toBe(false);
        seen.set(f, t.id);
      }
    }
  });

  it('the Sun has the safety message as one of its facts', () => {
    const sun = TARGETS.find((t) => t.kind === 'sun')!;
    expect(sun.info.facts).toContain(
      'Never look at the Sun — not directly, not through your camera.',
    );
  });

  it('states nothing time-sensitive: no "currently", crew counts or end dates', () => {
    for (const t of TARGETS) {
      const text = [t.info.description, ...t.info.facts].join(' ');
      expect(text, t.id).not.toMatch(/\b(currently|these days|as of|nowadays|this year)\b/i);
      expect(text, t.id).not.toMatch(/\b(crew of|astronauts? (are|is) )/i);
      expect(text, t.id).not.toMatch(/\bwill (end|be retired|deorbit|de-orbit)\b/i);
    }
  });
});
