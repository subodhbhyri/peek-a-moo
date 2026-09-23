import { MoonPhaseName } from '../astro/ephemeris';

export type LineTag =
  | 'first-ever'
  | 'milestone'
  | 'quick'
  | 'long-hunt'
  | 'new'
  | 'crescent'
  | 'quarter'
  | 'gibbous'
  | 'full'
  | 'daytime'
  | 'below-horizon'
  | 'late-night'
  | 'repeat';

/** Lifetime find counts worth calling out. */
export const MILESTONES: readonly number[] = [5, 10, 25, 50, 100, 200, 500, 1000];

export interface FindLineContext {
  /** How many times the Moon has been found this session (including this one). */
  sessionFindIndex: number;
  /** Lifetime finds, including this one (from StatsService). */
  lifetimeFindCount: number;
  /** Time to find it this time, ms. */
  durationMs: number;
  moonPhase: MoonPhaseName;
  moonAltitudeDeg: number;
  sunAltitudeDeg: number;
  /** Local hour, 0-23. */
  localHour: number;
}

const PHASE_TAG: Record<MoonPhaseName, LineTag> = {
  new: 'new',
  'waxing-crescent': 'crescent',
  'first-quarter': 'quarter',
  'waxing-gibbous': 'gibbous',
  full: 'full',
  'waning-gibbous': 'gibbous',
  'last-quarter': 'quarter',
  'waning-crescent': 'crescent',
};

const LINES: Record<LineTag, string[]> = {
  'first-ever': [
    "oh— hi. you weren't supposed to see me like this.",
    'well. this is new. hi.',
    'okay, you actually found me. hello, I guess.',
  ],
  milestone: [
    "we've done this a lot now. I respect the dedication.",
    "at this point we're basically friends.",
    'you again. this is becoming a whole thing.',
  ],
  quick: [
    'okay that was fast. suspicious.',
    "wow. you weren't even trying, were you.",
    "did you already know where I'd be?",
  ],
  'long-hunt': [
    "I've been here the whole time.",
    'took you a minute. I was starting to enjoy the privacy.',
    'finally. my arm was getting tired of waving.',
  ],
  new: [
    "I'm basically invisible right now and you still found me??",
    "there's barely anything to see. bold of you to check anyway.",
    "new moon. I'm shy today.",
  ],
  crescent: [
    'just a sliver of me today. use your imagination for the rest.',
    'crescent mode. mysterious and slightly smug about it.',
  ],
  quarter: ['half of me is very available right now.', "50/50, like a coin that's always tails."],
  gibbous: ['almost full. peak form, honestly.', "getting rounder by the night. it's a whole arc."],
  full: [
    "yes I'm round, stop staring.",
    'full moon. main character energy tonight.',
    "howl if you want, I won't judge.",
  ],
  daytime: [
    "yes, I'm allowed out in daylight.",
    'surprised? the sun and I share custody of the sky.',
    'daytime moon. rare pull, I know.',
  ],
  'below-horizon': [
    "I'm literally on the other side of the planet right now.",
    "you're pointing at the floor. I appreciate the effort, though.",
    "can't find me down there. try again later.",
  ],
  'late-night': [
    'go to sleep.',
    "it's very late. we can talk in the morning.",
    'you and me both, apparently.',
  ],
  repeat: [
    'hi again.',
    "don't you have things to do, my friend?",
    'we have to stop meeting like this.',
    'back so soon?',
  ],
};

const LINE_TO_TAG = new Map<string, LineTag>(
  (Object.entries(LINES) as [LineTag, string[]][]).flatMap(([tag, texts]) =>
    texts.map((t) => [t, tag] as const),
  ),
);

export interface SelectedLine {
  text: string;
  tag: LineTag;
}

/**
 * Picks the Moon's line for a find. `first-ever` and `milestone` are exclusive occasions (only
 * those lines are eligible); otherwise every applicable context tag contributes its lines to one
 * pool, `recentTexts` is excluded where possible (so the same line doesn't repeat back to back),
 * and one line is picked at random from what's left.
 */
export function selectFindLine(
  ctx: FindLineContext,
  recentTexts: readonly string[] = [],
  random: () => number = Math.random,
): SelectedLine {
  const tags = candidateTags(ctx);
  const pool = tags.flatMap((tag) => LINES[tag].map((text) => ({ text, tag })));
  const filtered = pool.filter((p) => !recentTexts.includes(p.text));
  const finalPool = filtered.length > 0 ? filtered : pool;
  const pick = finalPool[Math.floor(clampUnit(random()) * finalPool.length)];
  return pick;
}

/** Exposed for the UI (e.g. a phase-appropriate emoji next to the line) and for tests. */
export function tagOfLine(text: string): LineTag | undefined {
  return LINE_TO_TAG.get(text);
}

function candidateTags(ctx: FindLineContext): LineTag[] {
  if (ctx.lifetimeFindCount === 1) return ['first-ever'];
  if (MILESTONES.includes(ctx.lifetimeFindCount)) return ['milestone'];

  const tags: LineTag[] = [PHASE_TAG[ctx.moonPhase]];
  if (ctx.sunAltitudeDeg > 0) tags.push('daytime');
  if (ctx.moonAltitudeDeg < 0) tags.push('below-horizon');
  if (ctx.localHour >= 1 && ctx.localHour < 5) tags.push('late-night');
  if (ctx.durationMs < 3000) tags.push('quick');
  if (ctx.durationMs > 30_000) tags.push('long-hunt');
  if (ctx.sessionFindIndex > 1) tags.push('repeat');
  return tags;
}

function clampUnit(x: number): number {
  return Math.min(0.999999, Math.max(0, x));
}
