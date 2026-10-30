import type { TargetDef } from '../targets/target.types';

export const SUN_SAFETY_BANNER = 'Never look at the Sun — not directly, not through your camera.';
/** Shown under the toast when a found target cannot be seen by eye (magnitude unknown or fainter than 6). */
export const NOT_VISIBLE_NOTE = "Not visible to the eye — it's there, behind dust.";

/** True when a target is not a naked-eye object: magnitude null or fainter than 6. */
export function isNotNakedEye(magnitude: number | null): boolean {
  return magnitude === null || magnitude > 6;
}

export const SUN_CAMERA_NOTE = 'Camera is off for the Sun.';

/** Shown under the toast when a found satellite is in Earth's shadow. */
export const SATELLITE_SHADOW_NOTE =
  "It's in Earth's shadow right now — invisible, but right there.";
/** Shown under the toast when a found satellite is sunlit but the sky is too bright to see it. */
export const SATELLITE_DAYLIGHT_NOTE = "The sky's too bright to see it — but it's right there.";

/** The "not visible" note for a found satellite, or null when you could really see it. */
export function satelliteFoundNote(
  sunlit: boolean,
  sunAltitudeDeg: number | undefined,
): string | null {
  if (!sunlit) return SATELLITE_SHADOW_NOTE;
  return sunAltitudeDeg !== undefined && sunAltitudeDeg > -6 ? SATELLITE_DAYLIGHT_NOTE : null;
}

/** Corner toast for non-Moon targets: "Found Jupiter in 4.2s", "Found the ISS in 4.2s". */
export function targetFoundToast(def: TargetDef, durationMs: number): string {
  const name =
    def.kind === 'sun'
      ? `the ${def.name}`
      : def.kind === 'satellite'
        ? def.nameInSentence
        : def.name;
  return `Found ${name} in ${(durationMs / 1000).toFixed(1)}s`;
}
