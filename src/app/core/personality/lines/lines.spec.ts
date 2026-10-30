import { TARGETS } from '../../targets/catalog';
import { selectFindLine, selectTargetLine, targetLineTags } from '../find-lines';
import type { FindLineContext, TargetLineContext } from '../find-lines';
import goldenFile from '../testing/moon-golden.json';
import { LINE_PACKS, MOON_LINES } from './index';
import type { LineTag } from './types';

const CONTEXT_TAGS: Record<string, readonly LineTag[]> = {
  'solar-system': ['bright', 'low'],
  stars: ['bright', 'low', 'twinkle'],
  'deep-sky': ['faint', 'low'],
  satellites: ['overhead', 'shadow'],
};

const allLines = Object.entries(LINE_PACKS).flatMap(([id, pack]) =>
  Object.entries(pack).flatMap(([tag, lines]) => (lines ?? []).map((text) => ({ id, tag, text }))),
);

describe('line packs', () => {
  it('there is exactly one pack per catalog target', () => {
    expect(Object.keys(LINE_PACKS).sort()).toEqual(TARGETS.map((t) => t.id).sort());
  });

  for (const def of TARGETS.filter((t) => t.kind !== 'moon' && t.kind !== 'sun')) {
    it(`${def.id}: has first, 2-3 repeat, quick, long-hunt, milestone and a context tag that fits`, () => {
      const pack = LINE_PACKS[def.id];
      expect(pack['first']?.length, 'first').toBeGreaterThanOrEqual(1);
      expect(pack['repeat']?.length, 'repeat').toBeGreaterThanOrEqual(2);
      expect(pack['repeat']?.length, 'repeat').toBeLessThanOrEqual(3);
      expect(pack['quick']?.length, 'quick').toBeGreaterThanOrEqual(1);
      expect(pack['long-hunt']?.length, 'long-hunt').toBeGreaterThanOrEqual(1);
      expect(pack['milestone']?.length, 'milestone').toBeGreaterThanOrEqual(1);
      const context = CONTEXT_TAGS[def.category].filter((t) => (pack[t]?.length ?? 0) > 0);
      expect(context.length, 'context tag').toBeGreaterThanOrEqual(1);
      // And no tag outside the generic set and this kind's context tags.
      const allowed = new Set<string>([
        'first',
        'repeat',
        'quick',
        'long-hunt',
        'milestone',
        ...CONTEXT_TAGS[def.category],
      ]);
      for (const tag of Object.keys(pack)) {
        expect(allowed.has(tag), `${def.id}: ${tag}`).toBe(true);
      }
    });
  }

  it('satellites have overhead and shadow lines; stars twinkle; deep sky faint', () => {
    for (const id of ['iss', 'tiangong', 'hubble']) {
      expect(LINE_PACKS[id]['overhead']?.length, id).toBeGreaterThan(0);
      expect(LINE_PACKS[id]['shadow']?.length, id).toBeGreaterThan(0);
    }
    for (const id of ['polaris', 'sirius', 'betelgeuse', 'vega', 'arcturus']) {
      expect(LINE_PACKS[id]['twinkle']?.length, id).toBeGreaterThan(0);
    }
    for (const id of ['m31', 'm42', 'm45', 'galactic-center', 'lmc']) {
      expect(LINE_PACKS[id]['faint']?.length, id).toBeGreaterThan(0);
    }
  });

  it('the Sun pack contains only safety lines, all of them "look away" variants', () => {
    const sun = LINE_PACKS['sun'];
    expect(Object.keys(sun)).toEqual(['safety']);
    for (const text of sun['safety']!) {
      expect(text).toMatch(/look away|eyes down|enough sun/);
      // Nothing jokes about looking at it.
      expect(text).not.toMatch(/stare|gaze|bright|!/i);
    }
  });

  it('no line is longer than 80 characters', () => {
    for (const l of allLines) expect(l.text.length, `${l.id}: ${l.text}`).toBeLessThanOrEqual(80);
  });

  it('no line is used twice, within or across packs', () => {
    const seen = new Map<string, string>();
    for (const l of allLines) {
      expect(seen.has(l.text), `"${l.text}" in ${l.id} and ${seen.get(l.text)}`).toBe(false);
      seen.set(l.text, l.id);
    }
  });

  it("non-Moon lines are lowercase, like the Moon's voice", () => {
    for (const l of allLines.filter((x) => x.id !== 'moon')) {
      expect(l.text, l.id).toBe(l.text.toLowerCase());
    }
  });

  it('states no time-sensitive facts and no crew counts', () => {
    for (const l of allLines.filter((x) => x.id !== 'moon')) {
      expect(l.text, l.id).not.toMatch(/\b(currently|these days|as of|this year|nowadays)\b/);
      expect(l.text, l.id).not.toMatch(/\b(crew of|astronauts?)\b/);
      expect(l.text, l.id).not.toMatch(/\b(seven|7|six|three|two) (people|crew)\b/);
    }
  });
});

describe('the Moon: selections are exactly what they were before the packs existed', () => {
  // 120 cases recorded from the Phase 6 selector (same contexts, recent lists and random values).
  const golden = goldenFile as unknown as {
    cases: { ctx: FindLineContext; recent: string[]; r: number; text: string; tag: string }[];
  };

  it('replays every recorded selection identically', () => {
    expect(golden.cases).toHaveLength(120);
    for (const c of golden.cases) {
      const got = selectFindLine(c.ctx, c.recent, () => c.r);
      expect({ text: got.text, tag: got.tag }, JSON.stringify(c.ctx)).toEqual({
        text: c.text,
        tag: c.tag,
      });
    }
  });

  it('the Moon pack still has the same number of lines per tag', () => {
    const counts = Object.fromEntries(Object.entries(MOON_LINES).map(([t, l]) => [t, l!.length]));
    expect(counts).toEqual({
      'first-ever': 3,
      milestone: 3,
      quick: 3,
      'long-hunt': 3,
      new: 3,
      crescent: 2,
      quarter: 2,
      gibbous: 2,
      full: 3,
      daytime: 3,
      'below-horizon': 3,
      'late-night': 3,
      repeat: 4,
    });
  });
});

describe('selecting a line for any other target', () => {
  const def = (id: string) => TARGETS.find((t) => t.id === id)!;
  const base: TargetLineContext = {
    targetFinds: 3,
    sessionFindIndex: 1,
    durationMs: 8000,
    altitudeDeg: 45,
    magnitude: -2,
  };

  it('the first find of a target uses its first line, whatever else is true', () => {
    for (const d of TARGETS.filter((t) => t.kind !== 'moon' && t.kind !== 'sun')) {
      const got = selectTargetLine(d, { ...base, targetFinds: 1, durationMs: 1000 })!;
      expect(got.tag).toBe('first');
      expect(LINE_PACKS[d.id]['first']).toContain(got.text);
    }
  });

  it('milestones use the per-target count', () => {
    const got = selectTargetLine(def('jupiter'), { ...base, targetFinds: 10 })!;
    expect(got.tag).toBe('milestone');
    expect(selectTargetLine(def('jupiter'), { ...base, targetFinds: 3 })!.tag).not.toBe(
      'milestone',
    );
  });

  it('later finds draw on context, speed and repeat lines from that target only', () => {
    const ctx = { ...base, durationMs: 1500 };
    expect(targetLineTags(def('jupiter'), ctx)).toEqual(['bright', 'quick', 'repeat']);
    for (let r = 0; r < 1; r += 0.07) {
      const got = selectTargetLine(def('jupiter'), ctx, [], () => r)!;
      expect(LINE_PACKS['jupiter'][got.tag]).toContain(got.text);
    }
  });

  it('context tags by kind', () => {
    const t = (id: string, over: Partial<TargetLineContext>) =>
      targetLineTags(def(id), { ...base, ...over });
    expect(t('saturn', { magnitude: 0.8, altitudeDeg: 5 })).toEqual(['low', 'repeat']);
    expect(t('venus', { magnitude: -4, altitudeDeg: 5 })).toEqual(['bright', 'low', 'repeat']);
    expect(t('sirius', { magnitude: -1.46, altitudeDeg: 20 })).toEqual([
      'bright',
      'twinkle',
      'repeat',
    ]);
    expect(t('vega', { magnitude: 0.03, altitudeDeg: 80 })).toEqual(['repeat']);
    expect(t('m31', { magnitude: 3.4 })).toEqual(['faint', 'repeat']);
    expect(t('galactic-center', { magnitude: null, altitudeDeg: 5 })).toEqual([
      'faint',
      'low',
      'repeat',
    ]);
    expect(t('iss', { altitudeDeg: 80, sunlit: true, durationMs: 1000 })).toEqual([
      'overhead',
      'quick',
      'repeat',
    ]);
    expect(t('iss', { altitudeDeg: 30, sunlit: false, durationMs: 40_000 })).toEqual([
      'shadow',
      'long-hunt',
      'repeat',
    ]);
  });

  it('the Sun only ever gets safety lines, on every find', () => {
    for (const finds of [1, 2, 5, 10, 40]) {
      for (const durationMs of [500, 8000, 60_000]) {
        const got = selectTargetLine(def('sun'), { ...base, targetFinds: finds, durationMs })!;
        expect(got.tag).toBe('safety');
      }
    }
  });

  it('avoids repeating a recent line while another is available', () => {
    const ctx = { ...base, durationMs: 1500 };
    const first = selectTargetLine(def('jupiter'), ctx, [], () => 0)!;
    const second = selectTargetLine(def('jupiter'), ctx, [first.text], () => 0)!;
    expect(second.text).not.toBe(first.text);
  });

  it('every target and every reachable tag combination yields a line', () => {
    for (const d of TARGETS.filter((t) => t.kind !== 'moon')) {
      for (const targetFinds of [1, 2, 5, 9]) {
        for (const altitudeDeg of [3, 20, 80]) {
          for (const durationMs of [1000, 8000, 40_000]) {
            for (const sunlit of [true, false]) {
              for (const magnitude of [null, -3, 1, 5]) {
                const got = selectTargetLine(d, {
                  targetFinds,
                  sessionFindIndex: 1,
                  durationMs,
                  altitudeDeg,
                  magnitude,
                  sunlit,
                });
                expect(got, d.id).not.toBeNull();
                expect(got!.text.length).toBeGreaterThan(0);
              }
            }
          }
        }
      }
    }
  });
});
