# Phase 4 report — Stars and deep sky

Status: implemented; `npm run format && npm run lint && npx ng test --watch=false && npm run build` pass. Phase 3 is committed (`6af9037`); the Phase 4 work is **not committed**. Not yet checked on a device.

## What changed

**Task 0 — type cleanup.** `TargetState.phase` is now a discriminated union, `MoonPhaseInfo | PlanetPhaseInfo` (`kind: 'moon' | 'planet'`), with `name` typed as `MoonPhaseName` or `PlanetPhaseName`. Both `as MoonPhaseName` casts are gone; the Moon call site narrows with `phase?.kind === 'moon'`. Done and green before any new code was added: the Phase 2 characterization spec and the Phase 3 Moon draw-call pin have **no diff** (`git diff` on both is empty). `targets.spec` and `draw-target.spec` (mine, not pins) gained `kind` in their literals.

**Task 1 — catalog.** Ten fixed-sky entries, coordinates copied exactly as specified: Polaris, Sirius, Betelgeuse, Vega, Arcturus (`render: 'star'`, with `bv`) and M31, M42, M45, Galactic Center, LMC (`render: 'extended'`, with `sizeDeg`, `positionAngleDeg`, `style`). `fixed.style` and `fixed.bv` added to the type; `fixed.magnitude` is now `number | null`. The Galactic Center blurb says it is hidden behind dust, not visible to the eye, at the center of the Milky Way, ~26,000 light-years away.

**Task 2 — provider** ([fixed-sky.ts](../../src/app/core/targets/providers/fixed-sky.ts)): `VectorFromSphere` → `Rotation_EQJ_HOR` → `HorizonFromVector(…, 'normal')`. Returns the catalog magnitude, the major axis as `angularSizeDeg` (0 for stars) and `skyNorthDirection` from `northCelestialPole`. The rotation matrix is cached for the most recent (time rounded down to 1 s, observer). Registered for `fixed` in `compute.ts`.

**Task 3 — renderers**
- [draw-star.ts](../../src/app/core/render/draw-star.ts): brightness `clamp(10^(−0.4(mag−1)), 0.15, 4)`, core `2.5 + 2√brightness` px, glow 6× core, B−V color from the specified table (piecewise lerp, clamped), ±8% twinkle at 1.5 Hz, none under `prefers-reduced-motion`.
- [draw-extended.ts](../../src/app/core/render/draw-extended.ts): procedural only. Galaxy (halo capped at alpha 0.35 plus a compact core), nebula (3–5 seeded blobs, pink/teal), cluster (haze plus 7–10 seeded dots), marker (dashed circle, crosshair, label "Galactic Center (hidden behind dust)", no glow). Major axis rotated by `positionAngleToScreen(skyNorthRad, PA)`; a `washoutScale` keeps a huge object from flooding the screen.
- `SkyFrame` now also carries `viewport` (needed for size-dependent alpha).
- `display.ts`: extended objects use true semi-major axis floored at the planet minimum (3.5% of the short side); stars use their glow radius.

**Task 4 — find threshold.** `centeredThreshold = max(0.35, min(0.8, 0.8·r / (min(w,h)/2)))`. Closes the Phase 2 TODO.

**Task 5 — found moment.** One factual line per new target (Polaris and Galactic Center exactly as specified), toast "Found {name} in X.Xs", no face. When a found non-Moon target has magnitude `null` or `> 6`, a small extra line under the toast reads "Not visible to the eye — it's there, behind dust." (generic helper `isNotNakedEye`, reusable in Phase 5). Debug overlay already shows magnitude and size for every catalog entry, including the new ones.

## Tests

182 before Phase 4 → **219 now** (22 files). New:
- **Provider oracles:** all ten fixed targets at 3 dates agree with the second library path (`DefineStar(Star1) → Equator → Horizon`) within 0.05° alt and az (azimuth weighted by cos(alt) so Polaris's ill-conditioned azimuth doesn't fail spuriously); Polaris within 1.0° of the latitude over 48 h at lat 39.6 and always below the horizon at lat −30; Vega's maximum altitude = `90 − |lat − dec|` within 0.3°; the LMC never exceeds 0° at lat 39.6; M31 at 2026-10-25T09:54Z from (39.6, −104.7) lands within 0.1° of the planning reference (alt 40.7°, az 294.9°); the cache behaves (same 1 s bucket, different observer, different second).
- **Catalog:** the ten ids with the exact coordinates, magnitudes, sizes, PAs, styles and B−V values.
- **Renderers:** brightness/size formulas and clamps; B−V table nodes, clamps and a midpoint; twinkle bounds; star color and size in the recorded calls; reduced-motion steadiness; extended geometry for every style (halo + core, 3–5 seeded blobs identical every frame, 7–10 dots, marker with dashed circle/crosshair/label and no gradients); seeding; washout.
- **Orientation:** M31's recorded canvas rotation equals `−positionAngleToScreen(skyNorthScreenAngle(…), 35°)` for four phone rolls (0°, 20°, −45°, 130°); a +20° roll turns the drawn axis by +20°; PA 0 is up and PA 90 is left facing south. Rotation signs come from those tests (positive screen angles are counterclockwise, canvas rotation is the negative).
- **Threshold:** exactly 0.35 for the Moon (including the exact v1 radius 43.6902507469285), the Sun, all seven planets and all five stars; loosens above 87.5 px and caps at 0.8.

Bundle: main 92.5 KB gzipped (limit 150 KB).

## Decisions

- Extended `radiusPx` is the **semi-major** axis; the minimum sprite uses the same 3.5%-of-short-side figure as planet radii.
- With today's 62° vertical FOV the formula only loosens the threshold above an 87.5 px radius, so M31 (~18 px) and the LMC (~63 px) both stay at 0.35 on a 400 px-wide phone. They loosen in a narrow FOV (tested at 10°). I followed the specified formula; if you want big objects looser in the default view, the constant is the lever.
- Stars' display radius is the glow radius, so a star counts as on screen while its glow is.
- Stars with a null magnitude would be treated as magnitude 6 (none exist).
- "Orion's sword" would have put an apostrophe in a string; the M42 blurb says "the sword of Orion" instead.

## Deviations

- None from the spec.

## Open questions

- Is a 3.5%-of-short-side floor right for the Galactic Center's 2° marker? It currently draws at about 14 px radius (its true size is ~11 px).
- Stars are all the same size class in the picker/hit logic; faint stars (Polaris, mag 1.98) read small. Fine for now.

## Out of scope, noticed

- The intro still says "Find the moon." for every target, and the page title/share text are Moon-only (Phase 5).
- Rise/set and "below the horizon" labels for targets such as the LMC come with the picker in Phase 5; today the LMC just never appears.
- `centeredThreshold` for stars is purely size-based (0.35); there is no magnitude-aware leniency.
- Nothing is pushed.

## Manual field test (for the human)

1. Outside after dark, `?target=polaris`. Find it, then look: it's the lone medium-bright star roughly above due north at the height of your latitude (~40° in Colorado). Copy a report.
2. Late October evening/night: try `?target=m45` (Pleiades, east in the evening, high after midnight) and `?target=m31` (high in the east/northeast in the evening). The Pleiades are an obvious little clump; Andromeda is a faint smudge under dark skies — in a city, just check the overlay lands in the right patch near the "W" of Cassiopeia.
3. Pre-dawn or late night: `?target=sirius` / `?target=betelgeuse` (Orion rises late evening in October).
4. `?target=lmc`: from the US it should say it's below the horizon / never come on screen. Note what happens (Phase 5 adds proper labels).
