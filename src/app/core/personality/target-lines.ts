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
};

export const SUN_SAFETY_BANNER = 'Never look at the Sun — not directly, not through your camera.';
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
