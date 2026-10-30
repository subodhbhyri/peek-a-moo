# Phase 10 report — Constellations, background stars, red night mode

Status: implemented. `npm run format && npm run lint && npx ng test --watch=false && npm run build` all pass (format:check clean, lint clean, build with no warnings). **Nothing is committed** (Phases 8–9 were already committed and pushed when I started: HEAD `042a891` = `origin/main`). Not checked on a device.

**Numbers**

| | Phase 9 | Phase 10 |
|---|---|---|
| Tests | 603 (57 files) | **716 (71 files)**, +113 |
| Main bundle, gzipped | 129.66 KB | **137.81 KB** (limit 150) |
| `sky.json`, raw / gzipped | – | **73,519 B / 28,673 B (28.0 KiB)** (target < 40 KB gz) |
| `LICENSE-d3-celestial.txt` | – | 1,491 B |

The main bundle gained about 8 KB gzipped: the 88-row name index, the 66 facts and 22 found lines, the catalog/provider/draw code and the night mode. **No star or figure coordinates are in it**: I grepped the built `main-*.js` for the first star, Betelgeuse, Arcturus and an Orion vertex (none found); only the `/data/sky.json` URL string is there. `ngsw.json` lists `sky.json` under the lazy `data` group.

## Timings (Task 3)

Measured with a throwaway spec (deleted), run alone on this desktop, Node/V8 under jsdom, 1,000 samples after warm-up. **Not measured on a phone, and the canvas draw cost is not included** (jsdom has no canvas; the draw numbers use a no-op context). Expect a phone to be several times slower; the headroom is large.

| What | median | p90 | p99 | max |
|---|---|---|---|---|
| Transform: rotate 1,627 stars + 981 points (893 vertices + 88 label anchors) into ENU with refraction, once per second | **0.28 ms** | 0.33 ms | 0.61 ms | 1.99 ms |
| Projection of the same 2,608 points per frame | **0.011 ms** | 0.017 ms | 0.034 ms | 0.19 ms |
| Whole Look Around frame (all 22 targets + projection + label layout + draw calls, no-op canvas) | 0.063 ms | 0.096 ms | 0.38 ms | 1.06 ms |
| Building the geometry from the parsed file (once, after load) | 4.5 ms | | | |
| One constellation's availability scan (48 h, 10-min steps) | 0.33 ms | 0.68 ms | 2.2 ms | |

Per second the transform runs once; every frame is only dot products into reused `Float32Array`/`Uint8Array`s (a test checks the arrays are the same objects across calls). Star drawing is batched into at most 72 `fill()`s (size × color × above/below horizon), so a frame costs dozens of canvas fills rather than a thousand.

## Task 1 — Data (d3-celestial 0.7.35, BSD-3-Clause)

- `d3-celestial@0.7.35` added as an **exact-pinned devDependency** (`"d3-celestial": "0.7.35"`, no caret); the script refuses to run on any other version or license. Nothing from it is imported into the app.
- `scripts/sky-data.mjs` writes `public/data/sky.json` in the specified shape (`version`, `source`, `stars: [ra, dec, mag, bv|null][]`, `constellations: {id, iau, name, english, rank, lines, label}[]`), plus `public/data/LICENSE-d3-celestial.txt` (copied verbatim from the package) and `src/app/core/sky/constellation-index.ts` (see Deviations). Run with `node scripts/sky-data.mjs`; it exits non-zero and writes nothing if any count is off.
- I checked the data against the spec before trusting it: 5,044 stars in `stars.6.json`, **1,627 with mag ≤ 5.0**; Betelgeuse 88.7929 / 7.4071 and Arcturus lon −146.0847 → RA 213.9153 as stated; 893 line vertices; Serpens has two line features and two label features (merged, below). One star has no B−V (stored `null`). Stars are sorted brightest first.
- **88 constellations**, rank counts 22 / 24 / 42 (d3-celestial's 22 / 24 / 43 counts Serpens twice). Serpens is one entry (`serpens`) with both halves' polylines; its label is the Caput (head) label point.
- Slugs are the Latin name with accents stripped (`bootes`, `ursa-major`, `coma-berenices`); uniqueness is checked in the script and again in a test across the whole catalog.
- Latin name = d3-celestial `properties.name` (`Boötes`, `Canis Major`). I did not use its `la` field: it uses classical spellings (`Canis Maior`).
- **English names I changed from d3-celestial's `en` (29):**
  And "Andromeda"→Chained Maiden · Aqr "Aquarius"→Water Bearer · Cae "Graving tool"→Chisel · Cap "Capricorn"→Sea Goat · Cas "Cassiopeia"→Seated Queen · Cep "Cepheus"→King · Cet "Whale"→Sea Monster · Cha "Chamaeleon"→Chameleon · Cir "Compass"→Drawing Compass · Cru "Cross"→Southern Cross · Dor "Goldfish"→Dolphinfish · Equ "Colt"→Little Horse · Eri "Eridanus"→River · Her "Hercules"→Strongman · Hya "Sea Serpent"→Water Snake · Hyi "Hydrus"→Lesser Water Snake · Lib "Balance"→Scales · Men "Mensa"→Table Mountain · Nor "Level"→Carpenter's Square · Oph "Ophiuchus"→Serpent Bearer · Ori "Orion"→Hunter · Peg "Pegasus"→Winged Horse · Per "Perseus"→Hero · Pic "Painter"→Painter's Easel · Pup "Poop Deck"→Stern · Pyx "Compass"→Mariner's Compass · UMa "Big Dipper"→Great Bear · UMi "Little Dipper"→Little Bear · Vir "Virgin"→Maiden.
  The other 59 keep their `en` (some of those source strings contain U+2005 spaces instead of ordinary spaces; the generated values use plain spaces, so those are not counted as changes). Several of mine are judgment calls for names that have no plain English meaning (Andromeda, Cepheus, Hercules, Perseus); change them in the `ENGLISH` table at the top of the script and re-run.
- Credited in the README (Credits + a "Star map" paragraph) and in a small credits line at the bottom of the target picker's list, linking d3-celestial and the license file.

## Task 2 — Sky data service (lazy)

- `core/sky/sky-data.service.ts`: `load()` does one `fetch('/data/sky.json')` with a 15 s timeout, validates the structure (`isSkyFile`: 88 constellations, > 1,000 stars, all pairs finite) and builds the typed-array geometry (`sky-geometry.ts`): J2000 EQJ unit vectors via `VectorFromSphere` (the fixed-sky provider's path) for every star and every line vertex/label anchor. No retries; after a failure the next attempt waits 5 minutes (same policy as `GpService`). Concurrent calls share one request.
- It is called from exactly two places: **Look Around starting** (`enterLook`, including `?mode=look` and a remembered Look Around at start-up) and **a constellation being the selected target** (the engine's effect). Tests (`app.sky.spec.ts`, modeled on the Phase 6 `app.satellite.spec.ts`): no `sky.json` request at app start for the Moon, a planet, a star, a deep-sky object or a satellite; none when the picker opens; none when a constellation's info card opens; exactly one for `?target=orion`, one for `?mode=look`, one when Look Around is chosen from the picker.
- On failure: Look Around draws exactly as before (no stars, no figures; a test checks the frame has no `sky` and no second request), and a selected constellation shows **"Star map unavailable"** (and "Getting the star map…" while loading) in the same slot as the satellite orbit-data message.

## Task 3 — Fast horizon transform

- `core/sky/sky-field.ts` — `SkyField`: `update(date, pos)` gets `Rotation_EQJ_HOR` (cached per second/place in `horizon-rotation.ts`), rotates all stars and points into ENU into preallocated `Float64Array`s, and adds refraction exactly as `HorizonFromVector(v, 'normal')` does (`Refraction('normal', alt)` added to the altitude, horizontal part rescaled). It no-ops within the same second and place (tested). `project(basis, viewport)` is the pinhole projection of `projectDirection` into `Float32Array`s (checked against `projectDirection` for every star and point, including which are behind the camera).
- **Axis mapping, derived from the 5-star overlap rather than assumed:** `sky-field.spec.ts` takes Polaris, Sirius, Betelgeuse, Vega and Arcturus at 3 dates, rotates each with astronomy-engine, converts to our ENU through the independent az/alt path, then tries **all 48 signed axis permutations**. Exactly one fits (worst error 7e-16): **East = −y, North = x, Up = z** of astronomy-engine's horizontal vector. (It happens to match the library's documented x = North, y = West, z = Up, but the test, not the docs, is the authority.) The code in `rotateToEnu` uses that mapping and says where it came from.
- **Parity with the Phase 4 provider:** the same five stars, found in `sky.json` by position, 3 dates × 3 places (Denver, Sydney, Abu Dhabi; 45 cases, > 5 of them below the horizon so refraction is exercised) — **worst difference 0.00005°** against the required 0.02°. That residual equals the difference between the catalog's and `sky.json`'s star positions (0.00001–0.00005°), so the transform itself is exact. A separate test checks a star at the horizon is lifted 0.4–0.7° by refraction.
- Timings: see the table above.

## Task 4 — Look Around: stars and constellations

Draw order is as specified: horizon/cardinals → constellation lines → background stars → target markers (with their labels, as before) → constellation names.

- **Background stars** (`render/draw-sky.ts`, `sky/star-style.ts`): radius and opacity from magnitude via the Phase 4 `starBrightness` curve at a smaller scale (about 0.7–1.9 px radius, 6 size classes), color from B−V through the Phase 4 `bvToColor` table (6 bins). **Below the horizon: 25% opacity.** No labels. Always on.
- **Lines:** 1 CSS px, 0.25 alpha; a segment is drawn only if **both ends are in front of the camera** (tested: looking straight away from Orion draws nothing); segments wholly off the same side of the screen are skipped. Below the horizon (either end): **half that alpha, dashed**.
- **Names:** uppercase, letter-spaced (`ctx.letterSpacing`, 2 px, where the canvas supports it; plain otherwise), 10 px semibold, dimmer ink than the target labels. They go through the Phase 8 label layout as lower-priority requests: I extended `LabelRequest` with optional `tier` (targets 0, names = rank 1–3, placed first-come by tier) and `centered` (the name sits centered on its point). Existing behavior is untouched (no field set → identical results; the Phase 8 layout specs pass unmodified). Names that would overlap a target label, a target marker or another placed name are hidden.
- **Toggle:** a "Constellations" chip, bottom-right, only in Look Around, `aria-pressed`, persisted in `ptm.constellations` (default on). Off hides figures and names; stars stay.
- **Accessibility:** the Phase 8 live region now reads "On screen: …. Constellations: Orion, …" (Latin names, proper case, those whose name point is on screen, only when constellations are on).
- Performance: see the table; the Look Around frame with all of this is ≈ 0.06 ms of our own work on this machine. `look-perf.sky.spec.ts` asserts median < 6 ms and p90 < 16 ms (generous, for shared CI). The existing `look-perf.spec.ts` (22 targets) is untouched.

## Task 5 — Constellations as targets

- `TargetKind` `'constellation'`, category `'constellations'`, render `'constellation'`; `TargetDef.constellation = { iau, english, rank }`. 88 entries, ids are the slugs; **unique across the whole catalog (tested)**. `TARGETS` is still the 22 (the Look Around loop, the Phase 8 perf spec and the "22 targets" tests rely on that); `ALL_TARGETS` = 22 + 88 and `getTarget` covers all of them.
- **Provider** (`providers/constellation.ts`): direction = normalized mean of all line-vertex unit vectors (duplicates count, as written), rotated like fixed-sky targets (refraction included); `angularSizeDeg` = 2 × the largest angle from that center to any vertex; magnitude `null`. Checked against an independent astronomy-engine oracle for five constellations at two places, to 1e-6°.
- **Find mode** (`render/draw-constellation.ts`): background stars dimmed to 0.6, the figure's lines at 0.8 alpha (1.5 px, dashed and dimmer below the horizon), a larger dot on every star of the figure, and its name. Drawn when the figure is on screen, so the screen stays dark until it slides in, like every other target. Display radius is the figure's true size (half-angle capped at 70°); the existing size-aware threshold then gives big figures the loose 0.8 threshold and small ones (Crux) the usual one. Edge glow works unchanged off the same projection. Cadence: 30 s like other fixed targets.
- **Availability:** the existing scan on the center direction. New: **"Partly up"** (tone `meh`) when the center is at or below the horizon but at least one vertex is above it (apparent altitude, refraction included); `Availability.partlyUp` and `TargetState.constellation.partlyUp` carry it. Visibility is judged as a naked-eye object (`CONSTELLATION_NOMINAL_MAG = 3`), so a dark sky says "Up now" and a daylight sky says "Up, but the sky's too bright". **"Never rises from here"** uses the figure's declination range (no vertex can ever clear the horizon at this latitude; Octans from Denver). The intro note says "…is partly up right now: its middle is below the horizon, but part of it is above." The oracle test checks `partlyUp` for all 88 constellations × 2 places × 4 times, and requires that the sweep actually contains up, partly-up and fully-down cases.
- **Picker:** a **Constellations** section after Satellites, rank 1 first then alphabetical (the 22 prominent ones); **"Show all 88" / "Show fewer"** toggle; **search always covers all 88**, matching the Latin name, the English meaning, the id and the IAU abbreviation ("great bear" → Ursa Major; "hunter" → Orion; "southern cross" → Crux; "uma" → Ursa Major). Constellations never appear in "Best right now" (that list is built from the 22 only; a test seeds Orion as visible and checks it stays out). Rows show their one-line blurb ("The Hunter.") until the star map is loaded, then a status.
- **Info card:** type "Constellation"; description exactly `{Latin} — the {English}. One of the 88 constellations recognized by the International Astronomical Union.`; rank-1 constellations have exactly three facts (written by me from long-established astronomy, comments beside each, same rules as Phase 8), rank 2–3 have none and the card shows no empty list. Live row: **"Right now": "Up from here" / "Partly up" / "Below the horizon"**. The Phase 8 info tests now allow 0 facts only for constellations of rank 2–3.
- **Found moment:** no face. Toast "Found {Latin} in X.Xs" (the existing default branch); rank-1 constellations get one short line each in the plain voice (`personality/constellation-lines.ts`), the others "Found {Latin}."; the "not visible to the eye" note is suppressed for them (a pattern is not a faint object).

## Task 6 — Red night mode

- Eye button next to the camera toggle (`aria-label="Red night mode"`, `aria-pressed`), key **`n`** (ignored while typing in an input), persisted in `ptm.night`, restored at start-up.
- Implementation as suggested, in its own tiny component (`features/night-overlay`): a full-viewport `position: fixed`, `z-index: 1000` layer above everything (the picker is 21, the info card 31), `pointer-events: none`, `aria-hidden`, `mix-blend-mode: multiply`, `background: #b30000`. One layer does both jobs: multiplying by (179, 0, 0) keeps only the red channel of the canvas, camera feed, picker and cards **and** dims them to 70%. I did not find a cheaper approach to switch to (a CSS `filter` on the root would force re-rasterizing the canvas); I could not test the compositing cost on a phone — see Manual checks.
- `<meta name="theme-color">` becomes **`#000000` while on** and returns to what it was when off.
- **Sun safety banner:** it is raised *above* the overlay (z-index 1001) and drawn in pure red on black while night mode is on. A dim red multiply can reach at most about 2.4:1 contrast between text and background; red `#ff0000` with black text is about 5.3:1, so it stays clearly readable (and still pure red, so it does not hurt dark adaptation).
- Tests: toggle state persists; the overlay element exists only when on, is `aria-hidden`, not focusable, has no children, and its CSS is `pointer-events: none` / `mix-blend-mode: multiply` / `position: fixed` / red-only background / z-index above all other UI; the `n` key works and is ignored in fields; theme-color goes to `#000000` and back; the Sun banner is above the filter in red/black.

## Task 7 — Analytics

`night_mode_toggled { on }` and `constellations_toggled { on }`, added to the typed event table, the exact-property test (`ALLOWED`) and the `?debug` silence test. Constellation finds reuse `target_selected` / `target_found` with the slug (tested with `orion`).

## Pins and scope

Providers (`moon`, `solar-system`, `fixed-sky`, `satellite`), `satellite-passes.ts`, the satellite pipeline, `find-tracker.ts`, the find flow for the 22 targets, and Phase 9 location were **not modified** (`compute.ts` gained one switch case and an optional fifth parameter; `availability.ts`/`availability.service.ts`/`sky-engine.service.ts` gained additive constellation handling). The Phase 2 characterization spec, the Phase 3 Moon pins and `find-lines.spec.ts` pass with **no expected-value edits**.

**Existing specs I did edit, and why** (none is a pin; each reflects the new section/feature rather than weakening an assertion):
- `target-picker.spec.ts`: section order now ends with "Constellations" and the expected rows include the 22 prominent constellations; searching "ANDRÔMEDA" / "orion" now also returns the constellation of that name; clearing a search shows 22 + 22 rows; the Tab-trap test also includes the new credits link as a focusable.
- `app.look.spec.ts`: the picker has 22 + 22 `(i)` buttons.
- `target-info.spec.ts`: loops over `ALL_TARGETS`; 3 facts, except 0 for constellations of rank 2–3 (as the phase file asked).
- `analytics.service.spec.ts`: two new entries in the allowed-properties table plus the Phase 10 tests.

## Decisions and deviations from the spec

1. **The 88 catalog entries come from a generated index (`constellation-index.ts`), not from `sky.json` at load time.** The spec says "generate catalog entries from `sky.json` at load time", but `?target=orion` and a remembered selection must resolve synchronously at start-up, before (and without) any fetch, and `getTarget` is synchronous. So the same script writes a small TypeScript index (id, IAU, Latin name, English meaning, rank) from the same data, and a test checks it equals `sky.json` row for row. The figures (lines, stars, label points) are only in `sky.json`.
2. **`sky.json` is loaded only by Look Around and by selecting a constellation — nothing else.** In particular the picker and the info card do **not** load it (the spec says "only"). Consequences: constellation rows in the picker show their blurb instead of a status until the map has been loaded by one of those two things (after which statuses appear), and a constellation's info card shows its description and facts but no "Right now" row until then. Making either one fetch is a one-line change each; see Open questions.
3. **`theme-color`:** the spec says it "already is" `#000000`; it was `#030303`. It is now `#000000` while night mode is on and restored after.
4. **Overlay color is `#b30000` (70%), not `#ff0000`+separate dim**, because one multiply layer does both; the 70% is my estimate of "about 60% perceived brightness" (perceived brightness is not linear in the channel value). It is a single value in `night-overlay.ts` to tune.
5. **The Sun banner sits above the overlay** (see Task 6) rather than under it.
6. **Credits line:** the target picker had no credits line, so I added one at the bottom of its list (d3-celestial, BSD-3-Clause, link to the notice). The city picker already credits GeoNames in its own line.
7. **Live row label:** the spec lists the three values only; I labelled the row "Right now" so it reads "Right now — Partly up".
8. **Serpens' label** is the Caput label point (the two halves have separate ones).
9. `app.css` hit its 4 kB component-style budget by 35 bytes, so the overlay moved to its own component (no budget warning in the build).

## Open questions

- Should the picker (when its Constellations section is shown) and the constellation info card be allowed to fetch the star map, so their status rows are filled in for a first-time visitor? Strictly reading "only when Look Around starts or a constellation target is selected", I did not. The satellites precedent (orbit data loads when the Satellites section renders) argues for yes.
- Are the English names I chose for the nameless-in-English constellations (Chained Maiden, King, Strongman, Hero, River, …) what you want to show? They are in one table at the top of `scripts/sky-data.mjs`.
- Should Look Around constellation names be tappable (open the constellation's info card, like target labels)? Not in the spec, so no.
- Should the weekly GitHub Action (or anything) regenerate `sky.json`? It changes only if d3-celestial is bumped, so I left it as a manual script.

## Out of scope, noticed

- `docs/ARCHITECTURE.md` §7's table had no rows for Phases 8 and 9; I added only the Phase 10 row (and the `sky/` folder and Constellations catalog lines).
- One full test run (the first one with the new specs) hit eight 5-second per-test timeouts in files that pass in isolation (CPU contention across 12 parallel workers, mostly the first test in a file), plus my own first perf assertion (a p99 bound, which is meaningless under contention; I switched it to the existing spec's median/p90 convention); three later full runs were clean (71 files, 716 tests), including the final gate. If it recurs on a slower CI machine, a `testTimeout` raise or fewer parallel workers is the fix, not these tests.
- Canvas drawing cost, camera-feed compositing under the multiply overlay, and `ctx.letterSpacing` behavior on iOS Safari could not be checked without a device.
- The Phase 8 `getTarget(...)`-based Look Around tap does not know about constellations (no hit targets for names), as noted above.
- Git reports `LF will be replaced by CRLF` for every touched file; that is the existing line-ending setup, unrelated to this phase.

## Files

New: `scripts/sky-data.mjs`; `public/data/sky.json`, `public/data/LICENSE-d3-celestial.txt`; `core/sky/` (`sky-data.types`, `sky-geometry`, `sky-data.service`, `sky-field`, `horizon-rotation`, `star-style`, `constellation-index` (generated), `constellation-facts`, `constellation-visibility`, `testing/sky-fixture`); `core/targets/constellation-targets.ts`, `core/targets/providers/constellation.ts`; `core/render/draw-sky.ts`, `core/render/draw-constellation.ts`; `core/personality/constellation-lines.ts`; `core/night/night-mode.service.ts`; `features/night-overlay/night-overlay.ts`; specs for each of these plus `app.sky.spec.ts`, `look-perf.sky.spec.ts`, `sky-engine.constellation.spec.ts`, `target-picker.constellations.spec.ts`, `target-info.constellation.spec.ts`, `draw-look.sky.spec.ts`, `label-layout.tiers.spec.ts`, `constellation-availability.spec.ts`, `constellation-targets.spec.ts`, `availability.service.constellations.spec.ts`.

Changed: `package.json`/`package-lock.json` (the pinned devDependency), `ngsw-config.json`, `README.md`, `docs/ARCHITECTURE.md`, `app.ts/html/css`, `analytics.service.ts`, `sky-engine.service.ts`, `target.types.ts`, `catalog.ts`, `compute.ts`, `cadence.ts`, `display.ts`, `availability.ts`, `availability.service.ts`, `availability-format.ts`, `live-stats.ts`, `draw-look.ts`, `draw-target.ts`, `label-layout.ts`, `sky-view.ts`, `target-picker.ts`, `target-glyph.ts`, `target-info.ts`.

## Manual checks (for the human)

1. Look Around at night: the background stars and stick figures line up with the real sky. Easy ones in late autumn evenings: Cassiopeia's "W" (northeast), the Great Square of Pegasus (high south), and later Orion rising in the east.
2. Sweeping feels smooth on your phone, with constellations on.
3. Picker → Constellations → "Orion" → find it. Search "great bear" finds Ursa Major.
4. Turn on red night mode outside for a few minutes: everything is red and dim, and you can still read the picker, info cards and Sun banner.
5. Toggle constellations off and on in Look Around.

Extra things I could not verify and would look at while doing the above: that the camera feed (📷) is red-tinted but still smooth under night mode on iOS; that the overlay is dim enough (tune `#b30000` in `features/night-overlay/night-overlay.ts`); that the figures' names read well on a small screen (they are 10 px, letter-spaced); and that opening Look Around fetches `sky.json` once (browser network tab) while the Moon-only start never does.

## Follow-up

Status: the three follow-ups are done. `npm run format && npm run lint && npx ng test --watch=false && npm run build` pass: **718 tests / 71 files**, main bundle **138.10 KB** gzipped (was 137.81; limit 150), no build warnings. Still nothing committed.

### 1. Star-map fetch triggers

The star map (`sky.json`) is now fetched in exactly four situations: Look Around starts; a constellation is the selected target; **the picker's Constellations section first intersects the viewport**; **a constellation's info card opens**. Never at app start, and never on picker open alone (the section is usually below the fold).

- Picker (`target-picker.ts`): the Constellations `<section>` carries `data-category`; an effect observes it with an `IntersectionObserver` once the sheet is rendered and calls `SkyDataService.load()` the first time it is intersecting, then disconnects. It also stops observing when the sheet closes or the map is already there. Where `IntersectionObserver` does not exist, the picker fetches nothing (selecting a constellation or Look Around still does).
- Info card (`target-info.ts`): opening a constellation's card calls `load()`; the live row ("Right now: Up from here / Partly up / Below the horizon") fills in when it arrives. Cards for anything else do not.
- One thing to know: I could not find an `IntersectionObserver` in the Phase 6 Satellites section. In this repo it loads orbit data from an effect when the section renders (`satellitesShown`), so the new Constellations trigger is stricter than that one, not "like" it. I left the Satellites code alone.
- Laziness tests (`app.sky.spec.ts`, `target-info.constellation.spec.ts`), with a fake `IntersectionObserver`: no `sky.json` request at app start (Moon, planet, star, deep sky, satellite); none on picker open — the section is merely *observed* (the observed element is checked), and an observer that fires with `isIntersecting: false` fetches nothing; **exactly one** when the observer reports intersecting (rows then show statuses instead of the blurb, a second observer firing cannot fetch again); **exactly one** when a constellation card opens (live row appears; closing and reopening does not fetch again); none for Jupiter, Sirius or M31 cards.

### 2. Test timeouts under load

- **Finding the slow specs.** I used the JSON reporter on a full run, first unrestricted and then pinned to 2 cores. Unrestricted (12 parallel workers) the slowest tests were 2–5 s, nearly all the **first test in a file** (cold start: JIT, jsdom environment about 7 s of CPU per file) plus about 0.5 s per full `App` bootstrap. Pinned to 2 cores, **every test except one finished in ≤ 1.1 s**; the "slow" numbers were 12-worker contention, not slow tests. I found no obvious wasteful cause to remove (no real timers in the App specs, no large data loaded per test: `cities.json` and `sky.json` are only read in specs that need them, and the sky geometry is built once per worker), so I made no speed-ups to the App specs.
- **The real failure was one test, not load.** Under 2-core CI conditions `city-picker.spec` "works offline on a first visit: the built-in capitals are searchable" (a Phase 9 test, not App-level) failed in 2 of the first 5 runs with a timeout at exactly 5000 ms (3 of 5 passed; alone it passed 8 of 8). It waited with `fixture.whenStable()` plus a real `setTimeout(0)`; I replaced that with `vi.waitFor` on the real condition (`CityService.status() === 'fallback'`), the same pattern the other tests in that file already use. I did not find out *why* `whenStable` stalls for 5 s only under load; the replacement does not depend on it.
- **Per-file timeouts.** `vi.setConfig({ testTimeout: 15_000 })` is now at the top of the seven specs that bootstrap the whole `App` (`app.analytics`, `app.intro`, `app.location`, `app.look`, `app.satellite`, `app.sky`, `sun-safety`), with a comment. The global timeout is unchanged (5 s). Honest note: none of the 5-s failures I saw on 2 cores was in one of those files, so this is insurance against the cold-start cost above, not what fixed the flake.
- **CI simulation.** `ng test` has **no `--maxWorkers` flag**, and neither a `--runner-config` file with `maxWorkers: 2` nor `VITEST_MAX_WORKERS=2` visibly changed anything (a full run stayed 12–20 s), so I did not trust either. I simulated a 2-core CI machine by pinning the whole process tree to 2 CPUs (Windows processor affinity mask 3, PowerShell, with `VITEST_MAX_WORKERS=2` also set): that roughly doubles wall time (about 36 s versus about 19 s), which is how I know it took effect.
  - Before the fix: 3 of 5 clean, 2 failed (the city-picker test above).
  - After the fix: **5 of 5 clean**, each 71 files / 718 tests, 34–39 s.
  - There is no committed CI configuration for this; if you want one, say whether to add a `test:ci` script or a vitest config.

### 3. Gate

Format, lint, `ng test` (71 files, 718 tests, 30 s on this machine, unrestricted) and `ng build` all pass; `format:check` is clean.

## Follow-up 2: CI failures in `app.sky.spec.ts`

CI (GitHub Actions, about 2 cores) failed two tests that passed locally: "selecting a constellation (?target=orion) fetches it once, and the target appears" (`expected 'loading' to be 'ready'`) and "a constellation info card fetches it once; closing and reopening does not fetch again" (0 fetch calls instead of 1).

**Cause.** As suspected: the assertions ran before the async work finished. My `settle()` helper yielded four microtask ticks and then called `fixture.whenStable()`. But the mocked `Response.json()` reads its body on a *later macrotask*, so on a slow runner the test looked at the app while the status was still `'loading'` (or before the effect that starts the fetch had run). Locally the event loop got there in time; on 2 cores it did not. `public/data/sky.json` is tracked (`git ls-files` lists it, committed in `0c0f084`), so it was not a missing file.

**Reproduced and verified.** Earlier pinned runs never reproduced it, so I forced it: with the mocked sky response made to arrive 300 ms late, the *old* spec fails 5 tests (both CI failures, plus the picker-scroll, Look Around and remembered-off tests, which had the same flaw); the fixed spec passes all 20 with the same delay.

**Fix: wait for the condition, not for ticks** (`app.sky.spec.ts`)
- A helper `until(condition)` built on `vi.waitFor` (10 s ceiling, 10 ms poll, change detection on every poll), returned by `render()`. Every async step now waits on its real condition: the fetch was made (`skyCalls() >= 1`), `SkyDataService.status() === 'ready'` / `'unavailable'`, `geometry() !== null`, the engine's target is `orion`, `.orbit-status` text, the dialog/card is open or closed, the live-stat row exists.
- The mocked fetch is an `async` function whose result the test controls; the "Getting the star map…" test holds the response in a promise it resolves itself, after waiting for the request to start.
- The **exact-count assertions are kept, after the wait**: exactly 1 star-map request, and no second request after closing and reopening the card or after a second observer fires. For those "no second request" checks the test also yields a short macrotask (20 ms) so a wrongly started second request would have had time to appear.
- A second, related hang showed up in the next 2-core run (`app.sky.spec` timing out at 15 s in the two tests that open the picker): `fixture.whenStable()` waits for every chunked availability `setTimeout` the picker schedules, and on a stalled machine that is unbounded. `settle()` in this file is now one macrotask plus change detection, with no `whenStable()`, and opening the picker waits for the dialog and for the section observer to exist. (This is the same call that stalled the Phase 9 city-picker test earlier.)

**Same pattern elsewhere in Phases 8–10 (fixed)**
- `target-picker.spec.ts` (Phase 8): four tests called `settle()` twice and hoped the mocked orbit-data request had finished in between (satellite rows, "Orbit data unavailable", "Best right now"). They now use `settleWithOrbitData()`: settle, `vi.waitFor` the `GpService` status to be `ready`/`unavailable`, settle.
- `target-info.spec.ts` (Phase 8): the ISS card test advanced fake timers by 10 ms and read the "Height" row; it now `vi.waitFor`s for the row.
- `app.satellite.spec.ts` (Phase 6, same flaw): "opening the picker is what asks … once" now waits for the one `/api/gp` call instead of `whenStable()`.
- `target-picker.constellations.spec.ts` (mine): "once the star map is loaded the rows get a status" computed availability for all 88 constellations to find a "Partly up" one and timed out at 5 s in one unrestricted run. It now finds a partly-up constellation directly with the provider and searches for just that row (2.0 s → 0.47 s).
- Checked and left alone: `app.look.spec.ts` (its fetch is a constant 500; nothing depends on it), `app.location.spec.ts` (already uses `vi.waitFor` where it waits for data), `city-picker.spec.ts` (already fixed in Follow-up 1), the engine, provider, sky-field, render and data-service specs (synchronous or already awaiting the actual promise).
- Not changed: other specs still use `fixture.whenStable()` in their `settle()` (`app.look`, `app.location`, `app.intro`, `app.analytics`, `sun-safety`, `target-picker*`). They passed every run, so I did not rewrite them, but `whenStable()` is the common thread in both hangs I saw; if one of them flakes on CI, that call is the first suspect.

**Verification.** Format, lint, `ng test` and `ng build` pass (71 files, 718 tests; main bundle 138.10 KB gzipped; no warnings). Full suite pinned to 2 CPUs, five runs: **5 of 5 clean**, 36–45 s each (plus two unrestricted runs, also clean). Before the last two changes, one pinned run and one unrestricted run each failed once, which is what led to the `whenStable()` removal and the cheaper picker test above.

## Follow-up 3: sweeping the remaining `whenStable()` specs

Status: done. Format, lint, `ng test` (71 files, 718 tests), `ng build` (no warnings, main bundle 138.10 KB gzipped) pass, and the full suite pinned to 2 CPUs passed **5 of 5** (36-40 s each). Three spec files changed (`app.location.spec.ts`, `target-picker.spec.ts`, `target-picker.constellations.spec.ts`). One part of the request did not work out as asked; see "What I did not do".

### The probe

A temporary setup file (deleted, never committed) wrapped `vi.stubGlobal` so every stubbed `fetch` answered **300 ms late in real time**, and wrapped a stubbed `navigator.geolocation` the same way. The mocked call still happens immediately (specs that assert "fetch was called" stay valid); only the response is late, and a rejected response is still delivered late. The wrapper also exposes `.mock`, because one spec reads `fetch.mock.calls`.

Two false starts in the probe are worth knowing, because they looked like test bugs and were not: delaying the *call* instead of the response broke specs that legitimately check the call synchronously, and a mock that rejected before anyone awaited it leaked an unhandled rejection into other tests.

### What it found, and the fix (by waiting on the real condition)

- **`app.location.spec.ts` (6 tests):** `render()` assumed the mocked geolocation had already answered (`status` is `'pending'` until it does). It now `vi.waitFor`s for `LocationService.status()` to leave `'pending'`.
- **`target-picker.spec.ts` "asks for orbit data the first time it renders":** this was a real isolation weakness, not just a missing wait. With late responses, the *previous* test's orbit-data answer landed in the shared `localStorage` after that test had ended, so this test's `GpService` found a fresh stored copy and (correctly) made no request. The test's actual precondition is "nothing stored when the sheet opens", so it now clears `localStorage` right before opening the sheet and says why.
- **Passed under the probe, so left alone:** `app.look`, `app.intro`, `app.analytics`, `sun-safety` (their mocked answers are constant 500/404s or are not awaited), `target-picker.constellations`, `target-info*`, `city-picker`, and everything fixed in Follow-up 2. The only other probe failures were timeouts in `location.service.spec` and `sky-data.service.spec`, which `await` their promises correctly: they loop through several 300 ms answers (five in the first) and then run out of 5 s on a loaded machine. That is the probe's own cost, not a missing wait; the specs are unchanged.

### `whenStable()` removed where it is not needed

Removed from the `settle()` helpers of the two **picker specs** (`target-picker.spec.ts`, `target-picker.constellations.spec.ts`). They use fake timers, and `await vi.runAllTimersAsync()` plus change detection already flushes everything; the extra `whenStable()` added nothing. Clean in all five pinned runs and under the probe.

### What I did not do: removing it from the App specs

I also replaced `fixture.whenStable()` in `app.look`, `app.location`, `app.intro` and `app.analytics` with a single macrotask yield, since the probe and normal runs were both green. **That did not hold up under 2-CPU conditions and I reverted it.** Two full pinned runs failed badly: the first had 26 tests (every test in `app.analytics`, `app.intro` and `app.look`) hit the 15 s per-file timeout and took 427 s; the second had 28 timeouts and took 456 s. Run on their own, pinned, the same four files passed 3 of 3 in about 20 s, and unpinned full runs were also green, so the hang only appears with the whole suite loading two cores. I did not find the root cause. My guess, unverified, is that those specs rely on `whenStable()` to wait out the chunked availability timers and the app's other zone-tracked work before the next step, and a bare `setTimeout(0)` does not. Those four files are therefore unchanged except for the geolocation wait above, and `app.satellite`, `app.sky` (already off `whenStable`), `corner-stat` and `sun-safety` were not part of this change.

If you want `whenStable()` gone from the App specs too, the next step is to find out which background work each one is really waiting for and wait on that explicitly. That needs its own investigation, and each failing attempt costs 7+ minutes of CI-like runtime.

### Verification

- Probe: after the fixes, a full run under the 300 ms probe was green (one earlier probe run had only the `location.service` timeout described above).
- Full suite pinned to 2 CPUs, 5 runs: 71 files / 718 tests passed each time, 36-40 s.
- Format, lint, test and build all pass.
