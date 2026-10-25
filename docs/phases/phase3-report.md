# Phase 3 report — Sun and planets

Status: implemented; `npm run format && npm run lint && npx ng test --watch=false && npm run build` pass. Phase 2 is committed (`cead713`) and the Moon draw-call pin is committed (`1e44774`); the Phase 3 work itself is **not committed**. Not yet checked on a device.

## What changed

**Task 1 — catalog** ([catalog.ts](../../src/app/core/targets/catalog.ts)): Sun, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune with the ids, kinds, colors and radii from the phase file and a factual one-line blurb each. Appearance lives in a new `TargetDef.planet: { radiusKm, color, phased?, rings?, bands? }`. The Sun uses the same field (it also needs a radius and color).

**Task 2 — provider** ([providers/solar-system.ts](../../src/app/core/targets/providers/solar-system.ts)): `Equator(…, true, true)` → `Horizon(…, 'normal')`, same path as the Moon; `angularSizeDeg = 2·asin(R / (dist·AU))`; `Illumination` for magnitude, illuminated fraction (Mercury, Venus) and Saturn's `ring_tilt` → `TargetState.rings`; `sunDirection` and `sunAltitudeDeg` for every planet; Sun magnitude constant −26.7. Registered in `compute.ts` for `sun` and `planet`.

**Task 3 — sky north** ([sky-orientation.ts](../../src/app/core/projection/sky-orientation.ts)): `northCelestialPole`, `skyNorthScreenAngle` (pole at the target → π/2, never NaN), `positionAngleToScreen` (`north + PA`). The engine now puts `skyNorthRad` on every `SkyFrame`.

**Task 4 — renderers**
- `phased-disc.ts` holds the terminator code moved verbatim out of `moon-phase.ts`; `drawMoonPhase` is now a thin wrapper that calls `drawPhasedDisc` with the same arguments.
- `draw-planet.ts` (glow, phase for Mercury/Venus, four clipped bands for Jupiter, Saturn rings back half before the disc and front half after, ratio `max(sin|tilt|, 0.08)`, outer edge 2.25 globe radii) and `draw-sun.ts` (disc plus wide glow, no face). `draw-target.ts` dispatches `planet` and `sun`.
- `display.ts`: planets use `max(0.035·min(w,h), true size)`; Moon and Sun use the Moon formula. Find threshold is still 0.35 with the TODO kept.

**Task 5 — Sun safety**
- Persistent banner at the top: "Never look at the Sun — not directly, not through your camera."
- Camera toggle gets `aria-disabled`, a `title`, a visible "Camera is off for the Sun." line, moves below the banner, and does nothing when tapped. Selecting the Sun while the camera is on turns it off.
- Found moment: no face; line "Found it. Now look away from it."; toast "Found the Sun in X.Xs".
- Alignment button is not offered for the Sun.

**Task 6 — found moment** ([target-lines.ts](../../src/app/core/personality/target-lines.ts)): one factual line per non-Moon target, shown as plain text near the bottom for 5 s (no face), and the corner toast "Found {name} in X.Xs" via `FindStat.text`. The Moon's text, face and emoji are untouched. Stats are per target (Phase 2 schema).

**Task 7 — debug selector**: a `<select>` in the `?debug` overlay listing the catalog → `TargetSelectionService.select`, plus magnitude and angular size lines. Copy report already carries `targetId`/`target`.

## Tests

Before Phase 3: 131. After: **182** (21 files).
- **Moon unchanged:** the Phase 2 characterization spec has no diff. A new draw-call pin (`moon-phase.spec.ts`, committed before any renderer change) records every canvas call and style assignment `drawMoonPhase` makes for five phases and compares them with the log captured from the old implementation. jsdom has no canvas, so this is call identity rather than a pixel diff: identical calls with identical arguments draw identical pixels. Also asserted: `drawTarget` for the Moon logs exactly what `drawMoonPhase` logs.
- **Independent checks (solar system):** weekly 2026–2030 sampling of angular size for all eight bodies and magnitude for Venus/Jupiter/Mars/Saturn against the published ranges in the phase file (all inside, no range had to be widened); Sun direction equals the Moon provider's `sunDirection` within 1e-9; planet–Sun angle equals astronomy-engine `Elongation` within 0.5° (only when both are above 15°, so refraction doesn't matter); lit limb points toward the Sun for Mercury and Venus across dates and four phone rolls.
- **Sky orientation:** facing south at the meridian (lat 40°, alt 30°) north is up (π/2), PA 90° (east) is left (π). Left-of-north is also checked independently: the camera's screen-right points west. Roll signs came from an explicit construction (up' = cos·up + sin·right), not from the implementation, and +20° shifts both angles by +20°. Pole fallback returns π/2.
- **Renderers:** each planet's call pattern (Mars plain, Jupiter four bands plus one clip, Venus terminator widths, Saturn back-ring/disc/front-ring order, ring ratio including the 0.08 floor, ring rotation and its +20° roll response); display radii.
- **Sun safety (rendered components):** the align button exists for the Moon and a planet (with the right aria-label) and never for the Sun; the app shell shows the banner and a disabled camera toggle for the Sun, and neither for the Moon.
- **Engine:** the full find flow for Jupiter via `?target=jupiter` emits `found` with `targetId: 'jupiter'`.

Bundle: main 89.5 KB gzipped (limit 150 KB).

## Decisions

- `TargetState.phase.name` is now `string` (planets use `new | crescent | quarter | gibbous | full`, no waxing/waning because the lit limb already shows it). The two Moon-only call sites cast to `MoonPhaseName`.
- Planet `phaseDeg` uses the Moon's convention (0 = new, 180 = full), computed as `180 − phase_angle`.
- A planet's display radius is the globe; Saturn's rings are drawn out to 2.25× that radius but don't change the on-screen test.
- Ring/band orientation: the east-west line is `north + 90°` on screen; canvas rotation is its negative, plus a 6° cosmetic twist for the rings.
- The Sun toast reads "Found the Sun in X.Xs" (article added); other planets "Found Jupiter in X.Xs".
- `recordingContext()` was moved out of the Moon spec into `render/testing/recording-context.ts` and returns a gradient stub so planet drawing can be recorded.

## Deviations

- None from the spec.

## Open questions

- Whether ring-plane twist (+6°) should be clockwise or counterclockwise on screen: the phase says "+6°" and it is cosmetic, so I used counterclockwise (the y-up convention used everywhere else).
- Uranus (mag ~5.7) and Neptune (~7.8) are drawn at the 3.5% minimum size like the others, so they look as prominent as Jupiter. Phase 5's picker is meant to say they are too faint to see.

## Out of scope, noticed

- The intro still says "Find the moon. Move your phone until it appears." for every target, and the share text/`<title>` are Moon-only.
- The unused-sprite size for faint targets and the find threshold (still 0.35 of half the shorter side) are placeholders for Phase 4.
- Align mode stays open if the selection changes under it (only possible through the debug selector today).
- Camera mode and the FOV slider are still untested on Android, as noted in Phase 2.
- Nothing is pushed.

## Manual field test (for the human)

1. Check which planets are above the horizon tonight: open `?debug`, pick each planet in the selector, note its altitude (positive = up).
2. Outside, for each planet that's up and bright (Venus, Jupiter, Saturn, Mars are naked-eye): `?target=<id>`, find it, then look up. Is the real planet where the drawn one is? Copy a report for at least one.
3. During the day, try `?target=sun` without looking at the Sun: check the banner, camera disabled, alignment hidden.
