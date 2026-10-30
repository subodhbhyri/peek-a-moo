# Phase 7 report — Personality, analytics, polish, launch

Status: implemented; `npm run format && npm run lint && npx ng test --watch=false && npm run build` pass (format:check clean). Phase 6 is committed (`072c25e`); the Phase 7 work is **not committed**. Nothing has been checked on a device, on Vercel, or with Lighthouse (see Task 3).

**Numbers:** tests 407 → **473** (42 files). Main bundle **110.59 → 115.03 KB** gzipped (limit 150 KB), no lazy chunks.

## Pins and untouched code

- Phase 2 characterization spec, Phase 3 Moon draw-call pins, **`find-lines.spec.ts`**: no diff, pass unchanged.
- Providers, renderers, `availability.ts`, `satellite-passes.ts`, `gp.service.ts` and `api/gp.ts`: no diff (`git status` shows none).
- The Moon's selections are guarded beyond `find-lines.spec.ts`: 120 selections (contexts, recent-line lists and random values) were recorded from the **Phase 6** `selectFindLine` and are replayed against the new code in `lines.spec.ts`; all identical. The Moon's per-tag line counts are asserted too.
- One earlier spec changed on purpose: `target-lines.spec.ts` lost three tests that asserted the old fixed one-liners (`TARGET_FOUND_LINES` no longer exists; the packs' own tests replace them) and one assertion about the ISS line. Two further specs gained a test-only analytics sink (`target-picker`, `corner-stat`).

## Task 0 — decisions from Phase 6

- `satellite.js` is pinned to exactly `7.1.0` in `package.json` (and the lockfile's root entry). [satellite-lib.ts](../../src/app/core/satellite-lib.ts) names the version and the `dist/` files it imports; `satellite-lib.spec.ts` imports every re-export and checks the installed version, so a moved file fails CI.
- "Approximate" orbit data (3–14 days) has no user-facing label; the debug readout says `fresh` / `approximate` / `stale` next to the element age. "Stale" (> 14 days) keeps its label and tone step. A formatter test asserts that approximate data reads exactly like fresh data.
- `.github/workflows/gp-refresh.yml`: `cron: '17 9 * * 1'` plus `workflow_dispatch`, `permissions: contents: write`, `npm ci`, one `npm run gp:refresh`, and a commit `chore: refresh satellite fallback data` only if the file changed. No retries; a failing script fails the job. **Not run** (it needs GitHub).

## Task 1 — personality per target

- **Structure.** `core/personality/lines/` holds `types.ts` (the tag union, `LinePack`), `moon.ts` (the Moon's lines, moved verbatim), one file per other target, and `index.ts` (`LINE_PACKS`). `find-lines.ts` kept its Moon API and tag rules; its pool/recent-line/random logic became a shared `pickLine`, and `selectTargetLine` / `targetLineTags` were added next to it.
- **Tags for non-Moon targets.** The first find of that target → `first` only; a per-target milestone count (5, 10, 25 …) → `milestone` only; otherwise the context tags that fit its kind, then `quick` (< 3 s), `long-hunt` (> 30 s), `repeat` (any later find). Context: planets `bright` (mag < −1) / `low` (< 10°); stars `bright` (mag < 0) / `twinkle` (altitude < 30°, where scintillation is strongest) / `low`; deep sky `faint` (magnitude unknown or > 2.5) / `low`; satellites `overhead` (> 60°) / `shadow` (not sunlit); the Sun only `safety`, on every find. Moon milestones still use lifetime counts; every other target uses its own count.
- **Every pack** has `first`, 2–3 `repeat`, `quick`, `long-hunt`, `milestone` and at least one reachable context tag (the Sun has `safety` only, five variants of "found it, now look away", none about looking at it).
- **Facts.** Each pack file starts with a comment naming the voice and the basis of any fact used. Used: Mercury stays close to the Sun and orbits in 88 days; Venus is the brightest planet; Mars's red is iron-rich dust; Jupiter outweighs all the other planets together; Saturn's rings are mostly water ice; Uranus rotates on its side; Neptune's light takes about four hours to reach us; Polaris's altitude equals your latitude; Sirius is 8.6 light-years away; Betelgeuse is larger than the orbit of Mars and will end as a supernova "eventually"; Vega is a former and future pole star (about 12,000 years); Arcturus is an orange giant and the brightest star of the northern sky; Andromeda is 2.5 million light-years away and approaching at about 110 km/s; the Pleiades are a young cluster of around a thousand stars; the Galactic Center holds a black hole of about 4 million suns about 26,000 light-years away; the ISS moves at about 7.66 km/s with an orbit of roughly 90 minutes; Hubble launched in 1990 and took the Deep Field in 1995.
- **Deliberate changes to facts you asked for or that existed.**
  - Andromeda: the "collide in ~4.5 billion years" line is now "we might collide in a few billion years, don't worry about it". Recent work puts the collision timing and even its certainty in doubt, so no specific number is stated.
  - ISS: the Phase 6 line "Seven people up there, waving" is gone (a crew count goes stale); the first line is "that's the iss. people live up there, and they might be waving."
  - Hubble: no "still taking pictures" (a present-tense claim); it says "launched in 1990. i've seen a lot of sky."
  - The existing one-liners became each pack's `first` line, lowercased to match the voice (the Sun's old "Found it. Now look away from it." is now "found it. now look away.").
- **Tests** (`lines.spec.ts`): a pack per catalog target; each pack's required tags and no tags that don't belong to its kind; no line over 80 characters; no line used twice anywhere; non-Moon lines are lowercase; no "currently"/crew-count phrasing; the Sun pack is `safety` only and jokes about nothing; Moon replay and counts; first/milestone/context/repeat selection; every target × many contexts always yields a line; recent-line avoidance. `app.analytics.spec.ts` drives real found events: Jupiter's first find says its `first` line, Saturn's second comes from its pack, the Sun only ever says safety lines.

## Task 2 — anonymous analytics

- [analytics.service.ts](../../src/app/core/analytics/analytics.service.ts): `AnalyticsService` over an injectable sink (default: `track()` from `@vercel/analytics`, errors swallowed). The events are typed as a closed map, each method rebuilds the event from named fields, and nothing under `?debug` is sent.
  - `target_selected { target, from: picker | best-now | link | default }`: the picker emits `picker` / `best-now`; the app emits `link` (a `?target=` link) or `default` (including a remembered choice) once at start.
  - `target_found { target, seconds: <3 | 3-10 | 10-30 | 30+, visibility, camera, aligned }`: from the sky view's found handler; `visibility` is the Phase 5 availability value.
  - `alignment_locked { correction: <5 | 5-15 | 15-45 | 45+ }`: from the align control's commit.
  - `share { target, method: native | clipboard }`: only after the share or copy succeeded.
  - `sensor_mode { mode: ios | absolute | drag | no-compass }`: once per session (`unsupported` and `manual` both count as `drag`).
- **Tests:** each event's keys equal the table's exactly; extra fields handed in cannot reach the sink and nothing matching lat/lon/coords/agent appears; bucket boundaries; `sensor_mode` once; silence under `?debug`; a throwing sink is swallowed. Wiring is tested in the app (initial source, sensor paths, found, debug), the picker (`best-now` vs `picker`), the corner toast (native, clipboard, cancelled) and the align control (all four buckets).
- `Analytics.inject()` in `main.ts` is unchanged. Custom events need the Web Analytics plan that supports them; the code does not depend on it.

## Task 3 — rename and polish

- **Name:** `<title>`, manifest (`name`, `short_name`, your `description`), meta description, Open Graph and Twitter tags, `apple-mobile-web-app-title`, and the city picker's text now say Peek-a-Moo. The package name and output path (`dist/find-the-moon/browser`) are unchanged, as asked, so Vercel's config keeps working. The Moon's toast ("Found the moon in 4.2s 🌕") and other pinned Moon wording are unchanged.
- **OG image:** [scripts/og-image.svg](../../scripts/og-image.svg) is the source and [scripts/og-image.mjs](../../scripts/og-image.mjs) renders it to `public/og-image.png` (1200×630) with a locally installed Chrome or Edge in headless mode (no new dependency; `CHROME_PATH` overrides). The PNG was generated here and viewed: dark background, the crescent, a few stars, a planet and a satellite trail, "Peek-a-Moo". Note: `og:image` is still the relative `/og-image.png`; many scrapers want an absolute URL, so set it to `https://<your-domain>/og-image.png` once the domain is known (I did not guess one).
- **Accessibility, by hand** (Lighthouse was **not run**; there is no Lighthouse in this environment): the camera toggle had only an emoji, it now has `aria-label="Camera background"` (with `aria-pressed`); the city search input got a label; the Moon's face SVG is `aria-hidden` and its speech bubble is a `role="status"`; the "selected" check and the Sun warning in the picker are `role="img"` with labels; the sky canvas has a label. Every other icon button already had a label. Picker rows read as name + found count + status text, and status is always words (the colour is decoration), as is the "Orbit data unavailable" / "Never rises from here" family. Contrast and the 95 scores are for you to confirm.
- **Dead code:** no TODO/FIXME was left in the source; the only code removed is the fixed one-liner table (replaced by the packs). I did not refactor working code for style.

## Task 4 — README

Rewritten (85 lines, under the 250 limit): pitch, `<LIVE_URL>` and `docs/media/demo.gif` placeholders, what you can find, how it works (ENU frame, W3C Euler → rotation → camera basis, iOS flat-only calibration and why, WMM2025, sight alignment, pinhole projection and the edge hint, topocentric ephemeris, J2000 → horizon, SGP4 + shadow test + passes, generic crossing search, sky-north), how it's tested (oracles, pins, the Phase 1 field result), privacy, run/deploy/`gp:refresh`/`npx vercel dev`, credits and links to ARCHITECTURE and the phase docs. `docs/media/` exists with a `.gitkeep`.

## Task 5 — final verification

- All pins pass with no expected-value edits (above). Checks pass; main bundle 115.03 KB gzipped.
- `docs/ARCHITECTURE.md`: §3 now describes v2 as built (22 targets, the module tree, the pinned tests), §6 is retitled for the shipped catalog, §5.8 notes Phase 7, and §7 marks all seven phases done with report links (and lists the field checks that are still open).

## Decisions and deviations

- Lines for `first` are one per target (as given by the old one-liners); the spec asked for "at least" one.
- `milestone` lines were added to every non-Sun pack so per-target milestones have something to say; the spec's required list did not include them.
- Tags `low` / `bright` also apply to stars and deep sky, not only planets.
- The `moonSeen` / `moonVisible` names in the app are v1 leftovers (they now mean "the target has appeared once"); renaming them would be churn, so I left them.

## Open questions

- `og:image` should be an absolute URL; I need the domain (or you can set it after deploying).
- The weekly workflow commits to `main` directly with `GITHUB_TOKEN`; if `main` is protected it will fail until it is allowed to push (or changed to open a PR).
- The word "found" on the Sun's toast is still "Found the Sun in X.Xs"; the line beneath it now always says to look away.

## Out of scope, noticed

- The debug overlay's target `<select>` lists everything and could be removed now that the picker exists.
- `track()` logs to the console in development; harmless, but noisy while testing.
- Nothing is pushed.

## Manual checks (for the human)

1. Find three different targets; each speaks in its own voice. Find the Moon: same lines as before.
2. Vercel dashboard → Analytics → Events: `target_selected` / `target_found` show up with only the listed properties.
3. Share a link to a friend's phone: the preview card says Peek-a-Moo with the new image.
4. Install to home screen (iOS Share → Add to Home Screen; Android install prompt): icon, name and dark splash look right.
5. Still-open field checks from earlier phases, if you haven't done them: **Android** pointing accuracy (any target), and **camera mode** (overlay on the real video at center and edges, FOV slider value).
6. Record a 15–20 s screen capture (pick a target → sweep → found) for `docs/media/demo.gif`, and add the live URL to the README.
