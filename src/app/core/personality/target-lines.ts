import type { TargetDef } from '../targets/target.types';

/**
 * One short, factual line per non-Moon target (Phase 3). Per-target voices come in Phase 7.
 * The Moon is deliberately absent: it keeps the v1 line system.
 */
export const TARGET_FOUND_LINES: Readonly<Record<string, string>> = {
  sun: 'Found it. Now look away from it.',
  mercury: 'Mercury. It never strays far from the Sun, so it is only ever seen near dawn or dusk.',
  venus: 'That bright "star"? Venus.',
  mars: 'Mars. That orange tint is iron-rich dust.',
  jupiter: 'Jupiter. Bigger than everything else here, combined.',
  saturn: 'Saturn. Those rings are mostly ice.',
  uranus: 'Uranus. It spins tipped on its side.',
  neptune: 'Neptune. Too faint for bare eyes, but it is right there.',
  polaris: 'Polaris. The sky turns around me.',
  sirius: 'Sirius. The brightest star in the night sky, and only 8.6 light-years away.',
  betelgeuse: 'Betelgeuse. A red supergiant so big it would swallow the orbit of Mars.',
  vega: 'Vega. The pole star, in about 12,000 years.',
  arcturus: 'Arcturus. An orange giant, and the brightest star in the northern sky.',
  m31: 'Andromeda. The light hitting your eye left it 2.5 million years ago.',
  m42: 'The Orion Nebula. New stars are being born in there right now.',
  m45: 'The Pleiades. A young cluster of more than a thousand stars.',
  'galactic-center': "You can't see it — but 4 million suns' worth of black hole is right there.",
  lmc: 'The Large Magellanic Cloud. A whole galaxy, circling ours.',
};

export const SUN_SAFETY_BANNER = 'Never look at the Sun — not directly, not through your camera.';
/** Shown under the toast when a found target cannot be seen by eye (magnitude unknown or fainter than 6). */
export const NOT_VISIBLE_NOTE = "Not visible to the eye — it's there, behind dust.";

/** True when a target is not a naked-eye object: magnitude null or fainter than 6. */
export function isNotNakedEye(magnitude: number | null): boolean {
  return magnitude === null || magnitude > 6;
}

export const SUN_CAMERA_NOTE = 'Camera is off for the Sun.';

/** The line to show when a non-Moon target is found, or null if there is none. */
export function targetFoundLine(id: string): string | null {
  return TARGET_FOUND_LINES[id] ?? null;
}

/** Corner toast for non-Moon targets: "Found Jupiter in 4.2s" (the Sun gets its article). */
export function targetFoundToast(def: TargetDef, durationMs: number): string {
  const name = def.kind === 'sun' ? `the ${def.name}` : def.name;
  return `Found ${name} in ${(durationMs / 1000).toFixed(1)}s`;
}
