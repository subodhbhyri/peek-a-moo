# Phase 5 report — The picker and availability

Status: implemented; `npm run format && npm run lint && npx ng test --watch=false && npm run build` pass. Phase 4 is committed (`74ab822`); the Phase 5 work is **not committed**. Not yet checked on a device.

## What changed

**Task 1 — sentence names.** Every catalog entry has `nameInSentence` ("the Moon", "Jupiter", "the Andromeda Galaxy", "the Galactic Center", …) and `shortName` ("Andromeda", "Orion Nebula", "LMC", …). Both are required by the type, and a test asserts every entry has them and that `nameInSentence` is `name` with an optional "the ".

**Task 2 — availability engine** ([availability.ts](../../src/app/core/targets/availability.ts), pure).
- `Visibility`, `Availability` as specified, plus `magnitude` (needed to order "Best right now"; not in the spec).
- Sky darkness from the Sun's altitude with the limit table passed in as a parameter (defaults: dark < −12° → 6.0, twilight → 3.0, daylight > −6° → −3.5).
- Generic `scanCrossings(altitudeFn, from, {stepMs, windowMs, resolutionMs, horizonDeg})`: 20-minute samples over 48 h, each sign change bisected to 30 s. No per-kind code; Phase 6 passes a different step. `neverRisesHere` is geometric for fixed targets (`dec < −(90 − |lat|)`, mirrored in the south) and short-circuits the scan.
- `computeAvailabilityChunked` yields (`setTimeout(0)`) between targets; `AvailabilityService` caches each result for 5 minutes per location rounded to 0.1°, shares one in-flight run, and fills labels progressively (`byId` signal; missing = skeleton).

**Task 3 — labels** ([availability-format.ts](../../src/app/core/targets/availability-format.ts), pure). `formatAvailability(a, now, locale, { timeZone, def })` implements every row of the table, with the Galactic Center ("Up · hidden behind dust") and Sun ("Up — never look at it", warning mark on its row) cases. Also `riseText`, `formatDuration` and `introNote` (the Task 5 sentences).

**Task 4 — picker sheet** ([features/target-picker/](../../src/app/features/target-picker/)). Target chip at top center (`[glyph] Jupiter ▾`), bottom sheet (max 80% height, rounded top, drag handle), `role="dialog"` + `aria-modal`, focus moves into the sheet and returns to whatever opened it, Tab is trapped, Escape / backdrop / swipe-down (> 90 px on the handle) / choosing a row close it, reduced motion swaps the slide for a fade, safe-area insets respected. Contents: search ("Search the sky", case- and accent-insensitive on name, short name and id); "Best right now" (up to 3 `up-visible`, brightest first, never the Sun; hidden when empty or while searching); Solar system / Stars / Deep sky in catalog order (the Satellites section is already in the section table, so adding it in Phase 6 is a data change); rows ≥ 48 px with a one-character glyph per render style, status label colored by tone, "found N×" from the per-target stats, a check on the selected row. Choosing a row selects, closes and clears the search; the Sun asks "Never look at the Sun — not directly, not through your camera. Continue?" first (Cancel / I understand). `t` opens it in drag/desktop mode.

**Task 5 — intro.** "Find {nameInSentence}." (so "Find the Moon.", "Find Jupiter.", "Find the Andromeda Galaxy."), the same subline, a tappable "or pick something else ▾", an honest line from `introNote` when the target is not simply visible, and the privacy note. Selecting another target (or opening a shared link) shows that target's intro again. The iOS tap-to-begin and hold-flat flows are untouched, and the "or pick something else" link and the chip only appear once the app is running, so they cannot swallow the iOS start tap.

**Task 6 — deep links and sharing.** `?target=<id>` already selected; the intro now reflects it. The corner toast shares "Found Jupiter in 4.2s — https://…/?target=jupiter" (Web Share gets the text and the link; the clipboard fallback gets both joined with " — "). The link is origin + path + only `?target=<id>`, so `?debug` is never shared. The debug selector stays in `?debug`.

## Pins

- Phase 2 characterization spec: **no diff.** Phase 3 Moon draw-call pin: **no diff.**
- Providers (`moon`, `solar-system`, `fixed-sky`) and renderers (`draw-*`, `phased-disc`, `moon-phase`): **not touched** (nothing in `git status`).
- The one expected test change: the intro capitalization. There was no pre-existing test asserting the old lowercase "Find the moon." string, so nothing was edited; the new App intro spec asserts "Find the Moon." instead.

## Tests

219 before → **305 now** (30 files). New:
- **Availability:** limit table (every boundary, parameterised), `scanCrossings` against a function with analytic zeros (±30 s) and its options, alwaysUp/neverUp; Jupiter and Saturn rise/set against `SearchRiseSet` within 2 min and the Moon within 4 min (the engine uses the Moon's upper limb, we use its center) at three start dates; Polaris `alwaysUp` at lat 39.6 and `neverRisesHere` at −30; the LMC `neverRisesHere` with `nextRise === null`; real-sky visibility (Sirius up at night → `up-visible`, at noon → `up-daylight`; Venus in twilight → `up-visible`; Galactic Center at night → `up-too-faint`; M31 in twilight → `up-too-faint`, at full dark → `up-visible`; low flag; the Sun); the chunked runner yields once per target and goes through `setTimeout` (fake timers).
- **Labels:** every row of the table with `en-US` / `America/Denver`, plus `de-DE` for the clock, every intro sentence.
- **Service:** 5-minute cache boundary, location-cell invalidation, shared in-flight run, progressive fill.
- **Sheet (component tests):** opens with the right dialog attributes; section order and catalog order; skeletons then labels; search by name, short name, id and accent-insensitively; selecting changes the target, persists it, closes and resets the search; check mark and "found N×"; Escape closes and returns focus; backdrop closes; Tab stays inside; Sun confirm (Cancel, I understand, warning mark); "Best right now" ordering, Sun exclusion, hiding.
- **Intro/App:** headline for the Moon, planets, deep sky and shared links; the "pick something else" link and chip open the picker; honest lines (LMC never rises; Galactic Center); switching target; `?target=garbage`; `t` opens the picker (and not while typing in a field).
- **Sharing:** link construction without `?debug`; Web Share text/url; clipboard text.

Bundle: main 98.2 KB gzipped (limit 150 KB).

## Availability timing (full catalog, 19 targets)

Measured in the Node/jsdom test runner on this machine, one `computeAvailability` per target at 48 h / 20 min / 30 s resolution:

| run | total |
|---|---|
| 1 (cold) | 283 ms |
| 2–5 | 164, 131, 156, 130 ms |

Per target (warm): Moon 36 ms, planets 7–14 ms, Sun 4 ms, every star and deep-sky object ≤ 1 ms. So the whole catalog is ~130–280 ms, and the largest single slice the chunked runner holds the main thread for is the Moon at ~36 ms. A phone will be a few times slower than this laptop, but because the sheet opens with skeleton labels and fills in one target per timer tick, nothing blocks the open. (A test also asserts the whole catalog stays under 3 s.)

## Decisions

- **Visibility rule.** The spec's table puts Sirius at noon in `up-daylight` but M31 in twilight in `up-too-faint`, so: daylight (Sun > −6°) gives `up-daylight` for anything dimmer than −3.5 (and a null magnitude is `up-too-faint`), while twilight/dark give `up-too-faint` for anything dimmer than that sky's limit.
- The first target (the Moon) is computed in the same tick the sheet opens, so one row has a label immediately and the other 18 show skeletons.
- Extra rise phrasing: "Rises today 8:15 PM" when the rise is 12 h or more away but on the same calendar day (the table only has "tomorrow" and weekday forms). Whole hours read "2h", not "2h 0m".
- Intl's narrow no-break space before AM/PM is normalised to a plain space so labels compare and wrap predictably.
- Glyphs are plain characters (☾ ☀ ● 🪐 ✦ ◌ ⊕ ◆), chosen for being free; they are decorative and `aria-hidden`.
- Plural targets (the Pleiades) read as "it rises…" in the intro line, as in the spec's own example sentence.

## Deviations

- `Availability.magnitude` added (see above).
- No deviations from the spec otherwise. Row height ≥ 48 px and thumb reachability are CSS/layout properties jsdom cannot measure, so they are covered by the manual check, not a test.

## Open questions

- With only 20-minute sampling, a very brief pass over the horizon (a target skimming it for under 20 minutes) could be missed; irrelevant for today's targets, but Phase 6 satellites pass a finer step.
- The intro's "rises in 3h 12m" is computed once when the intro first appears; it does not tick down while it stays on screen.

## Out of scope, noticed

- `index.html` title / Open Graph text and the manifest still say "Find the moon".
- The debug overlay's target `<select>` is unchanged; the picker supersedes it for normal use.
- `README.md` still describes the Moon-only app.
- Nothing is pushed.

## Manual check (for the human)

1. On your phone (no `?target`), the intro reads "Find the Moon." Tap "or pick something else ▾" → the sheet opens.
2. Check "Best right now" against reality: are those things actually up and visible where you are?
3. Pick something below the horizon → the intro tells you when it rises. Pick the LMC → "Never rises from here."
4. Pick Jupiter (or any planet that's up) and find it. Share from the corner toast → the link opens straight into Jupiter on another device.
5. Compare one rise time with a public source (e.g. timeanddate.com for your city) — should be within a few minutes.
6. One-handed: can you open, scroll, search and pick with your thumb alone?
