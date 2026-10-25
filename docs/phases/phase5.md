# Phase 5 — The picker ("drop box") and availability

> Read `docs/ARCHITECTURE.md` (§2, §5.6, §8) and `docs/phases/phase4-report.md` first.
> This is the phase that turns the app from "find the Moon" into "pick something, then find it". It adds the picker sheet, live availability labels ("Up now", "Rises 9:42 PM", "Never rises from here"), and rewrites the intro for any target. Targets, providers and renderers from Phases 2–4 must not change.

## Out of scope

Satellites (Phase 6), personality voices / analytics / README (Phase 7), new targets.

---

## Task 1 — Sentence names

Add `nameInSentence` to every catalog entry: "the Moon", "the Sun", "Jupiter", "Polaris", "the Andromeda Galaxy", "the Orion Nebula", "the Pleiades", "the Galactic Center", "the Large Magellanic Cloud", etc. Add `shortName` where `name` is long (e.g. "Andromeda", "Orion Nebula", "LMC") for chips. A test asserts every entry has both fields (shortName may equal name).

## Task 2 — Availability engine (pure, `core/targets/availability.ts`)

```ts
type Visibility =
  | 'up-visible'      // above horizon and bright enough for current sky darkness
  | 'up-daylight'     // above horizon, sky too bright for this target
  | 'up-too-faint'    // above horizon, dark sky, but fainter than the naked-eye limit (or magnitude null)
  | 'below-horizon';

interface Availability {
  targetId: string;
  computedAt: Date;
  altitudeDeg: number;
  visibility: Visibility;
  low: boolean;                       // up but below 10°
  nextRise: Date | null;              // within the search window
  nextSet: Date | null;
  alwaysUp: boolean;                  // never sets within the window
  neverUp: boolean;                   // never rises within the window
  neverRisesHere: boolean;            // fixed targets only: geometrically impossible at this latitude
}
```

- **Sky darkness** from the Sun's altitude: `< −12°` dark (limit mag 6.0), `−12…−6°` twilight (limit 3.0), `> −6°` daylight (limit −3.5; only the Sun, Moon, Venus and occasionally Jupiter qualify). Pass the limit table in as a parameter with these defaults so it's testable.
- **Horizon:** "up" means apparent altitude > 0°.
- **Crossings:** generic scan, no per-kind special cases: sample altitude every 20 min over the next 48 h, then bisect each sign change to 30 s. Same code for every kind (Phase 6 will pass a different step for satellites).
- `neverRisesHere` for fixed targets: `dec < −(90 − |lat|)` for northern observers (mirror for southern). `alwaysUp` circumpolar check is fine to leave to the scan.
- Performance: compute in chunks (yield to the browser between targets, e.g. `setTimeout(0)` or `requestIdleCallback` fallback) so the sheet opens instantly with skeleton labels. Cache per target for 5 min (keyed by rounded location). **Measure** the time for the full catalog on your machine and put it in the report.

**Tests (independent where possible):**
- Jupiter and Saturn rise/set from the scan agree with astronomy-engine `SearchRiseSet(body, observer, ±1, start, 2)` within 2 min (planets are near point sources, so both use the center).
- Moon rise/set agree within 4 min (SearchRiseSet uses the upper limb; we use the center; note this in the test).
- Polaris at lat 39.6 → `alwaysUp`; at lat −30 → `neverRisesHere`.
- LMC at lat 39.6 → `neverRisesHere`, `nextRise === null`.
- Visibility table: Sirius up at night → `up-visible`; Sirius up at noon → `up-daylight`; Venus up in twilight → `up-visible`; Galactic Center up at night → `up-too-faint`; M31 up in twilight (mag 3.44) → `up-too-faint`, at full dark → `up-visible`.
- Chunked runner yields at least once for the full catalog (fake timers).

## Task 3 — Status labels (pure formatter)

`formatAvailability(a, now, locale): { label: string; tone: 'good' | 'meh' | 'off' }` using `Intl.DateTimeFormat` with the user's locale (short time) and relative phrasing for < 12 h:

| Situation | Label | Tone |
|---|---|---|
| up-visible, not low | "Up now" | good |
| up-visible, low | "Up now · low in the sky" | good |
| up-daylight | "Up, but the sky's too bright" | meh |
| up-too-faint | "Up, but too faint to see" | meh |
| below, rises < 12 h | "Rises in 3h 12m" | meh |
| below, rises later | "Rises tomorrow 9:42 PM" / "Rises Tue 4:10 AM" | off |
| alwaysUp (up) | "Up all night" (append the visibility caveat if not up-visible) | good/meh |
| neverRisesHere | "Never rises from here" | off |
| neverUp (other) | "Not up in the next 2 days" | off |

Galactic Center: when up, label "Up · hidden behind dust" (meh). Sun: when up, label "Up — never look at it" (meh), with ⚠️ in the row. Tests for every row, with a fixed locale (`en-US`) and timezone (`America/Denver`).

## Task 4 — Picker sheet UI (`features/target-picker/`)

- **Entry point:** a target chip at the top center: `[icon] Jupiter ▾`. Tap → opens the sheet. Also reachable from the intro (Task 5). Keyboard: `t` opens it in drag/desktop mode.
- **Sheet:** bottom sheet, max 80% height, dark translucent, rounded top, drag handle; closes on swipe down, backdrop tap, Escape. `role="dialog"`, `aria-modal`, focus trap, focus returns to the chip. Respects safe-area insets and `prefers-reduced-motion` (no slide; fade).
- **Contents, top to bottom:**
  1. Search field ("Search the sky"), filters by name/shortName/id, case- and accent-insensitive.
  2. **"Best right now"**: up to 3 chips — `up-visible` targets sorted by magnitude (brightest first), excluding the Sun. Hidden if none.
  3. Sections in this order: Solar system, Stars, Deep sky. (Satellites section appears in Phase 6 — design the list so adding a section is a data change.)
  4. Each row: small icon (reuse a mini version of the target's renderer, or a simple glyph per render style — your call, keep it cheap), name, status label with tone color, and a faint "found 3×" badge if the per-target stats count > 0. Selected row has a check mark.
  5. Within a section, keep catalog order (stable, predictable) — don't re-sort by availability.
- **Selecting** a row: `TargetSelectionService.select(id)`, close the sheet, reset the search (Phase 2 engine already resets tracker/timer), and show the intro for the new target (Task 5).
- Sun row tap shows a confirm first: "Never look at the Sun — not directly, not through your camera. Continue?" (Cancel / I understand).
- Rows are ≥ 48 px tall; the whole sheet is usable one-handed with a thumb.

## Task 5 — Intro rewrite (target-aware)

- Headline: "Find {nameInSentence}." with the first letter capitalized ("Find the Moon.", "Find Jupiter.", "Find the Andromeda Galaxy.").
- Subline stays "Move your phone until it appears." Under it, a small tappable "or pick something else ▾" that opens the picker.
- If the target isn't `up-visible`, add one honest line using the Task 3 label, e.g. "Jupiter is below the horizon right now — it rises in 3h 12m. You can still point at it through the ground." / "The Galactic Center is up, but hidden behind dust." / "The Large Magellanic Cloud never rises from here."
- Keep the privacy note. Keep the iOS tap-to-begin and hold-flat flows exactly as they are.
- Moon on first visit: identical wording to today except "moon" → "Moon" (capitalization fix). Update any test that asserted the old lowercase string and say so in the report.

## Task 6 — Deep links and sharing

- `?target=<id>` already selects; make sure opening a shared link shows that target's intro.
- Corner-stat share text includes the target and the link with `?target=<id>` (drop `debug`): "Found Jupiter in 4.2s — https://…/?target=jupiter".
- Debug selector stays in `?debug` only.

## Acceptance criteria

- [ ] All earlier pins (Phase 2 characterization, Phase 3 Moon draw calls) pass with no expected-value edits. Only the intro capitalization test may change.
- [ ] New tests for Tasks 1–3 plus component tests for the sheet (opens, search filters, select changes target and closes, Escape closes and restores focus, Sun confirm). Report the new total.
- [ ] Full-catalog availability time measured and reported; sheet opens without visible delay.
- [ ] `npm run format && npm run lint && npx ng test --watch=false && npm run build` pass; bundle < 150 KB gzipped.
- [ ] `docs/phases/phase5-report.md` per ARCHITECTURE §8 with the manual steps below.

## Manual check (for the human)

1. On your phone (no `?target`), the intro reads "Find the Moon." Tap "or pick something else ▾" → the sheet opens.
2. Check "Best right now" against reality: are those things actually up and visible where you are?
3. Pick something below the horizon → the intro tells you when it rises. Pick the LMC → "Never rises from here."
4. Pick Jupiter (or any planet that's up) and find it. Share from the corner toast → the link opens straight into Jupiter on another device.
5. Compare one rise time with a public source (e.g. timeanddate.com for your city) — should be within a few minutes.
6. One-handed: can you open, scroll, search and pick with your thumb alone?
