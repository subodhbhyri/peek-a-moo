# Phase 3 — Sun and planets

> Read `docs/ARCHITECTURE.md` (§2, §5, §8) and `docs/phases/phase2-report.md` first.
> Adds 8 targets: Sun, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune. No picker yet — targets are chosen with `?target=<id>` (and a debug-only selector). The Moon must not change.

## Out of scope

The picker / availability labels (Phase 5), stars and deep sky (Phase 4), per-target personality voices (Phase 7), satellites.

---

## Task 1 — Catalog entries

Add to `core/targets/catalog.ts` (ids exactly as below; `category: 'solar-system'`):

| id | name | kind | render | color (fill) | radius km (equatorial) |
|---|---|---|---|---|---|
| sun | Sun | sun | sun | #fff4d6 | 695700 |
| mercury | Mercury | planet | planet (phased) | #b8b2a8 | 2439.7 |
| venus | Venus | planet | planet (phased) | #f3e7c4 | 6051.8 |
| mars | Mars | planet | planet | #d9744a | 3396.2 |
| jupiter | Jupiter | planet | planet (banded) | #e3c9a3 | 71492 |
| saturn | Saturn | planet | planet (ringed) | #e8d49a | 60268 |
| uranus | Uranus | planet | planet | #a8dbe0 | 25559 |
| neptune | Neptune | planet | planet | #5d7fd6 | 24764 |

Put the radius and render options in the def (e.g. `planet: { radiusKm, color, phased?, rings?, bands? }`). Write a one-line, factual blurb for each.

## Task 2 — Solar-system provider

`core/targets/providers/solar-system.ts`:

- Position: `Equator(body, date, observer, true, true)` → `Horizon(date, observer, ra, dec, 'normal')` (same path as the Moon).
- `distanceAu` from the equatorial result; `angularSizeDeg = 2·asin(radiusKm / (distanceAu·149597870.7))` in degrees.
- `Illumination(body, date)` → `magnitude` (`mag`), and for phased planets `phase.illuminatedFraction` (`phase_fraction`). Saturn: also `ring_tilt` → `TargetState.rings = { tiltDeg }`.
- `sunDirection` for every planet (for the lit limb); not for the Sun.
- Sun: no Illumination call; magnitude −26.7 constant.
- Register in `compute.ts` for kinds `sun` and `planet`.

**Tests (independent checks, not self-snapshots):**
- Angular size across 2026–2030 sampled weekly stays within published ranges: Mercury 4.5–13.0″, Venus 9.5–66.0″, Mars 3.5–25.2″, Jupiter 29.5–50.2″, Saturn (globe) 14.5–20.8″, Uranus 3.3–4.1″, Neptune 2.2–2.4″, Sun 31.4–32.7′.
- Magnitude ranges over the same sampling: Venus −4.9…−3.8, Jupiter −2.95…−1.6, Mars −2.95…+1.9, Saturn −0.6…+1.5 (rings included).
- Sun direction from the Sun provider equals `TargetState.sunDirection` from the Moon provider at the same instant within 1e-9.
- Elongation: angle between our planet and Sun directions agrees with astronomy-engine `Elongation(body, date).elongation` within 0.5° (topocentric vs geocentric).
- Inner planets' lit limb points toward the Sun (dot product of the screen-space limb vector with the projected Sun direction > 0) for a few configurations.

## Task 3 — Sky-north helper (used by Saturn's rings now, extended objects in Phase 4)

`core/projection/sky-orientation.ts`:

```ts
/** Unit ENU vector to the north celestial pole for an observer at latitude φ: directionFromAzAlt(0, φ). */
export function northCelestialPole(latitudeDeg: number): Vec3;
/** Screen angle (y-up radians) of celestial north at the target. */
export function skyNorthScreenAngle(targetDir: Vec3, ncp: Vec3, cam: CameraBasis): number;
/** Screen angle for a sky position angle (degrees, measured from north through EAST). */
export function positionAngleToScreen(northScreenRad: number, paDeg: number): number;
```

Tangent toward the pole: `t = ncp − d·(ncp·d)`, then `atan2(t·up, t·right)`. Viewed from the ground, **east is to the left of north**, so PA rotates counterclockwise on screen: `screen = north + PA`.

Tests: observer at lat 40°, target due south on the meridian at alt 30°, upright phone facing it with no roll → north is up (π/2), PA 90° (east) is left (π). Rolling the phone by +20° shifts both by the same amount. Target at the pole → defined fallback (return π/2), no NaN.

## Task 4 — Renderers

In `core/render/`:

- Extract (if not already separate) the terminator drawing from `moon-phase.ts` into `drawPhasedDisc(ctx, x, y, r, fraction, brightLimbRad, { lit, dark })` and make `drawMoonPhase` call it. **Moon output must be pixel-identical**: add a test that renders the Moon to an offscreen canvas before/after (if jsdom canvas is unavailable, test that `drawMoonPhase` calls `drawPhasedDisc` with the same args it previously used internally, and say so in the report).
- `draw-planet.ts`: disc of the planet color with a soft glow; `phased` → `drawPhasedDisc`; `bands` → 3–4 faint horizontal bands clipped to the disc (orient bands perpendicular to sky north ±; cosmetic); `rings` → ellipse ring with minor/major = `max(sin(|tiltDeg|), 0.08)`, major axis perpendicular to sky north + 6° (cosmetic), drawn back half before the disc and front half after.
- `draw-sun.ts`: bright disc + wide soft glow. No face, ever.
- Display radius in `display.ts`: Sun uses the Moon formula with its own angular diameter. Planets: `max(minPlanetPx, trueSizePx)` with `minPlanetPx = 0.035 × min(w, h)`, Saturn's ring extends to 2.25× globe radius. Keep the Moon unchanged.
- Find threshold: keep 0.35 for everything this phase; leave the existing TODO.

## Task 5 — Sun safety (required)

When the selected target is the Sun:
- Persistent banner at the top: **"Never look at the Sun — not directly, not through your camera."**
- Camera toggle disabled with `aria-disabled` and a tooltip/line "Camera is off for the Sun."; if the camera was on, turn it off on selection.
- Found moment: no face; line is the safety message "Found it. Now look away from it." Toast "Found the Sun in Xs".
- Alignment (Phase 1) is **disabled** for the Sun (it would require looking at it).

## Task 6 — Found moment for planets (minimal, Phase 7 adds voices)

- No face for non-Moon targets.
- One short generic line per target from a small table (e.g. Jupiter: "Jupiter. Bigger than everything else here, combined." Venus: "That bright 'star'? Venus."). Factual, one per planet, no personality system changes.
- Corner toast: "Found {name} in X.Xs" (Moon keeps its exact v1 text and phase emoji).
- Stats: per-target (Phase 2 schema). Lifetime-based Moon lines keep using what they use today.

## Task 7 — Debug-only target selector

In the `?debug` overlay: a `<select>` listing all catalog targets → `TargetSelectionService.select(id)`. Show current target's az/alt/magnitude/angular size. Copy report already includes `targetId` and `target`.

## Acceptance criteria

- [ ] Phase 2 characterization tests unchanged and passing; Moon pixel-identity (or call-equivalence) check passes.
- [ ] New tests for Tasks 2–4 pass; report the new total.
- [ ] `?target=jupiter` etc. work on a laptop in drag mode: the planet renders at the right size/color, Saturn shows rings, Venus/Mercury show phases, the edge glow points the right way, the find flow completes.
- [ ] Sun safety: banner, camera disabled, alignment disabled.
- [ ] `npm run format && npm run lint && npx ng test --watch=false && npm run build` pass; bundle < 150 KB gzipped.
- [ ] `docs/phases/phase3-report.md` per ARCHITECTURE §8 with the manual steps below.

## Manual field test (for the human)

1. Check which planets are above the horizon tonight: open `?debug`, pick each planet in the selector, note its altitude (positive = up).
2. Outside, for each planet that's up and bright (Venus, Jupiter, Saturn, Mars are naked-eye): `?target=<id>`, find it, then look up. Is the real planet where the drawn one is? Copy a report for at least one.
3. During the day, try `?target=sun` without looking at the Sun: check the banner, camera disabled, alignment hidden.
