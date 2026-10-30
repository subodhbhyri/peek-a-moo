# Phase 8 — Facts for every target, and "Look Around" mode

> Read `docs/ARCHITECTURE.md` (§2, §5, §8) and `docs/phases/phase7-report.md` first.
> Three things: remove the Moon animation the human added after Phase 7, give every target an info card with a description and fun facts, and add **Look Around**: a mode that shows every target at once, labeled by name, as you sweep the phone across the sky.
> Providers, availability, the satellite pipeline and the find flow must not change.

## Out of scope

New targets, constellation lines, star catalogs beyond the current 22 targets, AR camera changes, personality line changes.

---

## Task 0 — Remove the human's Moon animation

The human added animation to the Moon after Phase 7 and wants **all of it removed**.

- Find it with git: compare the current tree against the last Phase 7 commit and the CI-fix commit after it (`git log --oneline`, `git diff <phase-7-ci-fix-commit> -- src/`). Remove only those changes.
- Keep everything from Phases 1–7: the Moon face, speech bubble, corner toast and their `prefers-reduced-motion` handling are original features, not part of this removal.
- If you can't tell which commit or change is the human's animation, don't guess. List the candidates in the report and leave them in place.
- After removal, the Phase 2 characterization pins and the Phase 3 Moon draw-call pins must pass with no expected-value edits.

## Task 1 — Info content for every target

Add to each catalog entry:

```ts
info: {
  type: string;            // "Gas giant planet", "Red supergiant star", "Spiral galaxy", "Space station"
  description: string;     // 1–2 sentences, plain language, ≤ 220 chars
  facts: string[];         // exactly 3, each ≤ 120 chars
  distanceLy?: number;     // fixed-sky targets only, from the table below
}
```

**Distances for fixed-sky targets (use exactly; show with "about"):**

| id | distanceLy | note |
|---|---|---|
| sirius | 8.6 | |
| vega | 25 | |
| arcturus | 37 | |
| polaris | 430 | estimates vary a little |
| betelgeuse | 550 | estimates range roughly 500–700; say "about 550, but it's uncertain" |
| m45 | 440 | |
| m42 | 1350 | |
| galactic-center | 26000 | |
| lmc | 160000 | |
| m31 | 2500000 | |

**Rules for facts:**
- Only facts you're confident about that don't go stale. No "currently", no crew counts or names, no mission end dates, no records likely to be broken.
- Round numbers, written as "about …". Put each number's basis in a comment next to it.
- No duplicates across targets. The Sun's description and facts may include the safety line; at least one Sun fact must be the safety message.
- Tone is the app's plain, friendly voice, not the personality voices. Facts are facts.

Tests: every target has `type`, a non-empty `description` ≤ 220 chars and exactly 3 facts ≤ 120 chars each; every fixed-sky target has `distanceLy` matching the table; no duplicate fact strings.

## Task 2 — Live stats (pure, `core/targets/live-stats.ts`)

`liveStats(def, state, now): { label: string; value: string }[]`, shown under the description:

- **Moon, Sun, planets:** "Distance right now" (km for the Moon, millions of km plus AU for planets and the Sun) and "Light takes" (seconds/minutes/hours; distance ÷ 299,792.458 km/s). Planets also get "Brightness" (magnitude, 1 decimal).
- **Stars and deep sky:** "Distance" (`about N light-years`, using the table; format millions as "2.5 million"), "Light you're seeing left it" (`about N years ago`; for Betelgeuse append "(roughly)").
- **Satellites:** "Height" (km above Earth, from range and elevation is not enough; compute geodetic height via `eciToGeodetic`), "Speed" (km/s from the propagated velocity vector), "Sunlit" (yes/no).
- Everything also gets "Up from here" with the current altitude, or "Below the horizon".

Use the user's locale for number formatting. Tests: Moon distance stays within 356,000–407,000 km over 2026–2027 weekly samples; Venus light time stays within 2–15 minutes; ISS height stays within 370–460 km for the fallback elements at ±1 day from epoch; light-year formatting cases.

## Task 3 — Info card UI (`features/target-info/`)

One bottom sheet, reused everywhere:

- Header: target name, `type`, and a small icon (reuse the picker's icon).
- Body: description, the 3 facts as a short list, then the live stats as label/value rows (refresh every 5 s while open; satellites every 1 s).
- Buttons: **Find it** (selects the target, closes the card, returns to find mode) and **Close**.
- Same sheet behavior as the picker: `role="dialog"`, focus trap, Escape and swipe-down close, focus returns to the opener, reduced motion fades instead of slides.

Entry points:
1. An ⓘ button on each picker row (separate tap target from the row; `aria-label="About {name}"`).
2. The found toast gets an ⓘ ("About {name}"), so after finding something you can read about it.
3. Tapping a label in Look Around (Task 4).

The Sun's card shows the safety line first, in the same style as the Sun banner.

## Task 4 — "Look Around" mode

**What it is:** sweep the phone across the sky and see every target's name where it is, all at once. No searching, no found moment.

**Entry and exit:**
- Top item in the picker sheet, above "Best right now": **Look Around — see everything at once** with an icon. Selecting it closes the sheet and enters the mode.
- The top chip reads `Look Around ▾` while in the mode; tapping it opens the picker, and picking any target exits to find mode for that target.
- Persist the mode like the selected target (`?mode=look` deep link plus localStorage); `?target=` without `mode` stays find mode.

**Engine:**
- Add a `mode` signal to the engine: `'find' | 'look'`. In look mode the tracker is paused (no found/lost events, no stats, no personality lines, no edge glow, no toast), using the same pause path as align mode.
- Compute every catalog target's state. Use the existing recompute cadences per kind; don't recompute fixed or solar-system targets per frame. Fetch satellite elements through `GpService` the first time look mode starts (this is a user action, so it's allowed); until they arrive, satellites are simply absent.

**Drawing (canvas, in the existing rAF loop):**
- **Orientation aids:** a faint horizon line (project altitude 0° every 3° of azimuth, draw the in-front segments) and the cardinal letters N, E, S, W on it.
- **Each target:** a small marker using a mini version of its renderer style (dot for stars and planets, a small ellipse for deep sky, the satellite dot), sized by brightness. Above-horizon targets are full opacity; below-horizon ones are 35% opacity with dashed markers, so you can still "look through the ground".
- **Names only**, no descriptions, as the human asked. Use `shortName`. 13 px, with a dark halo stroke for readability on the camera feed.
- **Label collision avoidance (`core/render/label-layout.ts`, pure):** process targets in priority order (above horizon before below; then brightest magnitude first; `null` magnitude last). For each, try candidate positions right, left, above, below, and the four diagonals of the marker; take the first whose box (measured text plus 4 px padding) overlaps no placed label, no other marker and stays fully on screen. If none fits, hide the label but keep the marker. Same input → same output (no randomness).
- **Sun:** the marker has ⚠️ and the label "Sun — don't look". If the Sun is within 30° of screen center, show the Sun safety banner. The camera toggle stays available in look mode but the banner applies.

**Interaction:**
- Tap a marker or label (touch target at least 44×44 px, from the last drawn frame's layout) → opens the info card for that target.
- Keyboard and drag mode work as in find mode.
- Accessibility: canvas content isn't readable by screen readers, so add a visually hidden live region that lists the names of targets currently on screen (update at most every 2 s), and keep the picker reachable.

**Performance:** measure frame time with all 22 targets on screen-ish (point at a dense patch, e.g. Orion with Betelgeuse, M42 and Sirius plus planets) in drag mode on a laptop, and report it. Target: no long tasks over 16 ms from look mode itself.

## Task 5 — Analytics

Two events, same rules as Phase 7 (exact property sets, nothing under `?debug`):

| Event | Properties |
|---|---|
| `look_around_opened` | `from`: `picker` \| `link` \| `restored` |
| `target_info_opened` | `target`, `from`: `picker` \| `found` \| `look-around` |

## Acceptance criteria

- [ ] Task 0 removal done (or candidates listed if unclear); all pins pass with no expected-value edits.
- [ ] New tests for Tasks 1, 2, 4 (`label-layout`: no overlaps, all on screen, deterministic, priority respected, hidden-label case), info card component tests, look mode pauses the tracker (no found events, no stats), analytics property sets. Report the new total.
- [ ] Look mode frame time measured and reported.
- [ ] `npm run format && npm run lint && npx ng test --watch=false && npm run build` pass; main bundle < 150 KB gzipped.
- [ ] `docs/phases/phase8-report.md` per ARCHITECTURE §8 with the manual checks below.

## Manual checks (for the human)

1. The Moon looks and behaves as it did at the end of Phase 7, with your added animation gone.
2. Open the picker → tap ⓘ on Jupiter: description, 3 facts, live distance and light time. Tap **Find it**.
3. Find a target, then tap ⓘ on the toast.
4. Picker → **Look Around**. Sweep around: horizon line and N/E/S/W make sense against the real directions; names don't overlap; targets below the ground are faded and dashed.
5. At night, in Look Around, check a few labels against the real sky: the brightest "stars" that don't twinkle are planets, and their labels should sit on them.
6. Tap a label → its info card opens.
