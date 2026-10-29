# Phase 7 — Personality, analytics, polish, launch

> Read `docs/ARCHITECTURE.md` (§2, §5.8, §8) and `docs/phases/phase6-report.md` first.
> Final phase. No new targets and no new astronomy. Gives every target a voice, adds anonymous analytics, finishes the rename from "Find the moon" to Peek-a-Moo, and makes the repo portfolio-ready. Behavior of providers, renderers, availability and the satellite pipeline must not change.

## Out of scope

New targets, notifications, accounts, any new network call except the existing analytics script.

---

## Task 0 — Decisions from Phase 6

- Pin `satellite.js` to the exact installed version in `package.json` (no `^`), with a comment in `src/app/core/satellite-lib.ts` naming the version and the `dist/` paths it imports. Add a test that imports each re-export so a moved file fails CI loudly.
- "Approximate" orbit data (3–14 days): debug readout only, no user-facing label. "Stale" (> 14 days) keeps the Phase 6 label. Update the formatter tests accordingly.
- `.github/workflows/gp-refresh.yml`: weekly (`cron: '17 9 * * 1'`) + `workflow_dispatch`. Runs `npm ci && npm run gp:refresh`; if `public/data/gp-fallback.json` changed, commits it with message `chore: refresh satellite fallback data` using `GITHUB_TOKEN` (`permissions: contents: write`). Exactly one script run per workflow run; no retries (the script already exits non-zero on any non-200 — let the job fail).

## Task 1 — Personality per target

Today: the Moon has the tagged-line system (`find-lines.ts`, first-ever, quick, long-hunt, phase, daytime, below-horizon, late-night, milestones, recent-line avoidance). Other targets have one fixed line each.

- Generalize to line packs: `core/personality/lines/<id>.ts` exporting tagged lines, selected by the **existing** selector (extend it, don't rewrite it). The Moon pack must produce exactly the same selections as today for the same inputs — move the Moon lines into `lines/moon.ts` and keep `find-lines.spec.ts` passing unchanged (only imports may change).
- Every target gets a pack with at least: `first` (first find of this target), `repeat` (2–3 lines), `quick`, `long-hunt`, and one context tag that fits (e.g. planets: `bright`/`low`; stars: `twinkle`; deep sky: `faint`; satellites: `overhead`, `shadow`; Sun: `safety` only). The existing one-liners from Phases 3/4/6 become each pack's `first` line.
- Voices (keep lines short, lowercase like the Moon's, factual where a fact is used):
  - Moon: awkward, caught off guard (unchanged).
  - Sun: no jokes about looking at it. Every Sun line is a variant of "found it, now look away". `safety` lines only.
  - Mercury: rushed. Venus: dramatic. Mars: defensive about being "just red dust". Jupiter: smug. Saturn: vain about the rings. Uranus: tired of the jokes, never makes one. Neptune: lonely, far away.
  - Polaris: steady, everyone's reference point. Sirius: knows it's the brightest. Betelgeuse: aware it might explode one day, calm about it. Vega: "former pole star, it's fine". Arcturus: a hurried traveler.
  - Andromeda: "we're going to collide in ~4.5 billion years, don't worry about it". Orion Nebula: a nursery, busy. Pleiades: sisters talking over each other. Galactic Center: unseen, a little ominous. LMC: southern, never visits.
  - ISS: busy, polite, ~7.66 km/s. Tiangong: also busy. Hubble: retired-adjacent, nostalgic, still working.
- Facts: only ones you can state confidently and that don't go out of date quickly (no crew counts by name, no "currently" claims). Put any number used in a line in a comment with its basis.
- Milestones use **per-target** counts for non-Moon targets and lifetime counts for the Moon (as today).
- Tests: each pack has every required tag; no line > 80 chars; no duplicate lines across packs; the Sun pack contains only safety-tagged lines; Moon selections unchanged.

## Task 2 — Anonymous analytics

`main.ts` already calls `Analytics.inject()` from `@vercel/analytics`. Add a thin wrapper `core/analytics/analytics.service.ts` that calls `track()` and swallows any error (the script may be blocked).

Events (and **only** these properties — never location, never coordinates, never user agent beyond the bucket):

| Event | Properties |
|---|---|
| `target_selected` | `target` (id), `from`: `picker` \| `best-now` \| `link` \| `default` |
| `target_found` | `target`, `seconds`: bucket `<3` \| `3-10` \| `10-30` \| `30+`, `visibility` (Phase 5 value), `camera`: boolean, `aligned`: boolean |
| `alignment_locked` | `correction`: bucket `<5` \| `5-15` \| `15-45` \| `45+` |
| `share` | `target`, `method`: `native` \| `clipboard` |
| `sensor_mode` | `mode`: `ios` \| `absolute` \| `drag` \| `no-compass` (once per session) |

No events when `?debug` is present. Tests: each event's property set is exactly the table's (a test fails if a new property sneaks in); location fields are never passed.

## Task 3 — Rename and polish

- Product name **Peek-a-Moo** everywhere user-facing: `<title>`, `manifest.webmanifest` (`name`, `short_name`, `description`: "Point your phone at the sky and find the Moon, planets, stars, galaxies and the ISS."), meta description, OG tags. Keep the package name and output path (`dist/find-the-moon/browser`) unchanged so Vercel config doesn't break; note this in the report.
- Regenerate `public/og-image.png` (1200×630, same visual language: dark background, the crescent, plus a few small dots for planets/stars). Script it (`scripts/og-image.mjs` with a canvas-free approach, e.g. write an SVG and convert with an existing dependency or commit the SVG→PNG step output) — or, if no tool is available without new dependencies, write the SVG and ask the human to export it; say which in the report.
- Accessibility pass: every icon button has an `aria-label`; picker rows announce name + status; color is never the only status signal (tone also has text). Lighthouse (mobile) accessibility ≥ 95 and best-practices ≥ 95 if you can run it; otherwise list what you checked by hand.
- Remove dead v1 code paths and leftover TODOs that later phases closed. Don't refactor working code for style.

## Task 4 — README (portfolio-ready)

Rewrite `README.md`:
1. One-line pitch + live link placeholder `<LIVE_URL>` + a slot for a demo GIF (`docs/media/demo.gif`, human records it).
2. What you can find (the categories and a few examples).
3. **How it works** — short sections, plain language, each with the key formula or idea: ENU world frame; W3C DeviceOrientation → rotation matrix → camera basis; iOS flat-only compass calibration (and why); magnetic → true north via WMM2025; sight alignment; pinhole projection and the edge hint; topocentric ephemeris (astronomy-engine); fixed-sky J2000 → horizon rotation; SGP4 from OMM elements, Earth-shadow test, pass finding; sky-north on screen for orienting galaxies and rings.
4. **How it's tested** — oracle tests (W3C formula, second library path, Vallado SGP4 vector, published size/magnitude ranges), characterization pins, field tests per phase (summarize the Phase 1 result).
5. Privacy: location never leaves the device; the only network calls are cached public orbital data and anonymous analytics.
6. Run locally (Node ≥ 22.12), test, deploy (Vercel), `npm run gp:refresh`, `npx vercel dev` for the API.
7. Credits: astronomy-engine, satellite.js, geomagnetism/WMM, CelesTrak (with a link to their usage policy).

Keep it under ~250 lines. Link `docs/ARCHITECTURE.md` and `docs/phases/` for depth.

## Task 5 — Final verification

- All pins (Phase 2 characterization, Phase 3 Moon draw calls, `find-lines.spec.ts`) pass with no expected-value edits.
- `npm run format && npm run lint && npx ng test --watch=false && npm run build` pass; main bundle < 150 KB gzipped.
- Update `docs/ARCHITECTURE.md` §3 ("Current state") to describe v2 as built, and mark all phases done in §7 with their report links.

## Acceptance criteria

- [ ] Tasks 0–5 done; report the new test total and bundle size.
- [ ] `docs/phases/phase7-report.md` per ARCHITECTURE §8 with the manual checks below.

## Manual checks (for the human)

1. Find three different targets; each speaks in its own voice. Find the Moon: same lines as before.
2. Vercel dashboard → Analytics → Events: `target_selected` / `target_found` show up with only the listed properties.
3. Share a link to a friend's phone: the preview card says Peek-a-Moo with the new image.
4. Install to home screen (iOS Share → Add to Home Screen; Android install prompt): icon, name and dark splash look right.
5. Still-open field checks from earlier phases, if you haven't done them: **Android** pointing accuracy (any target), and **camera mode** (overlay on the real video at center and edges, FOV slider value).
6. Record a 15–20 s screen capture (pick a target → sweep → found) for `docs/media/demo.gif`, and add the live URL to the README.
