# Find the moon — build plan

A mobile web app that opens to a dark screen. You move your phone around, and when it points at the real Moon, the Moon slides in from the correct edge, sits at the correct spot, and reacts awkwardly at being caught.

**Status legend:** `[x]` done · `[ ]` to do · `[~]` done in code, needs on-device verification

**Working name:** "Find the moon" (whereisthemoon.com is taken). Pick a domain in phase 8.

---

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Framework | Angular 21 (standalone components, signals, zoneless, Vitest) | Enterprise-heavy job market, Google's own framework, less common on new-grad portfolios. Upgrade to 22 with `ng update @angular/core @angular/cli` once local Node ≥ 22.22.3. |
| Ephemeris | `astronomy-engine` | Topocentric positions (parallax shifts the Moon up to ~1°), phase and illumination in one well-tested library. |
| Magnetic declination | `geomagnetism` (bundles WMM2025, valid to Nov 2029) | Phone compasses report magnetic north. Declination is 5–15° across the US, which is big enough to miss the Moon. |
| Rendering | Canvas 2D for the sky and Moon phase; an SVG/CSS layer on top for the face and poses | No 3D engine needed. |
| Backend | None. Static site on Vercel. | Location never leaves the device. Say so in the UI. |
| Start flow | Auto-start on Android and desktop. On iOS, "tap anywhere to begin." | iOS only grants motion access inside a user gesture. There's no way around it, so the whole screen is the tap target and the copy barely changes. |
| Version scope | Moon only. Jupiter and Venus come in a later version, using the same engine with a different `Body`. | |

---

## Architecture

```
src/app/
  core/
    math/vec3.ts                 ENU vectors, matrices, quaternions, slerp
    astro/ephemeris.ts           computeMoonState(date, position) -> az/alt, direction, sun direction, phase
    astro/declination.ts         WMM declination
    sensors/permissions.ts       iOS gesture-gated permission helper
    sensors/orientation-math.ts  W3C Euler -> rotation matrix -> camera basis; iOS compass calibrator
    sensors/orientation.service.ts   events -> true-north, smoothed CameraBasis signal
    sensors/location.service.ts      geolocation signal + manual fallback
    projection/projection.ts     pinhole projection, lit-limb angle, display size
    tracking/find-tracker.ts     searching -> visible -> found -> lost state machine (pure)
    engine/sky-engine.service.ts glue: tick(now, viewport) -> SkyFrame; events$ (found/lost)
    render/moon-phase.ts         geometrically correct phase drawing
  features/
    sky-view/                    full-screen canvas + rAF loop
    debug-overlay/               /?debug readout for on-device verification
  app.ts / app.html              first-run gate + intro copy
```

Data flow per frame: `OrientationService.basis` + `SkyEngine.moon` → `projectDirection` → `stepTracker` → `SkyFrame` → canvas. Found and lost events go out on `SkyEngineService.events$`, and the personality and stats layers subscribe there.

**Coordinate conventions (don't break these):** The world frame is ENU (x=East, y=North, z=Up). Azimuth is measured clockwise from true north. Screen angles in `SkyFrame` use y-UP math convention (0 = right, π/2 = up), so convert to canvas with `rotate(-angle)`.

---

## Phase 1 — Setup
- [x] Angular project, strict TS, Vitest (`npm test`)
- [x] Dependencies: `astronomy-engine`, `geomagnetism` (whitelisted as a CommonJS dependency)
- [x] `.npmrc` with `legacy-peer-deps=true`, which works around an npm arborist crash on jsdom's optional `canvas` peer
- [x] ESLint (`angular-eslint` v21, flat config) + Prettier (`npm run lint`, `npm run format`, `npm run format:check`)
- [x] GitHub Actions (`.github/workflows/ci.yml`): format check, lint, test, build on push and PR
- [ ] Connect the repo to Vercel. Framework preset: Angular. Output: `dist/find-the-moon/browser` (already set in `vercel.json`). Every PR gets an HTTPS preview URL, which is the easiest way to test sensors on real phones. **This step is yours** — see the setup instructions below.

## Phase 2 — Math core (hard) ✅
- [x] Topocentric Moon and Sun positions, phase, illuminated fraction, distance, angular size
- [x] Magnetic declination via WMM2025
- [x] W3C DeviceOrientation Euler → rotation matrix (no raw-Euler shortcuts, so no gimbal lock when upright)
- [x] Camera basis (forward = out of the back of the phone, screen up and right) with portrait and landscape correction
- [x] Pinhole projection with FOV, off-screen detection with radius margin, and an edge-direction hint that works even when the Moon is behind you
- [x] Lit-limb direction on screen, from the great circle toward the Sun (handles latitude, time and phone roll automatically)
- [x] Unit tests: 35 passing, including real 2024 full, new and first-quarter moons, WMM values, projection geometry and tracker timing

## Phase 3 — Sensor pipeline (hard) ✅ / needs device check
- [x] iOS permission helper. It must run synchronously in the gesture, and `app.ts` calls it first in the tap handler.
- [x] Android: `deviceorientationabsolute` (north-referenced)
- [x] iOS: relative `alpha` fused with `webkitCompassHeading` through a circular-EMA offset calibrator, so the view rotates smoothly while the compass slowly pins it to north
- [x] Magnetic → true north correction
- [x] Quaternion slerp smoothing (τ = 70 ms)
- [x] "No sensors" detection (2.5 s timeout) and "no compass" detection
- [x] iOS compass accuracy exposed as `compassAccuracyDeg` for the figure-8 hint
- [~] **Verify on a real iPhone:** the calibrator assumes `webkitCompassHeading` reports the heading of the top edge when the phone is flat and of the back camera when it's upright. Open `/?debug` and tilt between flat and upright. `spread` should stay near 0 and `pointing az` should match a compass app plus the declination. If it drifts, change `referenceHeading()` in `orientation-math.ts`. Nothing else depends on it.
- [~] **Verify on a real Android device:** `pointing az` should match a compass app plus the declination.
- [~] **Verify landscape on both platforms:** the Moon should stay put when you rotate the phone 90° (`screen.orientation.angle` handling).

## Phase 4 — Moon on screen (hard) ✅ / needs outdoor check
- [x] Full-screen canvas with devicePixelRatio scaling and resize handling, and a rAF loop outside change detection
- [x] Phase-correct Moon rendering (crescent and gibbous terminator, earthshine on the dark side, lit side rotated toward the Sun)
- [x] Found and lost state machine: 400 ms centered dwell before "found," 1 s off-screen before "lost"
- [x] `/?debug` overlay with raw sensors, calibration, pointing direction, Moon position and Δ
- [x] Headless simulation: the Moon enters from the correct edge and centers at Δ = 0/0
- [~] **Go outside and point at the real Moon.** The drawn Moon should overlap it. If it's consistently off in one direction, check declination and heading first, then FOV.

## Phase 5 — First-run UX and fallbacks ✅
- [x] Gate logic: auto-start on Android and desktop, tap-anywhere on iOS, motion-denied state
- [x] Intro copy: "Find the moon." / "Move your phone until it appears." with a one-line privacy note, in a light italic serif headline over sans-serif body — night-sky-appropriate, not a generic template look
- [x] Intro fades away once `moonVisible` fires (`moonSeen` signal)
- [x] **Location denied or unavailable:** a "Set location" chip opens a searchable city picker (`core/data/cities.ts`, ~110 cities) → `LocationService.setManual()`
- [x] **No sensors / no compass:** pointer-drag and arrow-key look control (`core/sensors/drag-look.ts`, unit tested) kicks in automatically, with a one-line hint
- [x] **iOS figure-8 hint** shown when `compassAccuracyDeg() > 25`
- [x] **Motion denied on iOS:** explains that reloading and allowing motion access is needed
- [x] Recompute the Moon and re-acquire the wake lock on `visibilitychange` → visible
- [x] Verified end-to-end in headless simulation: intro, iOS tap gate, drag-mode hint, city picker + search, all render correctly

## Phase 6 — Personality and delight ✅
- [x] **Face and pose layer** (`features/moon-face`): eyes + an "oh—" open-mouth expression, sized and positioned every frame via direct style writes (no change-detection cost), visible only while "found"
- [x] **Speech bubble:** appears on each `found` event, fades after ~3.4s, skipped entirely (no animation) under `prefers-reduced-motion`
- [x] **Line selection** (`core/personality/find-lines.ts`, 13 unit tests): tagged by first-ever, milestone (5/10/25/50/100/200/500/1000 lifetime finds), quick (<3s), long-hunt (>30s), moon phase, daytime, below-horizon, late-night, and repeat — recently-shown lines are avoided when an alternative exists
- [x] **`StatsService`** (`core/personality/stats.service.ts`): lifetime finds, fastest time, day streak, persisted to localStorage, every access wrapped in try/catch; pure logic (`stats.ts`) is unit tested separately from the localStorage wrapper
- [x] **Corner stat** (`features/corner-stat`): "Found the moon in 4.2s 🌘", fades after 5s, tap to share (Web Share API, falling back to clipboard with a "Copied!" flash)
- [x] **Edge-glow hint** (`core/projection/projection.ts::edgeGlowPoint`, unit tested): a soft glow ramps in on the nearest screen edge after 20s of searching
- [x] **Haptics:** `navigator.vibrate(30)` on found, wrapped in try/catch (iOS ignores it harmlessly)
- [x] `prefers-reduced-motion` respected: speech bubble and corner-stat fades become instant, no CSS keyframe animation

## Phase 7 — Polish ✅ (analytics and camera FOV are noted as follow-ups)
- [x] Screen Wake Lock (`core/sensors/wake-lock.service.ts`), enabled on start, re-acquired on `visibilitychange` → visible, fails silently where unsupported
- [x] PWA: `@angular/service-worker` + manifest, custom moon-crescent icons (72–512px, plus a maskable variant) generated to match the in-app Moon color, `display: standalone`, dark theme color
- [x] Optional camera mode: a toggle button requests the environment-facing camera and shows it behind the transparent canvas. **Known limitation:** it doesn't yet recalibrate `V_FOV_DEG` to the phone's real camera field of view, so the drawn Moon's position is correct but its accuracy relative to what the camera frames may drift slightly — good enough for the "cool" factor, worth revisiting later if it becomes the primary way people use the app.
- [x] Safe-area insets throughout (notch, home bar), custom favicon, Open Graph image + meta description, apple-touch-icon
- [ ] **Analytics — deliberately left undone.** Wiring Vercel Analytics or Plausible needs your account/keys, so it's a manual step at deploy time (see instructions below). Track only anonymous events (found, find-time bucket, platform) and never location.
- [x] Lint (`ng lint`) and format (`prettier --check`) both pass clean; bundle is ~80 KB gzipped, comfortably under the 150 KB target

## Phase 8 — Launch (yours to do)
- [ ] Pick a name and domain (ideas: moonpeek, peekaboomoon, heymoon, moonhide) and connect it in Vercel
- [ ] README has setup instructions; consider adding a demo GIF once you've recorded one on a real phone
- [ ] Add it to the portfolio site

## Later versions
- [ ] Find Jupiter and Venus: add a body selector. The ephemeris wrapper generalizes by swapping `Body.Moon`.
- [ ] Camera mode FOV calibration (see Phase 7 note)

---

## Notes for whoever implements the rest

- Run `npm test -- --watch=false` before and after changes. Don't edit `core/` math without adding a test.
- Sensor testing on a laptop: Chrome DevTools → More tools → Sensors can emulate location and orientation. For real phones, use a Vercel preview URL (sensors require HTTPS) or `ng serve --host 0.0.0.0 --ssl`.
- Per-frame work stays in the rAF loop and never goes through signals or change detection. The UI reacts through `SkyEngineService.moon`, `events$`, and `SkyView.moonVisible`.
- `V_FOV_DEG` in `sky-view.ts` is a feel knob. A lower value makes the Moon harder to find.
- `npm run lint` and `npm run format` before committing — CI runs both and will fail the build otherwise.
