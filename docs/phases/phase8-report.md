# Phase 8 report — Facts for every target, and Look Around

Status: implemented; `npm run format && npm run lint && npx ng test --watch=false && npm run build` pass (format:check clean). Phase 7 and its CI-fix commit (`a8af1ed`) are committed; the Phase 8 work is **not committed**. Not checked on a device.

**Numbers:** tests 473 → **543** (50 files). Main bundle 115.03 → **122.35 KB** gzipped (limit 150 KB), no lazy chunks.

## Task 0 — the Moon animation: nothing was removed

I could not find a Moon animation added after Phase 7, so, as instructed, I did not guess and removed nothing.

- `git log` after the Phase 7 commit (`0f37897`) has one commit, `a8af1ed` (the CI fix). `git diff 0f37897 HEAD -- src public` touches only `target-picker.spec.ts` (the fixed-clock test fix) and `src/index.html` (absolute OG URLs). Neither touches the Moon, its renderers or its CSS.
- The working tree was clean when I started (only the untracked `docs/phases/phase8.md`), there are no stashes, and the only branch is `main`. The reflog shows only the commits above. So the animation is not in anything git knows about; if it exists it is **unsaved or uncommitted in your editor, or on another machine/branch**. If you commit or paste it I will remove it.
- The only Moon animation in the code is the original one, which the task says to keep: the speech bubble's `fade-bubble` keyframes in `moon-face.ts` (with its `prefers-reduced-motion` handling), unchanged since the initial commit except my Phase 7 `aria-hidden`/`role="status"` attributes. The Moon renderer (`moon-phase.ts`, `phased-disc.ts`) has no animation and no diff.

So acceptance item 1 ("the Moon looks as it did at the end of Phase 7") holds trivially: nothing about it changed in this phase. Pins pass with no expected-value edits (below).

## Task 1 — info content

- `TargetDef.info: { type, description, facts (exactly 3), distanceLy? }`, required on every entry. The content is in [target-info-content.ts](../../src/app/core/targets/target-info-content.ts) and merged into the catalog entries (`TARGETS = BASE_TARGETS.map(t => ({ ...t, info: TARGET_INFO[t.id] }))`), rather than written inline in the 300-line catalog file. Behaviour is the same: every catalog entry has `info`.
- Distances are exactly the table (sirius 8.6, vega 25, arcturus 37, polaris 430, betelgeuse 550, m45 440, m42 1350, galactic-center 26,000, lmc 160,000, m31 2,500,000), only on fixed-sky targets. They are shown as "about …"; Betelgeuse reads "about 550 light-years, but it's uncertain".
- Every number has its basis in a comment beside it. The Sun's facts include the safety message verbatim. No "currently", crew counts or names, end dates, or records.
- Judgment calls on content: Andromeda says any merger "is billions of years away" with no figure (the timing and certainty are disputed); the Pleiades say "over a thousand" stars; Saturn's rings are "mostly under a kilometre thick"; Neptune has "some of the fastest winds"; the ISS entry says "the first crew moved in during November 2000" (a past event) rather than anything about now; the Moon's entry uses "about 384,000 km on average".
- Tests: type non-empty, description ≤ 220, exactly 3 facts each ≤ 120, `distanceLy` equals the table (and exists only for fixed targets), no duplicate facts, the Sun has the safety fact, no time-sensitive wording.

## Task 2 — live stats ([live-stats.ts](../../src/app/core/targets/live-stats.ts), pure)

`liveStats(def, state, now, { locale?, elements? })`.
- Moon: "Distance right now" (km) and "Light takes". The distance is the Earth–Moon (geocentric) distance from astronomy-engine, not your own topocentric one: the topocentric figure dips below 356,000 km when the Moon is overhead, which is not the number people expect, and it is what keeps the specified 356,000–407,000 km range true.
- Sun and planets: millions of km plus AU ("778 million km (5.2 AU)"), light time (distance ÷ 299,792.458 km/s) in seconds/minutes/hours; planets add "Brightness" (magnitude, one decimal).
- Stars and deep sky: "Distance" (about N light-years; "2.5 million" for millions) and "Light you're seeing left it" (about N years ago; Betelgeuse adds "(roughly)").
- Satellites: "Height" via `eciToGeodetic`, "Speed" from the propagated velocity vector, "Sunlit". Without orbit data those rows are simply omitted.
- Everything: "Up from here" ("42° above the horizon" or "Below the horizon"). Numbers use the user's locale (tested with `de-DE`).
- `eciToGeodetic` was added to the `satellite-lib.ts` re-exports (and its test); no provider or pipeline logic changed.
- Tests: Moon distance within 356,000–407,000 km over 2026–2027 weekly; Venus light time 2–15 minutes over a year; ISS height 370–460 km and speed 7.5–7.8 km/s for the fallback elements at ±1 day from epoch; light-year and light-time formatting; locale; every row.

## Task 3 — info card ([features/target-info/](../../src/app/features/target-info/))

One bottom sheet, shown from `TargetInfoService` (so any part of the app can open it). Header (glyph, name, type), the Sun safety line first in the Sun-banner style, description, the 3 facts, live rows (refresh every 5 s; satellites every 1 s), **Find it** and **Close**. Modal dialog, focus trap, Escape (handled inside the card so a picker beneath stays open), backdrop and swipe-down close, focus returns to the opener, reduced motion fades instead of sliding.
- Entry points: an ⓘ per picker row (separate 44×44 button, `aria-label="About {name}"`; the card opens over the picker); an ⓘ beside the found toast; a tap on a Look Around marker or name.
- **Find it** selects the target, switches back to find mode, and closes the card and the picker.
- Opening a satellite's card loads its orbit data (a user action).
- Tests: dialog attributes, content, three facts, live rows per kind, Sun order, Find it/Close, Escape isolation, focus, swipe, refresh intervals (planet 5 s, ISS 1 s), orbit-data fetch only for satellites, analytics, every target opens.

## Task 4 — Look Around

- **Entry/exit:** "Look Around — See everything at once" is the first item in the picker, above "Best right now" (hidden while searching). The top chip reads `Look Around ▾`; picking any target (row or chip) leaves for find mode. Persistence like the selected target: `?mode=look` and localStorage (`ptm.mode`); `?target=` without `mode` stays find mode (a remembered look mode is not restored in that case).
- **Engine:** `mode: 'find' | 'look'` signal, `setMode()`; look mode pauses the tracker through `setTrackerPaused(true)` (no found/lost events, no stats, no lines, no glow, no toast). `tickLook()` computes every catalog target on its existing cadence (satellites per frame, the Moon every 5 s, everything else every 30 s) and projects them. Orbit data is requested when look mode starts; until it arrives, satellites are absent. The find-mode `tick()` and everything in it are unchanged.
- **Drawing** ([draw-look.ts](../../src/app/core/render/draw-look.ts), in the existing rAF loop): a faint horizon (altitude 0° every 3° of azimuth, in-front segments only) and N/E/S/W on it; markers sized by brightness (3–8 px: dot for stars and planets, a small ellipse for deep sky, the satellite dot); above the horizon solid and opaque, below it 35% opacity with dashed outlines; names only (`shortName`, 13 px, dark halo). The Sun has ⚠️ and "Sun — don't look"; the Sun safety banner shows while the Sun is within 30° of the screen center, and the camera toggle stays available.
- **Labels** ([label-layout.ts](../../src/app/core/render/label-layout.ts), pure): priority order (above horizon, then brightest, `null` magnitude last, then input order); candidates right, left, above, below and the four diagonals; the first box (text + 4 px padding) that overlaps no placed label and no other marker and is fully on screen wins; otherwise the label is hidden and the marker stays. Deterministic. Tests: no overlaps (five random 60-target scatters), all on screen, determinism, priority (above-horizon > brightness > null > input order), edge flipping, hidden-label case.
- **Interaction:** tap a marker or label (touch area at least 44×44 px, from the last drawn frame) opens the info card; otherwise drag/keyboard behave as in find mode. A visually hidden live region lists the names on screen, updated at most every 2 s. The sight-alignment button is hidden in look mode.
- **Performance (not a browser measurement):** all 22 targets projected, laid out and drawn through a no-op canvas context, aimed at the densest patch of the sky for the moment, 400 frames in the Node test runner on this machine: **median 0.22 ms, p99 1.1 ms, max 2.1 ms**. That is the cost of our own per-frame work, with room to spare against 16 ms. I did **not** run a real browser, so the true frame time and any long-task count on a phone are unmeasured. The dense patch had only 4 targets on screen at a phone's field of view, so a worse real-world case is a wide FOV with the camera on; the check is in the manual list.
- Tests: engine look mode (tracker paused, no found events and no stats even with the Moon centered, back in find mode finding works again, every target returned and satellites only with data, orbit-data fetch only when look mode starts, per-kind cadence, Sun-near-center flag, persistence, startup modes); drawing (horizon, each cardinal, names only, above/below styling, Sun mark and label, ellipse vs dot, off-screen skipped, crowds, marker sizes, hit areas and nearest-marker rule); App (picker ⓘ, Find it, Look Around item and chip, leaving look mode, toast ⓘ, Sun banner rules, alignment hidden, startup analytics).

## Task 5 — analytics

`look_around_opened { from: picker | link | restored }` (picker click; `?mode=look` or a remembered mode at startup) and `target_info_opened { target, from: picker | found | look-around }`. Same rules as Phase 7: exact property sets (tested against the table), nothing under `?debug`. "Find it" from a card does not emit `target_selected`, because the Phase 7 `from` values have nothing that fits it.

## Pins and what did not change

Phase 2 characterization spec, Phase 3 Moon draw-call pins, `find-lines.spec.ts` and the Moon-selection replay: no diff, pass. Providers, renderers, `availability.ts`, `satellite-passes.ts`, `gp.service.ts` and `api/gp.ts`: no diff. The find flow is untouched: Look Around is a separate path chosen before the existing `tick()` is called. Earlier test files changed only to extend a type or a list (`targets.spec.ts` gained the required `info` on its fake; the analytics spec's allowed-property table gained two events). The picker takes its mode as an input and reports choices as outputs, so its tests did not need to change.

## Decisions and deviations

- The info content lives in its own file and is merged into the catalog (see Task 1).
- The picker does not inject the engine (injecting it started its timers inside the picker's fake-timer tests); the app wires `lookActive` / `lookAroundChosen` / `targetChosen`.
- The Look Around row uses the class `sub`, not `status`, so existing picker status-row counts stay meaningful.
- Look mode hides the find intro and the orbit-status line, and ignores a Sun selected as the find target for the banner and camera lock (the banner follows the Sun's position instead).
- `lookNames` (the screen-reader line) lists targets on screen including those below the horizon, marked "(below the horizon)".

## Open questions

- Where is the Moon animation? (See Task 0.)
- A one-off flake: in one of eight full-suite runs, three tests in `sky-engine.characterization.spec.ts` failed; the next seven runs (also under `TZ=UTC`) passed. I did not see the message. Those tests drive the Moon engine with real timers, and its 5-second recompute interval could overwrite a fixed-date state on a heavily loaded machine. The spec is a pin, so I did not touch it; if it recurs in CI, the fix is fake timers in that spec's setup.
- Real-browser frame time for Look Around (above).
- The Betelgeuse distance wording and the 550 ly figure follow your table; the card says it is uncertain.

## Out of scope, noticed

- The debug overlay's target `<select>` does not list Look Around.
- Look Around does not draw the Moon's phase or Saturn's rings (names and markers only, as specified).
- `track()` still logs to the console in development.
- Nothing is pushed.

## Manual checks (for the human)

1. The Moon looks and behaves as it did at the end of Phase 7, with your added animation gone.
2. Open the picker → tap ⓘ on Jupiter: description, 3 facts, live distance and light time. Tap **Find it**.
3. Find a target, then tap ⓘ on the toast.
4. Picker → **Look Around**. Sweep around: horizon line and N/E/S/W make sense against the real directions; names don't overlap; targets below the ground are faded and dashed.
5. At night, in Look Around, check a few labels against the real sky: the brightest "stars" that don't twinkle are planets, and their labels should sit on them.
6. Tap a label → its info card opens.

## Follow-up

### 1. The flaky Moon characterization pin: root cause and fix

**Reproduction.** The characterization spec alone was clean: 50 consecutive runs, 0 failures. The failures only appear in the full suite: 3 of 12 full runs failed (one failed 5 tests, one 3, one 2). The captured messages:
- `sky-engine.characterization.spec.ts` (3 tests): `phases[0]: expected '10000:searching:9900:0' … received '10000:searching:0:0'`. The search timer read 0 instead of 9,900 ms: the tracker had been reset, and it never reached "found".
- `sky-engine.service.spec.ts` (2 tests): `expected [] to deeply equal ['found']` and `expected 'searching' to be 'found'`.

**Root cause: a state leak from my own Phase 8 test, not a clock or timer problem.** `look-perf.spec.ts` calls `engine.setMode('look')`, which persists `ptm.mode = look` to localStorage and `?mode=look` to the URL, and it never cleaned up. The engine starts in Look Around if either is present, and Look Around pauses the tracker, so any engine spec that ran after it in the same worker started paused (`searching`, elapsed 0, no found events). Which spec landed after it depends on how the files are scheduled, so it failed only some of the time, and only the specs that happened to follow it. The Phase 7 interval/`new Date()` recompute that I had suspected was not involved.

**Fix (test setup only; no expected value touched).**
- `look-perf.spec.ts`: clears localStorage and resets the URL before and after each test (the leak itself).
- `sky-engine.characterization.spec.ts` and `sky-engine.service.spec.ts`: a `beforeEach` that clears localStorage and resets the URL, so a stray remembered mode from any future spec cannot pause them. `git diff` of the characterization spec shows only that added `beforeEach`.

**Confirmation:** see the results line below.

### 2. `target_selected` from "info"

`from` now also allows `info`; the app emits `target_selected { target, from: 'info' }` when **Find it** is tapped on an info card. The exact-properties test still demands `{ target, from }` only, and gained a case for `info`; the app test checks the event sequence for a Find-it tap. (This replaces the "does not emit" note in Task 5 above.)

**Confirmation.** After the fix: the characterization spec passed **98 of 98** isolated runs (two 50-run loops, one of them under extra load), and the full suite passed **10 of 10** consecutive runs (544 tests each) with nothing else running. Before the fix the same full-suite loop failed 3 of 12. One earlier verification attempt was discarded: a stray background loop was still running, so two full suites ran at once and unrelated App tests hit their 5-second timeout; the engine and characterization specs did not fail in it. That points at a second, separate weakness: the heaviest App specs have little headroom under heavy parallel load. It did not occur in any clean run, so I left it alone.

Totals now: 544 tests (543 + the new `info` case); main bundle unchanged at about 122 KB gzipped.
