# Phase 6 report — Satellites (ISS, Tiangong, Hubble)

Status: implemented; `npm run format && npm run lint && npx ng test --watch=false && npm run build` pass (format:check is clean). Phase 5 is committed (`c7ccc6d`); the Phase 6 work is **not committed**. Not yet checked on a device, and `api/gp.ts` has **not been run on Vercel** (only unit-tested with a mocked `fetch`).

**`public/data/gp-fallback.json` is real data, not a placeholder.** `npm run gp:refresh` reached CelesTrak from this machine and wrote it (`fetchedAt` 2026-10-29T19:59:57Z; ISS epoch 2026-10-28 14:18 UTC, Tiangong 04:01, Hubble 12:57). It will be more than 3 days old by 2026-11-01 (flagged "approximate") and more than 14 days old after 2026-11-11 (labelled stale), so re-run `npm run gp:refresh` now and then. Total CelesTrak traffic from this session: one manual `curl` plus one run of the script (3 requests), no retries.

## What changed

**Task 0 — dependency.** `satellite.js@^7.1.0` (installed 7.1.0). One wrinkle: its package entry also re-exports a WebAssembly build that imports Node built-ins, so `ng build` fails on `node:module` / `node:worker_threads`, and (with those externalised) it adds two lazy chunks of 336 KB and 170 KB raw that the service worker's `/*.js` prefetch would download for every user. So the app imports the five or six functions it needs straight from the package's `dist/` files via [satellite-lib.ts](../../src/app/core/satellite-lib.ts) (relative paths into `node_modules`, since the `exports` map blocks subpaths). No lazy chunks, nothing changed in `angular.json` for this. If a future satellite.js version moves those files, `satellite-lib.ts` is the one place to fix.
Bundle: main **98.18 KB → 110.59 KB gzipped** (+12.4 KB; limit 150 KB). No lazy chunks.

**Task 1 — catalog.** `iss` (25544, mag −3.5), `tiangong` (48274, −1.5), `hubble` (20580, +1.5): `category: 'satellites'`, `kind: 'satellite'`, `render: 'satellite'`, names/short/sentence names as in the table, blurbs (ISS's is the spec's). `TargetDef.satellite` gained `magnitude`. The `TargetState.satellite` type from Phase 2 (`velocityDegPerSec`, `tleAgeDays`, never used) is replaced by `{ sunlit, rangeKm, ageDays, approximate, stale, trail }`. NORAD 48274 is the Tianhe core module (CelesTrak names it "CSS (TIANHE)"), which is what "Tiangong" tracks.

**Task 2 — [api/gp.ts](../../api/gp.ts).** `export async function GET(): Promise<Response>`; reads nothing from the request. Whitelist `[25544, 48274, 20580]`, one request each, sequentially, `https://celestrak.org/NORAD/elements/gp.php?CATNR=<id>&FORMAT=JSON`, `User-Agent: peek-a-moo (+https://github.com/subodhbhyri/peek-a-moo)`, 8 s abort per request. Records are trimmed to the OMM fields (all optional). Success: `{ fetchedAt, elements }`, `Cache-Control: public, s-maxage=7200, stale-while-revalidate=86400`. **Any** problem (non-200, timeout/network error, a 200 that isn't JSON such as "No GP data found", an empty array, or a record for the wrong object) stops immediately, makes no further requests and answers 502 `{ error }` with `Cache-Control: public, s-maxage=600`. Nothing loops or retries. `api/` is linted and prettier-checked (`lintFilePatterns`, `format` globs) and is not part of the Angular build.

**Task 3 — client.**
- [GpService](../../src/app/core/gp/gp.service.ts) `get()`: memory (≤ 2 h) → `localStorage` `ptm.gp` (≤ 2 h, try/catch) → `fetch('/api/gp')` with a 5 s timeout → `data/gp-fallback.json` (also the newest of {stale memory, stale localStorage, snapshot} when the network fails). The newest good network copy is saved to `localStorage`. Concurrent calls share one request. After a total failure it will not try the network again for 5 minutes. `status` is `idle | loading | ready | unavailable`; `stamp()` changes whenever the data does, so caches notice.
- **No request at app start** — `get()` is called from exactly two places: the engine when a satellite is selected, and the picker when its Satellites section is on screen (sheet open and not filtered out by the search). Tests: the Moon, a planet, a star and a deep-sky object never call `GpService.get` or `fetch`; opening the picker asks once; `?target=iss` asks.
- `scripts/gp-refresh.mjs` + `npm run gp:refresh` (same whitelist/rules; exits 1 and writes nothing on any non-200/odd answer).
- `ngsw-config.json`: `dataGroups` entry for `/api/gp`, `freshness`, `maxAge: 2h`, `timeout: 5s`.
- Element age: 3–14 days → `approximate`, > 14 days → `stale` (labelled; still drawn).
- README documents `npx vercel dev` and `gp:refresh`.

**Task 4 — [providers/satellite.ts](../../src/app/core/targets/providers/satellite.ts).** `json2satrec` once per NORAD id + EPOCH (cached). Position: `propagate` → `eciToEcf(pos, gstime(date))` → `ecfToLookAngles` (observer in radians, height in km) → refraction (`Refraction('normal', el)`, the same function `Horizon('normal')` uses) → `directionFromAzAlt`. Sunlit test is the cylindrical shadow from the spec. `TargetState.satellite = { sunlit, rangeKm, ageDays, approximate, stale, trail }` with 12 trail directions (t−1 s … t−12 s), `magnitude` = catalog value when sunlit, else `null`, `angularSizeDeg: 0`, `sunAltitudeDeg` set. SGP4 failure (decayed/bad elements) or missing data throws `SatelliteDataError('propagation-failed' | 'no-elements')`; the engine catches it, leaves the target `null` and sets `engine.targetError`, and the app shows "Orbit data unavailable" (or "Getting orbit data…" while loading) instead of crashing. `computeTargetState(def, date, observer, satellites?)` takes the elements as an optional fourth argument, so the provider stays a pure function and every other kind is untouched.
- **Cadence 0 is now exercised.** For satellites the engine recomputes inside `tick()` every frame; the `target` signal is only updated about once a second (so Angular change detection is not driven at 60 Hz) and `engine.currentTarget()` returns the newest state (used by the found handler). The frame carries `trail` (screen positions) only for satellites.

**Task 5 — passes and availability.** [satellite-passes.ts](../../src/app/core/targets/satellite-passes.ts) reuses the generic crossing scan with horizon 10°, step 20 s, window 24 h, bisection to 1 s. A pass is rise → peak (ternary search) → set; it is visible iff at some moment (sampled every 10 s) the satellite is above 10°, sunlit and the Sun is below −6°. Only passes up to the first upcoming visible one are classified (the Sun/shadow work is skipped after that). `Availability` gains optional `currentPass`, `nextVisiblePass`, `visibleNow`, `orbitAgeDays`, `orbitStale`, `orbitDataUnavailable`. Labels (all in `availability-format.ts`): "Overhead now — look fast" (good), "Overhead now, but not visible" (meh), "Visible pass in 2h 14m · 63° high" (meh, under 12 h), "Visible pass tomorrow 6:12 AM" / "today 9:00 PM" / "Tue 4:10 AM" (off), "No visible passes today" (off), stale data appends " · orbit data is N days old" and drops the tone one step, "Orbit data unavailable". A satellite's `visibility` is `up-visible` only when it is overhead *and* visible, so the unchanged "Best right now" rule ("up-visible, never the Sun") admits a satellite only for "Overhead now — look fast".
- `crossings.ts` now holds `scanCrossings` / `ScanOptions` / `DEFAULT_SCAN` (moved out of `availability.ts` to avoid an import cycle; `availability.ts` re-exports them, so every Phase 5 import and test is unchanged).
- `AvailabilityService`: satellites wait (skeleton) for orbit data, are cached for **60 s** instead of 5 minutes (a pass is over in minutes), and are recomputed when the orbit data changes. A bug found on the way: a `refreshAll()` that was joined to a run already in progress would not pick up targets that became computable mid-run; it now runs again for what is left.

**Task 6 — rendering and UX.**
- [draw-satellite.ts](../../src/app/core/render/draw-satellite.ts): a bright dot with glow when sunlit; a dim hollow ring in Earth's shadow; a trail through the 12 projected points that fades with age; a small arrow along the direction of travel; the short name next to it. Fixed 6 px core (`displayRadiusFor` returns it; the find threshold is the usual 0.35 of the half-screen, generous for something this fast).
- Edge glow for a satellite above the horizon starts at once (ramp 0.6 s) instead of after 20 s.
- Found: "That's the ISS. Seven people up there, waving." (plus factual lines for Tiangong and Hubble), toast "Found the ISS in X.Xs" (`Found Tiangong…`, `Found Hubble…`). Under the toast: "It's in Earth's shadow right now — invisible, but right there." if not sunlit, or "The sky's too bright to see it — but it's right there." if sunlit but the Sun is above −6° (this second note is mine, from the manual-check wording).
- Picker: the Satellites section was already in the section table; it now renders the three rows with skeletons until orbit data arrives, then the labels, or "Orbit data unavailable" on total failure.
- Intro: "Find the ISS." + the pass label; with no visible pass it adds "You can still find where it is right now — even in daylight."; with no data, "Orbit data unavailable. Check your connection and try again."
- The sight-alignment button is hidden for satellites ("Aligned ✓" still shows when an alignment is stored).
- Debug: the overlay shows NORAD id, element age, sunlit/in shadow and range; "Copy report" adds a `satellite` block (only for satellites).

## Pins

- Phase 2 characterization spec, Phase 3 Moon draw-call pins (`moon-phase.spec.ts`), providers `moon` / `solar-system` / `fixed-sky`, renderers `draw-planet` / `draw-star` / `draw-sun` / `draw-extended` / `moon-phase` / `phased-disc`: **no diff** (`git status` shows nothing for any of them), and they pass. No expected value anywhere was edited.
- A few earlier tests had their *setup* changed because the premise they were written under no longer holds (not their expected values):
  - `targets.spec.ts` "throws a clear error for kinds without a provider yet": satellites now have a provider. The same ISS fake still throws, with the same `/No provider.*iss/` match, now a `SatelliteDataError`; the fake gained the new required `magnitude`, and the test was renamed.
  - `targets.spec.ts` "every entry has a sentence name": "the ISS" is not "the International Space Station", so the `nameInSentence === name` check skips satellites.
  - `draw-target.spec.ts`: the helper passes the fixture elements for satellites, and the "styles without a renderer throw" test now uses an invented style instead of `'satellite'`.
  - `availability.service.spec.ts` "refreshAll fills the whole catalog": satellites are excluded (they wait for orbit data).
  - `target-picker.spec.ts`: the section list now includes Satellites; a `fetch` stub supplies orbit data; one test waits for a second settle.
  - `availability.spec.ts` "visibility with real skies": a 30 s test timeout (it scans real skies and timed out under the load of the full parallel suite; not an assertion change).

## Tests

305 before → **407 now** (37 files). New:
- **Handler** (`api-gp.spec.ts`, mocked `fetch`): exactly 3 upstream calls with the whitelist, `FORMAT=JSON`, only `CATNR`/`FORMAT` params, the User-Agent and an abort signal; success shape and cache headers; trimmed fields; blank fields tolerated; one upstream 403 → 502, `s-maxage=600`, **no further fetches** (403 on the 2nd request → 2 calls; on the 1st → 1 call); timeout/network error; "No GP data found", empty array and wrong-object answers → 502; ignores client input.
- **GpService** (`gp.service.spec.ts`): nothing on creation; network + localStorage write; fresh localStorage → no request; old localStorage → network; garbage/unavailable storage; fallback on 404/502; 5 s timeout; newest of stale copy and snapshot; total failure + 5-minute back-off; 2 h memory refresh; shared in-flight request; malformed payloads; the shipped `gp-fallback.json` is well formed, holds exactly the three whitelisted objects and loads into satellite.js.
- **Provider** (`satellite.spec.ts`), independent oracles:
  - Vallado 00005 via `twoline2satrec` and via an equivalent OMM record through `json2satrec` (our `satrecFor`): TEME at 0 and 360 min within 1e-3 km of the published vectors (they actually match to < 1e-8 km), the two paths agree at 720 min (to 1e-3 km, tighter than the spec's 1 m), and propagating by `Date` from the parsed UTC epoch lands within 50 m.
  - Look angles built with `geodeticToEcf`: 400 km straight up → elevation 90°; 400 km along the northern tangent → due north on the horizon; +10 km up → small positive elevation; 400 km high over a point 400 km north → north, 30–60° up.
  - Shadow: Sun side lit; directly behind → shadow; behind but 7000 km sideways → lit; the edge at 6378 km; a tilted Sun.
  - No NaN for ISS/Tiangong/Hubble every 3 h over ±3 days; 12-point trail whose steps are ~a second apart; magnitude catalog-or-null across one orbit; age flags at 2.9/3.1/13.9/14.1 days; refraction lifts a low satellite 0.1–0.6°; the two typed errors.
- **Passes** (`satellite-passes.spec.ts`): rise/max/set of a synthetic sine within 1.5 s / 0.1°; pass under way at the start; never-up and always-up; classification combinations (shadow, daylight at −5° and +10°, below 10°, "at some point", simultaneity, Sun crossing −6° mid-pass); the ongoing pass doesn't hide the next one; and for all three satellites at four start times, the engine's next visible pass is checked against a brute-force 30-second search using the provider's own state (and a guard that it really compared passes).
- **Labels** (en-US, America/Denver): every row of the table, stale downgrades, unavailable, intro sentences.
- **Engine** (`sky-engine.satellite.spec.ts`): per-frame recompute with a throttled signal; 12-point trail and 6 px radius; a centered ISS is found with its own id; no data → null target + `targetError`; it asks for data only because a satellite is selected.
- **App** (`app.satellite.spec.ts`): the no-network-at-start tests above, the satellite intro, "Orbit data unavailable", alignment hidden for the ISS but shown for an ordinary target that is up (clock frozen at a moment the ISS is high).
- Renderer (`draw-satellite.spec.ts`: lit vs hollow, fading trail, arrow direction, NaN-safe, dispatch, fixed size), found lines/notes/toasts, picker (asks on open, skeletons then labels, "Orbit data unavailable" on failure, "Best right now" admits a satellite only when overhead and visible), debug report.

## Pass-scan timing (3 satellites × 24 h)

Measured in the Node/jsdom test runner on this machine, `computeAvailability` for ISS + Tiangong + Hubble: **64, 52, 49, 47 ms** (about 16–21 ms each). Per-frame cost of a satellite state (13 SGP4 propagations for the trail, plus the Sun) is well under a millisecond. A phone will be a few times slower; the picker computes one target per timer tick, so this does not block opening it.

## Decisions

- **Sun for the shadow test** uses `Equator(Body.Sun, date, observer, ofdate = true, aberration = true)`: one call gives both the altitude (through `Horizon`) and a vector in the true equator of date, which is closer to TEME than the spec's J2000 `GeoVector`. Observer parallax of the Sun is ~9″, irrelevant.
- The pass search uses *geometric* elevation (no refraction) for the 10° horizon and visibility; the state shown on screen uses apparent elevation. The difference at 10° is about 5′.
- A satellite is "visible now" only if it is in a pass above 10° *and* sunlit *and* the Sun is below −6°; a satellite between 0° and 10° counts as up in the state but not as "overhead".
- "Visible pass" gets tone `meh` under 12 h and `off` beyond, exactly per the table; the intro line is the same label as the picker's, with a full stop.
- Sunlit-but-daylight found note and the factual Tiangong/Hubble found lines are my wording (the spec only wrote the ISS's).
- GpService retries the network at most once per 5 minutes after a total failure, which the spec doesn't mention; it keeps a reopened picker from hammering `/api/gp`.

## Deviations

- `satellite.js` is imported from its `dist/` files (see Task 0), not from the package entry.
- `scanCrossings` & friends moved to `crossings.ts` (re-exported from `availability.ts`).
- `Availability` has extra optional fields; `AvailabilityService` has a 60 s TTL for satellites; `engine.targetError` / `currentTarget()` are additions.
- `TargetState.satellite` follows the Phase 6 spec rather than ARCHITECTURE §5.2's older sketch (`velocityDegPerSec`, `tleAgeDays`); ARCHITECTURE.md itself is not edited.

## Open questions

- The "approximate" flag (3–14 days) is computed and tested but not shown in the UI; only "stale" is labelled, as the spec asks. Do you want a quiet hint for approximate?
- In a session that stays open for more than 2 h, orbit data is only refreshed when `get()` is next called (selecting a satellite again, or opening the picker); nothing polls.
- Vercel's handling of the extra named exports in `api/gp.ts` (`GP_WHITELIST`, `OMM_FIELDS`, `pickOmm`, exported for the tests) is expected to be harmless (only the HTTP-method exports are routed) but has not been verified on a deploy.

## Out of scope, noticed

- `index.html` title / Open Graph text and the manifest still say "Find the moon"; `README.md` is otherwise still Moon-only (only the new section 6 is current).
- The debug overlay's target `<select>` now lists the satellites too; the picker is the real UI.
- Rise/set of the Moon uses the center (Phase 5 note); satellites use the 10° cut-off, so the two are not comparable.
- Nothing is pushed.

## Manual check (for the human)

1. If the fallback file is a placeholder, run `npm run gp:refresh` and commit `public/data/gp-fallback.json`.
2. Deploy. Open `https://<your-domain>/api/gp` in a browser: JSON with 3 elements and a recent `fetchedAt`. Reload: response headers show it's served from cache (`x-vercel-cache: HIT` after the first load).
3. Open the picker → Satellites. Compare the ISS "next visible pass" with NASA's Spot the Station or Heavens-Above for your location: start time within ~1 min, max elevation within a few degrees.
4. During that pass, select the ISS and track it. Does the dot stay on the real ISS as it crosses? Copy a debug report mid-pass.
5. At any time (even daytime), select the ISS and find it: the dot should land where trackers say it is, with the "not visible" note if it's in daylight or shadow.
