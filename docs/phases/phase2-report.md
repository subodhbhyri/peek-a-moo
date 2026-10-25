# Phase 2 report — Target abstraction (Moon migrated, zero visible change)

Status: implemented; `npm run format && npm run lint && npx ng test --watch=false && npm run build` all pass. Task 0–1 are committed (`fae55e8`); the refactor itself (Tasks 2–6) is **not committed**. Not yet checked on a device.

## What changed

**Task 0** — Phase 1 field result appended to `docs/ARCHITECTURE.md` §4, after the table.

**Task 1 — characterization tests, written and committed against the pre-refactor code** (`fae55e8`)
[sky-engine.characterization.spec.ts](../../src/app/core/engine/sky-engine.characterization.spec.ts), fixed location (39.6, −104.7, 1800 m), three fixed dates, snapshotted once from the old code:
- waning crescent, up (2026-11-06 12:30Z) · full, high (2026-10-26 03:00Z) · full, below horizon (2026-10-26 15:00Z).
- Pinned per case: Moon az/alt/direction/sun direction, phase name, illuminated fraction, angular diameter; for four fixed `cameraBasisFromAzAlt` poses the projection (x, y, onScreen, centerDistance, angular distance, edge angle), `radiusPx`, `brightLimbRad`; and a scripted tracker run (off-screen → centered 500 ms → found → away → lost) with phases, search timers and events.
- Tolerance 1e-9 for numbers, exact for states. NaN/Infinity are pinned as strings.
- **After the refactor the expected literals are byte-identical.** Only four adapter lines changed (`engine.moon()` → `target()`, `recomputeMoon` → `recompute`, `frame.moon` → `frame.target`, and the phase/size field names). The git diff of that file shows nothing else.

**Task 2 — target model** (`core/targets/`)
- `target.types.ts`, `catalog.ts` (Moon only, `DEFAULT_TARGET_ID`, `getTarget`), `providers/moon.ts` (`moonTargetState`, wraps `computeMoonState`; magnitude from `Illumination(Body.Moon).mag`), `compute.ts` (dispatcher; unimplemented kinds throw "No provider for target …"), `cadence.ts`.
- `ephemeris.ts` is unchanged.

**Task 3 — selection** — `target-selection.service.ts`: `selectedId`, `selected`, `select()`. Precedence `?target=` → localStorage `ptm.target` → default; unknown ids ignored; `select()` persists and uses `history.replaceState`, keeping other params.

**Task 4 — engine**
- `moon` signal → `target`; `recomputeMoon()` → `recompute()`; `SkyFrame.moon` → `target`, plus `def`. `brightLimbRad` is `number | null` (null when no `sunDirection`).
- One effect re-runs on selection or location change: clears state, resets tracker and search timer, recomputes immediately, restarts the timer from `recomputeIntervalMs(kind)` (no timer when it is 0).
- `core/targets/display.ts`: `displayRadiusFor` and `centeredThreshold` return exactly the v1 values (`displayRadiusPx(...)`, 0.35), with the TODO for Phase 3/4.
- Align control uses the current target's direction; label, aria-label and copy come from the target name, so the Moon still reads "Align with the real Moon".
- `events$` events carry `targetId`.

**Task 5 — rendering/UI**
- `core/render/draw-target.ts` dispatches on `def.render`; `'moon'` calls `drawMoonPhase` with the same arguments as before; other styles throw "not implemented". The sky view calls it.
- Face and speech only for `kind === 'moon'`. Find lines, corner stat, intro: unchanged text.
- Debug overlay and Copy report: `moon` → `target: { id, az, alt }` plus top-level `targetId`; everything else is kept.

**Task 6 — stats v2** — [stats.ts](../../src/app/core/personality/stats.ts): `StatsV2 { version: 2, lifetime, perTarget, recentLines }`, `migrateStats()`, `applyFind(stats, targetId, durationMs, now)`. `StatsService` migrates on load and writes v2 back (same storage key). `recordFind(targetId, durationMs)`. Find-line context still uses `lifetime.finds`, so milestones fire at the same counts.

## Tests

104 before Phase 2 → 108 after Task 1 → **131 now** (15 files). New: characterization (4), targets (14: catalog, dispatcher vs `computeMoonState`, magnitude, unsupported kind, cadence, display, selection precedence/fallback/persistence/storage-throws), stats (rewritten, 12 → 20: v1→v2 migration with real-looking v1 JSON, corrupt JSON, per-target fastest, streak logic unchanged, service load/write-back), debug report fields. Bundle: main 87.2 KB gzipped (limit 150 KB).

## Decisions

- Added `SkyFrame.def` so `drawTarget(ctx, frame)` can dispatch on `def.render` without a second lookup.
- Added `TargetState.sunAltitudeDeg` (not in ARCHITECTURE §5.2): the find-line selector needs it for "daytime Moon".
- `TargetState.phase.name` is typed as `MoonPhaseName` for now; Phase 3 widens it for planets.
- Stats: the spec's `lifetime` has `finds / streakDays / lastFindDay`; I also kept `fastestMs` there (an "existing field"). v1's `lifetimeFinds` → `lifetime.finds`, `lastFoundDateKey` → `lifetime.lastFindDay`.
- Migrated Moon `lastFoundAt` is the start of the stored UTC day (v1 stored only a day).
- Corrupt stored JSON gives fresh in-memory stats but is **not** rewritten until the next real find, so a transient read problem can't wipe data. Only genuine v1 data is rewritten as v2.
- `?target=garbage`: falls back to the Moon and the URL is **left untouched** until a selection is written.
- Non-Moon targets (none exist yet) would record stats and show the corner toast with a generic ✨, but no face or line.

## Deviations

- None from the spec. (Per-frame recompute for `satellite` (interval 0) is not implemented: the engine just starts no timer. Phase 6 will add it.)

## Open questions

- Per-target `lastFoundAt` for migrated data is approximate (day start). Fine unless a later feature shows "last found" times.

## Out of scope, noticed

- `README.md` still describes the app as Moon-only and the project structure from v1.
- The phase text asks for `ptm.target` as the storage key while other keys use the `find-the-moon.` prefix; followed the spec.
- Nothing is pushed.

## Manual check (for the human, quick, indoors is fine)

1. Open the preview URL. Find the Moon (or use drag mode on a laptop). Face, line and corner toast appear as before.
2. Open `?debug` → Copy report: it has `targetId: "moon"` and a `target` block instead of `moon`.
3. Your existing find count/streak survived (stats migration). If unsure, note your corner-stat numbers before deploying.
4. Open `?target=garbage` → still the Moon, and the URL gets corrected to `?target=moon` on first selection write (or stays untouched; either is fine, note which).
