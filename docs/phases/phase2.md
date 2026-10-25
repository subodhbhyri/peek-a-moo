# Phase 2 — Target abstraction (Moon migrated, zero visible change)

> Read `docs/ARCHITECTURE.md` (especially §5 and §8) and `docs/phases/phase1-report.md` first.
> This is a **refactor**. When it's done, the app must look and behave exactly as it does now. The Moon becomes the first entry in a target catalog so Phases 3–6 can add targets without touching the engine again.

## Context

- Phase 1 passed its field gate on an iPhone (iOS 26.6.1): the drawn Moon matched the real Moon with no alignment. The iOS upright compass heading matched our flat-calibrated pointing within ~1°.
- Untested so far: Android, camera mode / FOV slider. Don't change that code in this phase.

## Out of scope

New targets, the picker UI, satellites, new renderers, personality text changes, visual changes of any kind.

---

## Task 0 — Record the field result

Append to `docs/ARCHITECTURE.md` §4, after the table:

> **Phase 1 field result (2026-10-25, iPhone, iOS 26.6.1):** drawn Moon matched the real Moon without alignment. Upright `webkitCompassHeading` (249.2° magnetic) agreed with flat-calibrated pointing (248.1° magnetic) within ~1°, so suspect A did not reproduce on this device; flat-only calibration stays as the safer design. Android and camera-mode FOV are still unverified.

## Task 1 — Characterization tests FIRST (before refactoring)

Add `core/engine/sky-engine.characterization.spec.ts` that pins current behavior, using a fixed date, a fixed location (lat 39.6, lon −104.7, height 1800 m), and a few fixed camera bases (use `cameraBasisFromAzAlt`):

- Moon az/alt/direction, phase name, illuminated fraction, angular diameter for 3 dates (a crescent, a full, a below-horizon case).
- For each, the `SkyFrame` from `tick()`: projection x/y/onScreen/centerDistance, `radiusPx`, `brightLimbRad`, tracker phase after a scripted sequence (off-screen → centered for 500 ms → found).
- Store expected values as literals produced by the **current** code (snapshot them once, then commit). Tolerance 1e-9 for math, exact for states.

These tests must pass unchanged after the refactor (only import paths / field names may be adapted, e.g. `frame.moon` → `frame.target`). If a value changes, that's a regression — fix the code, not the expectation.

## Task 2 — Target model

New folder `core/targets/`:

- `target.types.ts`: `TargetKind`, `TargetCategory`, `RenderStyle`, `TargetDef`, `TargetState` exactly as in ARCHITECTURE §5.1–5.2 (you may add fields; document any).
- `catalog.ts`: `TARGETS: readonly TargetDef[]` containing **only the Moon** for now (`id: 'moon'`, `name: 'Moon'`, `kind: 'moon'`, `category: 'solar-system'`, `render: 'moon'`, `body: 'Moon'`, a one-line blurb). Plus `getTarget(id): TargetDef | undefined` and `DEFAULT_TARGET_ID = 'moon'`.
- `providers/moon.ts`: `moonTargetState(date, observer): TargetState`, wrapping the existing `computeMoonState` — fill `phase`, `sunDirection`, `magnitude` (use `Illumination(Body.Moon, date).mag`), `angularSizeDeg`. Don't change `ephemeris.ts` math.
- `compute.ts`: `computeTargetState(def, date, observer): TargetState`, dispatching by `kind`; unknown/unimplemented kinds throw a clear error (later phases fill them in).
- `cadence.ts`: `recomputeIntervalMs(kind)` → moon 5000, sun/planet/fixed 30000, satellite 0 (= every frame). Only the moon path is exercised now.

Tests: dispatcher returns the same numbers as `computeMoonState` for the Moon; catalog ids are unique and URL-safe (`/^[a-z0-9-]+$/`); `getTarget('nope')` is undefined.

## Task 3 — Target selection state

New `core/targets/target-selection.service.ts`:

- `selectedId` signal. Initial value, in priority order: `?target=<id>` URL param if it's a known id → localStorage (`ptm.target`, try/catch) if known → `DEFAULT_TARGET_ID`.
- `select(id)`: ignores unknown ids, persists, and updates the URL param with `history.replaceState` (keep other params like `?debug`).
- `selected` computed → `TargetDef`.

Tests: precedence order, unknown id fallback, persistence with storage throwing.

## Task 4 — Engine becomes target-agnostic

In `SkyEngineService`:

- Replace `moon` signal with `target` signal (`TargetState | null`) computed from the selected `TargetDef`. Recompute timer uses `recomputeIntervalMs(kind)` and restarts when the selection changes.
- On selection change: clear the state, reset the tracker and search timer, recompute immediately.
- `SkyFrame.moon` → `SkyFrame.target`. `brightLimbRad` only when `target.sunDirection` exists (it does for the Moon).
- Size and find threshold: extract `displayRadiusFor(state, viewport)` and `centeredThreshold(radiusPx, viewport)` into `core/targets/display.ts`. For the Moon they must return exactly what v1 did (`displayRadiusPx(...)` and `0.35`). Add a TODO noting Phase 3/4 will scale the threshold with size.
- Alignment (Phase 1): Lock uses the **current target's** direction; button label/aria and copy use the target name ("Align with the real Moon" must still read exactly that for the Moon).
- Keep `events$` but include `targetId` in each event.

## Task 5 — Rendering and UI wiring

- Add `core/render/draw-target.ts`: `drawTarget(ctx, frame)` dispatching on `def.render`; `'moon'` calls the existing `drawMoonPhase` with the same arguments as today. Other styles throw "not implemented" for now. Sky view calls `drawTarget` instead of calling the Moon renderer directly.
- Moon face / speech bubble: render only when the selected target's kind is `'moon'` (true today, so no visible change).
- Corner stat, intro copy, find lines: unchanged text. Where code read `frame.moon`, read `frame.target` and the def.
- Debug overlay + Copy report: rename `moon` → `target: { id, az, alt }` and add `targetId` at top level. Keep all other fields.

## Task 6 — Stats migration

Stats become per-target while keeping lifetime totals.

```ts
interface StatsV2 {
  version: 2;
  lifetime: { finds: number; streakDays: number; lastFindDay: string | null; /* existing fields */ };
  perTarget: Record<string, { finds: number; fastestMs: number | null; lastFoundAt: number | null }>;
  recentLines: string[];
}
```

- On load, if stored data is v1 (no `version`), migrate: lifetime fields copy over, all existing find counts and fastest time go to `perTarget.moon`. Write back as v2.
- `applyFind` takes `targetId`.
- Tests: v1 → v2 migration with real-looking v1 JSON; corrupt JSON → fresh v2; per-target fastest updates independently; streak logic unchanged.
- Personality line selection keeps using the lifetime/moon counts it uses today, so lines don't change (e.g. first-ever and milestones still fire at the same counts).

## Acceptance criteria

- [ ] Characterization tests from Task 1 pass after the refactor with only renames adapted.
- [ ] All other existing tests pass; new tests added for Tasks 2, 3, 6. Report the new total.
- [ ] `npm run format && npm run lint && npx ng test --watch=false && npm run build` pass; bundle < 150 KB gzipped.
- [ ] `?target=moon` and no param behave identically; `?target=garbage` falls back to the Moon.
- [ ] No visible change: same intro, same Moon, same face/lines/toast, same align flow and wording.
- [ ] `docs/phases/phase2-report.md` written per ARCHITECTURE §8, with manual steps below.

## Manual check (for the human, quick, indoors is fine)

1. Open the preview URL. Find the Moon (or use drag mode on a laptop). Face, line and corner toast appear as before.
2. Open `?debug` → Copy report: it has `targetId: "moon"` and a `target` block instead of `moon`.
3. Your existing find count/streak survived (stats migration). If unsure, note your corner-stat numbers before deploying.
4. Open `?target=garbage` → still the Moon, and the URL gets corrected to `?target=moon` on first selection write (or stays untouched; either is fine, note which).
