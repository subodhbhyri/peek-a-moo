# Phase 1 report — Make pointing trustworthy

Status: implemented, all automated checks green. **Not yet field-tested** — the phase gate is the outdoor test at the bottom. Nothing has been committed.

## Result of the oracle tests (Task 2, run before touching sensor code)

All three passed on the untouched v1 math, so v1's ephemeris/projection/W3C rotation is correct as reviewed. The wrong-Moon problem is therefore hardware/assumption related (§4 A–D), not a math bug.

- 2a: `describeBasis(cameraBasisFromRotation(rotationFromEuler(…))).azimuthDeg` equals the W3C spec compass formula within 1e-6° for 500+ seeded (mulberry32) random orientations.
- 2b: flat-phone top-edge heading = `wrap360(360 − alpha)`.
- 2c: `setDeclination(D)` + absolute event alpha `a` (upright) → published azimuth = `wrap360(360 − a + D)` for 4 declinations × 6 alphas. Driven through the real `OrientationService` with synthetic window events (see decisions).

## What changed

**Housekeeping (Task 1)**
- `PLAN.md` → `docs/archive/PLAN-v1.md` (README and one code comment that linked to it updated).
- `package.json`: `"engines": { "node": ">=22.12" }`; `.nvmrc` = `22`.
- `format:check` already passed at the start, so there is no separate format commit.

**Sensors (Task 3)** — [orientation-math.ts](../../src/app/core/sensors/orientation-math.ts), [orientation.service.ts](../../src/app/core/sensors/orientation.service.ts)
- `referenceHeading()` removed (back-camera branch gone). New `flatReferenceHeading(r)`: top-edge heading only when its horizontal component ≥ 0.85, else `null`.
- `HeadingOffsetCalibrator.update(..., dtMs, screenAngleDeg)` ignores everything except flat + `screenAngleDeg === 0`. New `state(): CompassCalibration` (`uncalibrated | calibrating | calibrated | stale`), `lastSampleAgeMs()`. `spread()` kept.
- `OrientationService`: `compassCalibration` signal (Android/absolute is always `calibrated`), `lastCompassSampleAgeMs()`, both also in the debug object. On iOS the basis is `null` (Moon not drawn) until `calibrated`/`stale`.
- UI in `app.ts`/`app.html`/`app.css`: "Hold your phone flat for a second." with inline-SVG icon; "Now raise it to the sky." for 1.5 s on success; "Still calibrating — step away from metal or magnets and hold flat again." after 8 s; bottom hint on `stale`. Intro copy is hidden while a banner is up. iOS-only (`needsMotionPermissionGesture()`).

**Sight alignment (Task 4)** — `core/calibration/`
- `alignment.ts` (pure): `computeYawCorrection`, `applyYawCorrection`, plus pure `isAlignmentValid` (age < 6 h, ≤ 50 km, same source) and `distanceKm` so validity is unit-tested without Angular.
- `alignment.service.ts`: localStorage (try/catch), `stored` signal, `yawFor(source)` (clears when invalid), `set`, `clear`.
- `OrientationService` applies it after smoothing and before `basis.set`; keeps `uncorrectedBasis()` for Lock; not applied in manual drag mode.
- [align-control.ts](../../src/app/features/align-control/align-control.ts): crosshair button (`aria-label="Align with the real Moon"`, only when sensors are active and the Moon is up), align mode with Lock/Cancel, confirm above 45°, toast "Aligned (corrected N°)", "Aligned ✓" chip → "Reset alignment".

**Camera FOV (Task 5)**
- `core/projection/camera-fov.ts` (pure) `displayedVerticalFovDeg`, default long-side FOV 69°.
- `camera-fov.service.ts`: camera-on, video size, long-side FOV override (localStorage), `vFovInUseDeg`.
- `app.ts` passes the video size on `loadedmetadata`/`resize` of the `<video>`; `sky-view.ts` uses the derived FOV while the camera is on and `V_FOV_DEG = 62` otherwise (checked cheaply each frame; the `resize` observer covers viewport changes).
- [camera-settings.ts](../../src/app/features/camera-settings/camera-settings.ts): gear + FOV slider (45–90°, step 0.5), camera mode only. Faint crosshair in camera mode (drawn by the align control).

**Debug report (Task 6)**
- `core/debug/debug-report.ts` (pure `buildDebugReport`, location rounded to 1 decimal) and a **Copy report** button in the debug overlay (clipboard, falling back to a selectable `<textarea>`). The overlay also shows calibration state, last compass sample age, alignment and camera/FOV.
- `appVersion`: `scripts/stamp-version.mjs` (run by `prebuild`/`prestart`) writes git-short-sha (or Vercel's `VERCEL_GIT_COMMIT_SHA`, else build time) to gitignored `public/version.json`; the overlay fetches it. Shows `dev` when absent.

## Tests

64 before → **100 after** (12 files). New: oracle (3), flatReferenceHeading (3) and rewritten calibrator tests (8, replacing 3 old), alignment (12), camera-fov (7), debug-report (5), orientation.service iOS gating + alignment (3).

Checks run: `npm run format && npm run lint && npx ng test --watch=false && npm run build` — all pass. Bundle: main 85.9 KB gzipped (limit 150 KB).

Rotation signs were pinned by tests, not intuition: positive yaw is *clockwise* (north + 90° → east), asserted with explicit vectors and against `directionFromAzAlt`. Ephemeris code and `projection.ts` are untouched.

## Decisions

- **2c via the real service**, not a factored pure function: it exercises smoothing, declination and basis in one go. jsdom lacks `ondeviceorientationabsolute`, so the test defines it (as `null`) to make the service pick that event, as Android Chrome does.
- Calibrator takes an injectable clock as a constructor argument (not an `update` parameter).
- On `stale`, the first fresh flat sample **discards** the old offset instead of blending, so the state goes `calibrating` → `calibrated` and the Moon is hidden for ~1 s while the "hold flat" banner shows. Gyro drift is slow, so nothing real is lost.
- `status` stays `'waiting'` on iOS until the first calibration.
- The FOV slider controls the **long-side** FOV (what the device actually has); the vertical FOV is derived.

## Deviations from the spec, and why

1. `flatReferenceHeading` also requires the screen to face up (device z has positive Up component). Spec only says horizontal ≥ 0.85, which also matches face-down; what iOS reports face-down is exactly the kind of unverified assumption this phase removes.
2. Calibrator uses a plain running mean while the history is shorter than the time constant (`k = max(EMA k, 1/(n+1))`), then the usual circular EMA. Pure EMA seeded with the first sample could not guarantee "within 1° of the offset" under ±3° noise in 1.2 s.
3. `appVersion` mechanism (above) is mine; spec only says "git short sha if available, else build time".
4. Playwright headless sanity: **skipped** — not installed and the phase says no new dependencies. The overlay/align/copy-report flows are covered by unit tests of their logic only, not by a rendered check.

## Open questions

- `webkitCompassHeading` for a flat, portrait phone is *assumed* to be the top-edge heading. That is the best-supported case (and avoids the reported iOS 26 interface-orientation change), but it is still unverified on a device. `report-before.json` will show it: `iosOffsetSpread` should be ≈ 0 and `compassCalibration` should read `calibrated`.
- Alignment corrects yaw only. If the field test shows an *altitude* error, that is a different problem (beta/gravity), not something this phase addresses.

## Out of scope, noticed

- Both `.prettierrc` and `.prettierrc.json` exist; one is probably redundant.
- `docs/ARCHITECTURE.md` and `docs/phases/` are untracked in git.
- A phone locked to landscape never gets `screenAngle === 0`, so iOS would stay uncalibrated; the "hold flat" banner would never clear. Unlikely given the portrait-style UI, but not handled.
- The find tracker keeps running while align mode is open (a "found" moment can fire while the user is lining up the Moon).
- Drag-mode fallback ignores the alignment by design, per the spec.

## Manual field test (for the human, after deploy)

Do this outside with the Moon visible, on the Vercel preview URL with `?debug`.

1. Turn off any magnetic phone case/wallet mount. Stand away from cars and metal railings.
2. iPhone: when asked, hold the phone flat until it says "Now raise it to the sky."
3. **Before aligning**, point the phone's back at the real Moon (camera off), hold still, tap **Copy report**, save it as `report-before.json`.
4. Tap the crosshair button → center the real Moon → **Lock**. Note the correction it shows.
5. Turn around, look away, come back to the Moon. Does the drawn Moon land on it? Tap **Copy report** → `report-after.json`.
6. Turn the camera on. Do the overlay and the video Moon coincide at the center? Move the Moon to a screen edge — still together? Adjust the FOV slider if not; note the value.
7. Paste both reports and your notes into the next planning chat.

Pass: after alignment, the drawn Moon is within ~3° (about six Moon-widths) of the real one from any direction you approach.

## Follow-up

1. **Calibrator wraparound.** New test: true offsets of 179°, −179°, 180°, −180°, 177°, −177° with ±3° noise. During the short-history period the error stays under the 3° single-sample noise bound; after 1.2 s it is `calibrated` with the offset within 1° and spread < 0.05. It passed without a code change, because the calibrator already averages sin/cos sums rather than raw angles, so no unwrapping was needed.
2. **Prettier config: duplicate removed.** `.prettierrc` and `.prettierrc.json` are **not** identical. `.prettierrc` has `printWidth: 100` and an Angular parser override for `*.html`. `.prettierrc.json` has `printWidth: 120` and `trailingComma: "all"`. Prettier reads `.prettierrc` first, so that one is in effect today. Keeping the `.json` one would have reformatted the whole codebase. **Decision: keep `.prettierrc`** (the config already in effect), so `.prettierrc.json` was deleted. `format:check` reports zero changes.
3. **Find tracker pauses in align mode.** `SkyEngineService.setTrackerPaused()` / `trackerPaused`. While paused: no tracker steps, so no found/lost events and no stats; frames report `searching` with a zero search timer; the sky view clears any speech and the face stays hidden. Starting align mode pauses it. Lock, Cancel, confirming-then-cancel, and component teardown all resume it. Resuming drops the tracker, so the next tick starts a fresh search timer. Tests are in `sky-engine.service.spec.ts`: baseline find, silent while paused then a fresh timer (a find 500 ms after resume reports 500 ms), and a pause mid-find emits no `lost`.
4. Format, lint, tests and build all pass.
