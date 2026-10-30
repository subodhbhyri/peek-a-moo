import { MoonPhaseName } from '../astro/ephemeris';
import type { TargetDef } from '../targets/target.types';
import { LINE_PACKS, MOON_LINES } from './lines';
import type { LinePack, LineTag } from './lines/types';

export type { LineTag } from './lines/types';

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

const LINES: LinePack = MOON_LINES;

const LINE_TO_TAG = new Map<string, LineTag>(
  (Object.entries(LINES) as [LineTag, readonly string[]][]).flatMap(([tag, texts]) =>
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
  return pickLine(LINES, candidateTags(ctx), recentTexts, random);
}

/** One pool from the tags' lines, minus recently shown ones where possible, then a random pick. */
function pickLine(
  pack: LinePack,
  tags: readonly LineTag[],
  recentTexts: readonly string[],
  random: () => number,
): SelectedLine {
  const pool = tags.flatMap((tag) => (pack[tag] ?? []).map((text) => ({ text, tag })));
  const filtered = pool.filter((p) => !recentTexts.includes(p.text));
  const finalPool = filtered.length > 0 ? filtered : pool;
  return finalPool[Math.floor(clampUnit(random()) * finalPool.length)];
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

/** What a non-Moon find knows about itself. */
export interface TargetLineContext {
  /** Finds of THIS target, including this one (from StatsService.perTarget). */
  targetFinds: number;
  /** Finds of this target this session, including this one. */
  sessionFindIndex: number;
  durationMs: number;
  altitudeDeg: number;
  magnitude: number | null;
  /** Satellites only. */
  sunlit?: boolean;
}

const BRIGHT_PLANET_MAG = -1;
const BRIGHT_STAR_MAG = 0;
const LOW_ALT_DEG = 10;
const TWINKLE_BELOW_ALT_DEG = 30;
const FAINT_ABOVE_MAG = 2.5;
const OVERHEAD_ABOVE_ALT_DEG = 60;

/**
 * Tags for a non-Moon find, in pool order. Like the Moon: the first find of a target and per-target
 * milestones are exclusive occasions; otherwise the context tags that fit this kind of target, then
 * quick / long-hunt, then repeat (any find after the first). The Sun has only safety lines.
 */
export function targetLineTags(def: TargetDef, ctx: TargetLineContext): LineTag[] {
  if (def.kind === 'sun') return ['safety'];
  if (ctx.targetFinds <= 1) return ['first'];
  if (MILESTONES.includes(ctx.targetFinds)) return ['milestone'];

  const tags: LineTag[] = [];
  const low = ctx.altitudeDeg > 0 && ctx.altitudeDeg < LOW_ALT_DEG;
  switch (def.category) {
    case 'solar-system':
      if (ctx.magnitude !== null && ctx.magnitude < BRIGHT_PLANET_MAG) tags.push('bright');
      if (low) tags.push('low');
      break;
    case 'stars':
      if (ctx.magnitude !== null && ctx.magnitude < BRIGHT_STAR_MAG) tags.push('bright');
      if (ctx.altitudeDeg < TWINKLE_BELOW_ALT_DEG) tags.push('twinkle');
      if (low) tags.push('low');
      break;
    case 'deep-sky':
      if (ctx.magnitude === null || ctx.magnitude > FAINT_ABOVE_MAG) tags.push('faint');
      if (low) tags.push('low');
      break;
    case 'satellites':
      if (ctx.altitudeDeg > OVERHEAD_ABOVE_ALT_DEG) tags.push('overhead');
      if (ctx.sunlit === false) tags.push('shadow');
      break;
  }
  if (ctx.durationMs < 3000) tags.push('quick');
  if (ctx.durationMs > 30_000) tags.push('long-hunt');
  tags.push('repeat');
  return tags;
}

/** The line for a non-Moon find, from that target's pack; null if it has none. */
export function selectTargetLine(
  def: TargetDef,
  ctx: TargetLineContext,
  recentTexts: readonly string[] = [],
  random: () => number = Math.random,
): SelectedLine | null {
  const pack = LINE_PACKS[def.id];
  if (!pack) return null;
  return pickLine(pack, targetLineTags(def, ctx), recentTexts, random);
}
