# Phase 1 — Make pointing trustworthy

> Read `docs/ARCHITECTURE.md` first (especially §4 and §8). This phase changes **no product scope**: the app still only finds the Moon. It makes the Moon land where the real Moon is, and gives us the data to prove it.

## Context

Field test of v1: the drawn Moon did not line up with the real Moon. Review found the core math sound (ephemeris, projection, W3C rotation) but four weak spots in how real hardware is handled:

- **A. iOS upright heading.** `referenceHeading()` in `core/sensors/orientation-math.ts` guesses which device axis `webkitCompassHeading` refers to when the phone is upright, and switches at ~45° tilt. Unverified; can be 90–180° wrong. Also, iOS 26 reportedly applies interface-orientation compensation to heading at the OS level.
- **B. Magnetometer bias** (5–30° typical) on both platforms.
- **C. Camera mode FOV.** `V_FOV_DEG = 62` is used even when the camera feed (`object-fit: cover`) is showing, so the overlay doesn't match the video.
- **D. No field data.** We can't see what went wrong on the device.

## Goals

1. iOS compass calibration that only trusts unambiguous samples (flat + portrait).
2. "Sight alignment": a one-tap, stored yaw correction using the real Moon.
3. Camera-mode field of view derived from the actual video and crop.
4. Tests against **independent oracles**, not our own conventions.
5. A debug "Copy report" so the human can paste field data back for review.

## Out of scope

New targets, picker, satellites, personality changes, visual redesign. Don't rename the app or routes.

---

## Task 1 — Housekeeping (small)

- Move `PLAN.md` → `docs/archive/PLAN-v1.md`. Keep `docs/ARCHITECTURE.md` and `docs/phases/` as given.
- Add `"engines": { "node": ">=22.12" }` to `package.json` and a `.nvmrc` containing `22`. CI already uses Node 22.
- If `npm run format:check` currently fails, run `npm run format` first and commit that separately.

## Task 2 — Independent oracle tests for the existing pipeline (do this BEFORE changing sensor code)

New file `core/sensors/orientation-oracle.spec.ts`.

**2a. W3C spec compass formula.** The W3C DeviceOrientation spec gives this formula for the compass heading of the direction the back of the device points:

```ts
function specCompassHeading(alpha: number, beta: number, gamma: number): number {
  const x = beta * DEG, y = gamma * DEG, z = alpha * DEG;
  const cX = Math.cos(x), cY = Math.cos(y), cZ = Math.cos(z);
  const sX = Math.sin(x), sY = Math.sin(y), sZ = Math.sin(z);
  const Vx = -cZ * sY - sZ * sX * cY;
  const Vy = -sZ * sY + cZ * sX * cY;
  return wrap360(Math.atan2(Vx, Vy) / DEG);
}
```

For ≥500 seeded pseudo-random (alpha 0–360, beta −180–180, gamma −90–90) where the back direction's horizontal component is ≥ 0.2: `describeBasis(cameraBasisFromRotation(rotationFromEuler(a, b, g), 0)).azimuthDeg` must equal `specCompassHeading(a, b, g)` within 1e-6° (circular difference). Use a small seeded PRNG (mulberry32) so failures are reproducible.

**2b. Flat top-edge heading.** For a flat phone (beta=0, gamma=0), heading of the device top edge (+y column) must equal `wrap360(360 − alpha)`.

**2c. Declination round trip.** With `setDeclination(D)` and an absolute event of alpha `a` (upright: beta 90, gamma 0), the published pointing azimuth must equal `wrap360(360 − a + D)`. Drive `OrientationService` by dispatching synthetic events on `window` (`deviceorientationabsolute`), or factor the per-event math into a pure function if that's cleaner — your call, explain in the report.

If any of these fail, **stop and report** before going further; that would be a real bug in v1 math.

## Task 3 — iOS: flat-only compass calibration

In `core/sensors/orientation-math.ts`:

- Replace `referenceHeading()` with `flatReferenceHeading(r: Mat3): number | null`: returns the heading of the device +y axis (top edge) **only** when its horizontal component is ≥ 0.85 (phone within ~32° of flat, either face up or tilted slightly); otherwise `null`. Remove the back-camera branch entirely.
- `HeadingOffsetCalibrator.update(...)` gains a `screenAngleDeg` parameter and ignores samples unless `screenAngleDeg === 0` (portrait UI). `webkitCompassHeading` is only trusted in this pose.
- Track and expose calibration state:

```ts
type CompassCalibration = 'uncalibrated' | 'calibrating' | 'calibrated' | 'stale';
```
  - `calibrating`: some accepted samples, fewer than ~1 s worth or spread > 0.05.
  - `calibrated`: ≥ 1 s of accepted samples with spread ≤ 0.05.
  - `stale`: calibrated, but last accepted sample is older than 10 min (gyro drift).
  - Samples while upright are ignored; the existing offset is held. This is the point: alpha from the gyro is smooth and stable, the compass is only unambiguous when flat.
- Keep the circular-EMA math. Keep `spread()`.

In `orientation.service.ts`: pass the screen angle; expose `compassCalibration` signal (Android/absolute: always `'calibrated'`); expose `lastCompassSampleAgeMs` for debug.

**UI (in `app.ts`/`app.html`, minimal styling consistent with the intro):**
- iOS, after permission, while `uncalibrated`/`calibrating`: overlay "Hold your phone flat for a second." with a small phone-lying-flat icon (inline SVG). On `calibrated`: "Now raise it to the sky." for 1.5 s, then hide.
- If still not calibrated after 8 s: "Still calibrating — step away from metal or magnets and hold flat again."
- `stale`: non-blocking hint at the bottom: "Lower your phone flat for a second to re-sync the compass." Hides once calibrated again.
- Don't show the Moon until `calibrated` on iOS (it would be wrong anyway).

**Tests** (extend `orientation-math.spec.ts`; update or delete tests that covered the old `referenceHeading`):
- Upright samples (beta 90) don't change the offset.
- Landscape samples (screen angle 90/270) are ignored.
- Simulated session: true magnetic north offset X (raw alpha = magnetic alpha − X), feed 1.2 s of flat samples at 60 Hz with `compassHeading = wrap360(360 − magneticAlpha)` plus ±3° noise → state `calibrated`, offset within 1° of X. Then raise to upright and rotate: pointing azimuth stays within 1° of truth.
- `stale` after 10 min with no accepted sample (inject the clock).

## Task 4 — Sight alignment (yaw correction)

New pure module `core/calibration/alignment.ts`:

```ts
/** Degrees to ADD to the phone's pointing azimuth so it matches the target. wrap180. */
export function computeYawCorrection(pointing: CameraBasis, targetDir: Vec3): number;
/** Rotate every basis vector about world Up so pointing azimuth increases by yawDeg. Alt and roll unchanged. */
export function applyYawCorrection(basis: CameraBasis, yawDeg: number): CameraBasis;
```

Tests: `describeBasis(applyYawCorrection(b, c)).azimuthDeg ≡ az + c` (circular), altitude and roll unchanged to 1e-9, vectors stay orthonormal; `applyYawCorrection(b, computeYawCorrection(b, t))` points at `t`'s azimuth; round-trip with ±179°, 0, and wraparound cases. Write the rotation and its sign from the tests, not from intuition.

New `core/calibration/alignment.service.ts` (localStorage via try/catch, same pattern as `StatsService`):

```ts
interface StoredAlignment { yawDeg: number; setAt: number; lat: number; lon: number; source: HeadingSource; }
```
- Valid while: younger than 6 h, within 50 km of where it was set, same heading source. Otherwise ignored (and cleared).
- `OrientationService` applies the valid correction to the published basis (after smoothing, before `basis.set`). Not applied in manual drag mode.

**UI flow:**
- Small corner button (crosshair icon, `aria-label="Align with the real Moon"`), visible only when sensors are active and the Moon is above the horizon.
- Tap → align mode: thin crosshair at screen center, text "Point the center at the real Moon, then tap Lock." Buttons: **Lock**, **Cancel**.
- Lock → compute from the current (uncorrected) basis and the Moon direction; store; toast "Aligned (corrected 12°)". If |correction| > 45°: confirm first — "That's a big correction (73°). Sure that's the Moon?"
- When an alignment is active: small "Aligned ✓" chip; tap → "Reset alignment".

## Task 5 — Camera-mode field of view

New pure `core/projection/camera-fov.ts`:

```ts
export interface CameraFovInput {
  videoWidth: number; videoHeight: number;        // intrinsic, as delivered (portrait on phones in portrait)
  viewportWidth: number; viewportHeight: number;  // CSS px of the cover-fitted element
  longSideFovDeg: number;                         // FOV across the video's LONG side
}
/** Vertical FOV actually visible on screen with object-fit: cover. */
export function displayedVerticalFovDeg(i: CameraFovInput): number;
```

Math: `tan(F_dim/2) = tan(L/2) · dim/longSide` for each video dimension; cover scale `s = max(vw/w, vh/h)`; visible fraction of video height = `(vh/s)/h`; `vFov = 2·atan(tan(F_h/2) · visibleFraction)`. Tests: portrait video in a portrait viewport where height isn't cropped → equals `L` when height is the long side; landscape viewport crops height → smaller; a square viewport case; symmetry checks.

Default `longSideFovDeg = 69` (a 26 mm-equivalent main camera: 2·atan(18/26)). Store a per-device override in localStorage.

Wiring:
- `toggleCamera()` must tell the sky view when the camera is on and pass the `<video>` element (or its dimensions, updated on `loadedmetadata` and `resize`). The sky view uses `displayedVerticalFovDeg` while the camera is on and `V_FOV_DEG` (62, feel parameter) when off.
- In camera mode, show the crosshair faintly and add an "FOV" slider (45–90°, step 0.5) in a small settings popover so the human can match the overlay to the video: point at a distant landmark, compare the edges. Store on change.

## Task 6 — Debug report

In the debug overlay (`/?debug`), add **Copy report**: writes pretty JSON to the clipboard (fallback: show it in a selectable `<textarea>`). Include:

```
timestamp (ISO), userAgent, screen {w,h,dpr,angle}, status, headingSource,
compassCalibration, lastCompassSampleAgeMs, iosOffsetDeg, iosOffsetSpread, compassAccuracyDeg,
declinationDeg, location {lat,lon} ROUNDED TO 1 DECIMAL, locationSource ('gps'|'manual'),
alignment {yawDeg, ageMin} | null, cameraOn, vFovDegInUse, longSideFovDeg,
raw {alpha,beta,gamma,webkitCompassHeading}, pointing {az,alt,roll},
moon {az,alt}, delta {az (wrap180), alt}, appVersion (git short sha if available, else build time)
```

Also show `compassCalibration`, last sample age and alignment in the overlay itself.

## Acceptance criteria

- [ ] All existing tests pass (updated where `referenceHeading` changed) plus the new oracle, calibrator, alignment and FOV tests. Report the new total.
- [ ] `npm run format:check`, `npm run lint`, `npx ng test --watch=false`, `npm run build` all pass. Bundle stays < 150 KB gzipped.
- [ ] No change to Moon ephemeris code or the projection math (other than taking a dynamic vFOV).
- [ ] Headless sanity (if you have Playwright available): iOS flow shows the "hold flat" overlay; align mode shows the crosshair; Copy report produces valid JSON. Skip with a note if not available.
- [ ] `docs/phases/phase1-report.md` written (see ARCHITECTURE §8), including the manual test steps below verbatim so the human can follow them.

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
