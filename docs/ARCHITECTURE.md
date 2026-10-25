# Peek-a-Moo v2 — Architecture

> Living design doc. Read this before every phase file in `docs/phases/`.
> v1 was "find the Moon". v2 is "pick anything in the sky, then find it".

## 1. Product in one paragraph

The user opens a picker ("drop box") and chooses a target: the Moon, a planet, a bright star, the Andromeda Galaxy, the ISS, and so on. The app then runs the same find loop v1 had: dark screen, move the phone, the target slides in from the correct edge, a short found moment (face/line/toast) when it's centered. The picker shows what's actually findable right now ("up now", "below horizon, rises 21:42", "next ISS pass in 3h 12m", "too faint to see, but it's there").

## 2. Non-negotiables

1. **Pointing must be trustworthy before anything else ships.** Every target depends on the same sensor pipeline. v1 field test: the drawn Moon was not where the real Moon was. Phase 1 fixes and verifies this. No new targets until Phase 1's field test passes.
2. **No user data leaves the device.** Location stays local. The only network call v2 adds is fetching public satellite orbital elements through our own cached endpoint (Phase 6).
3. **Per-frame work stays out of Angular change detection.** The rAF loop writes canvas/styles directly; signals are for UI state only.
4. **Every piece of astronomy or geometry math is a pure function with tests**, ideally against an independent oracle (spec formula, published value, or a second library path), not only against our own conventions.
5. **Sun safety.** When the target is the Sun, the app warns never to look at it directly or through the camera, and the found moment says so.

## 3. Current state (v1 snapshot)

```
src/app/core/
  math/vec3.ts               ENU vectors, Mat3, quaternions, slerp
  astro/ephemeris.ts         computeMoonState() via astronomy-engine (topocentric)
  astro/declination.ts       WMM2025 magnetic declination (geomagnetism)
  sensors/orientation-math.ts   W3C Euler -> rotation, camera basis, iOS HeadingOffsetCalibrator
  sensors/orientation.service.ts  event handling, smoothing, declination, status signals
  sensors/location.service.ts, drag-look.ts, wake-lock.service.ts, permissions.ts
  projection/projection.ts   pinhole projection, lit-limb angle, edge glow
  tracking/find-tracker.ts   searching -> visible -> found -> lost state machine
  engine/sky-engine.service.ts  glue: ephemeris + orientation + projection + tracker
  render/moon-phase.ts       Moon phase drawing
  personality/*              find lines, stats
features/ sky-view, moon-face, corner-stat, city-picker, debug-overlay
```

Conventions kept in v2: world frame **ENU** (x=East, y=North, z=Up); azimuth clockwise from **true** north; screen angles y-UP (0 = right, π/2 = up).

## 4. Why v1 pointed at the wrong place (findings that drive Phase 1)

The ephemeris, projection and W3C rotation math check out on review (and the rotation matches the W3C spec's own compass-heading formula). The problems are in assumptions about real hardware:

| # | Suspect | Evidence | Fix (Phase 1) |
|---|---|---|---|
| A | **iOS heading reference when the phone is upright.** `referenceHeading()` assumes `webkitCompassHeading` reports the back-camera direction when upright and switches sources at ~45° tilt. This was never verified; if wrong, upright error can be 90–180°. iOS 26 also reportedly started compensating heading for interface orientation at the OS level, which broke other apps' landscape headings by 90°. | Code comment marked it "VERIFY ON DEVICE"; never verified. | Only sample the compass when the phone is **near-flat and in portrait**, where `webkitCompassHeading` is unambiguous (top-edge heading). Hold the offset while upright (gyro alpha is stable). Add a one-second "hold flat" step. |
| B | **Magnetometer error** (uncalibrated sensor, phone case magnets, indoors, cars). Typically 5–30°, on both platforms. | Expected on real hardware; not fixable in code alone. | **Sight alignment**: user centers the real target once and taps Lock → stored yaw correction. |
| C | **Camera mode FOV mismatch.** Overlay uses a fixed 62° vertical FOV, but the video is cropped by `object-fit: cover`, so the real visible FOV differs per phone and orientation. Objects off-center drift from their real spot. | `V_FOV_DEG = 62` constant, no relation to the video. | Derive displayed FOV from the video size + crop, with a per-device adjustable sensor FOV. |
| D | Lack of field data. | No way to see what was off. | Debug "Copy report" button that dumps a JSON snapshot. |

> **Phase 1 field result (2026-10-25, iPhone, iOS 26.6.1):** drawn Moon matched the real Moon without alignment. Upright `webkitCompassHeading` (249.2° magnetic) agreed with flat-calibrated pointing (248.1° magnetic) within ~1°, so suspect A did not reproduce on this device; flat-only calibration stays as the safer design. Android and camera-mode FOV are still unverified.

## 5. Core model (introduced in Phase 2)

### 5.1 Target definitions (static catalog)

```ts
type TargetKind = 'moon' | 'sun' | 'planet' | 'fixed' | 'satellite';
type TargetCategory = 'solar-system' | 'stars' | 'deep-sky' | 'satellites';

interface TargetDef {
  id: string;                 // 'moon', 'jupiter', 'm31', 'iss' — URL-safe, stable (used in ?target= and stats)
  name: string;               // "Andromeda Galaxy"
  kind: TargetKind;
  category: TargetCategory;
  blurb: string;              // one line for the picker
  render: RenderStyle;        // how to draw it (see 5.4)
  fixed?: { raHours: number; decDeg: number; magnitude: number;  // J2000
            sizeDeg?: [major: number, minor: number]; positionAngleDeg?: number };
  body?: 'Sun' | 'Moon' | 'Mercury' | 'Venus' | 'Mars' | 'Jupiter' | 'Saturn' | 'Uranus' | 'Neptune';
  satellite?: { noradId: number };
}
```

Catalog lives in `core/targets/catalog.ts` as plain data.

### 5.2 Target state (computed)

```ts
interface TargetState {
  id: string;
  computedAt: Date;
  direction: Vec3;            // unit ENU, apparent (refraction included)
  azimuthDeg: number;
  altitudeDeg: number;
  magnitude: number | null;   // null when not meaningful
  angularSizeDeg: number;     // true size; renderer decides display size
  // optional extras by kind:
  phase?: { illuminatedFraction: number; phaseDeg: number; name: string };   // Moon, Mercury, Venus
  sunDirection?: Vec3;        // for lit-limb orientation (Moon, inner planets)
  skyNorthDirection?: Vec3;   // for orienting extended objects on screen
  satellite?: { sunlit: boolean; velocityDegPerSec: Vec3; tleAgeDays: number };
}
```

### 5.3 Providers (pure functions, one per kind)

```
core/targets/providers/
  solar-system.ts   astronomy-engine Equator(of date, topocentric) -> Horizon(..., 'normal'); Illumination() for magnitude/phase
  fixed-sky.ts      J2000 RA/Dec -> Rotation_EQJ_HOR(time, observer) -> RotateVector -> HorizonFromVector(v, 'normal')
  satellite.ts      satellite.js json2satrec(OMM) -> propagate -> eciToEcf -> ecfToLookAngles; sunlit test
```

`computeTargetState(def, date, observer): TargetState` dispatches by kind. The Moon provider wraps the existing `computeMoonState` so v1 behavior and tests are preserved.

Verified during planning (astronomy-engine 2.1.19): the rotation-matrix path and the `DefineStar` path agree to 0.01° for M31. Use the rotation path — it has no 8-star limit.

### 5.4 Rendering per kind

| RenderStyle | Used by | Drawing |
|---|---|---|
| `moon` | Moon | existing `drawMoonPhase` |
| `planet` | planets | disc with color; Saturn gets rings (tilt cosmetic); Mercury/Venus get phase via the moon-phase renderer |
| `sun` | Sun | bright disc + glow, safety banner |
| `star` | stars | point with glow; brightness from magnitude; color from B−V-ish hint in catalog |
| `extended` | galaxies, nebulae, clusters | procedural ellipse/cloud at **true angular size**, rotated by position angle using sky-north on screen; no copyrighted imagery |
| `satellite` | ISS etc. | dot + short motion trail + direction arrow; dimmed with "in Earth's shadow" when not sunlit |

Display size: true angular size when that's ≥ the minimum; otherwise a minimum sprite size (the Moon keeps v1's exaggeration). Position is always exact.

Sky-north on screen (for extended objects): tangent at the target toward the north celestial pole (ENU direction az=0°, alt=observer latitude), projected onto screen axes — same pattern as `brightLimbScreenAngle`.

### 5.5 Engine

`SkyEngineService` becomes target-agnostic:
- `selectedTarget` signal (persisted to localStorage, overridable by `?target=<id>`).
- Recompute cadence by kind: satellite every frame (SGP4 is cheap), Moon 5 s, others 30 s.
- `tick()` returns a `SkyFrame` with `target: TargetState` instead of `moon`.
- Find thresholds scale with displayed size (a 3° galaxy shouldn't need pinpoint centering).
- Switching targets resets the tracker and search timer.

### 5.6 Availability (picker info)

`core/targets/availability.ts`, pure:
- `altitudeAt(def, date, observer)` → generic.
- `nextCrossing(altFn, from, horizonDeg, direction)` → scan 48 h in 10-min steps (satellites: 24 h in 20-s steps), then bisect to 10 s.
- `visibility(state, sunAltDeg)` → `'up-visible' | 'up-daylight' | 'up-too-faint' | 'below-horizon'`, using naked-eye limit mag 6 in darkness, ~−3 in daylight (Venus/Moon/Sun/ISS only).
- Computed lazily when the picker opens; cached 5 min. No web worker needed (~20 targets).

### 5.7 Satellites data pipeline (Phase 6)

- CelesTrak ran out of 5-digit catalog numbers on 2026-07-11; new objects only exist in OMM formats, not TLE. Use **OMM JSON** + `satellite.js` 7.x `json2satrec` (verified working during planning).
- Vercel function `api/gp.ts` fetches a **whitelisted** set (ISS 25544, Tiangong/Tianhe 48274, Hubble 20580) from CelesTrak, returns compact JSON with `Cache-Control: public, s-maxage=7200, stale-while-revalidate=86400`. CelesTrak updates GP every 2 h and asks clients to download at most once per update; on any non-200 response the function must stop and serve the last good copy, never retry in a loop.
- Bundled fallback snapshot `public/data/gp-fallback.json` (+ `npm run gp:refresh` script) so the app works offline; UI marks elements older than 7 days as "approximate".

### 5.8 Personality

Line packs per target (`core/personality/lines/<id>.ts`) sharing the existing tag selector. The Moon keeps its awkward voice; others get short voices of their own (Jupiter: smug; ISS: busy, "can't talk, doing 7.66 km/s"). Stats become per-target + lifetime.

## 6. v1 catalog (curated, ~22 targets)

| Category | Targets |
|---|---|
| Solar system | Sun ⚠️, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune |
| Stars | Polaris, Sirius, Betelgeuse, Vega, Arcturus |
| Deep sky | Andromeda Galaxy (M31), Orion Nebula (M42), Pleiades (M45), Galactic Center (Sgr A*), Large Magellanic Cloud |
| Satellites | ISS, Tiangong, Hubble |

Later candidates: Voyager 1/2 (fixed coordinates from JPL Horizons, refreshed yearly), Starlink trains, comets of the season, meteor shower radiants, a "JWST is roughly here" anti-Sun marker.

## 7. Phase roadmap

Each phase is one file in `docs/phases/`, sized for one Claude Code (Sonnet) session. A phase ends with a `docs/phases/phaseN-report.md` written by the implementer; the next phase file is written after reviewing that report.

| Phase | Goal | Gate to continue |
|---|---|---|
| **1** | Pointing accuracy: iOS flat-only calibration, sight alignment, camera FOV, oracle tests, debug report | Outdoor field test: real Moon within ~3° on your phone after alignment; report pasted back |
| 2 | Target abstraction; migrate Moon with zero behavior change | All v1 tests pass; Moon looks identical |
| 3 | Sun + planets: providers, renderers, Sun safety | Jupiter/Venus land on the real ones outdoors |
| 4 | Fixed sky: stars + deep sky, extended renderer, sky-north orientation | Polaris altitude ≈ latitude; M31 orientation test |
| 5 | Picker ("drop box") + availability (rise/set, labels) + `?target=` deep links | Picker usable one-handed; correct up/down states |
| 6 | Satellites: `api/gp`, OMM + SGP4, passes, trail renderer | ISS pass matches a public tracker within ~1 min |
| 7 | Per-target personality + stats, analytics events (`target_found`), share, README for portfolio | CI green, Lighthouse pass |

## 8. Working rules for every phase (for the implementer)

- Read `docs/ARCHITECTURE.md` and the phase file fully before editing. Inspect the real code first; the repo may have drifted from this snapshot.
- Stay inside the phase's scope. Note anything else in the report under "Out of scope, noticed".
- Before finishing: `npm run format && npm run lint && npx ng test --watch=false && npm run build` must all pass.
- New math → new tests in the same PR. Prefer independent oracles over self-consistency.
- Don't add dependencies the phase doesn't list.
- Write `docs/phases/phaseN-report.md`: what changed (files), test count, decisions made, deviations from the spec and why, open questions, and the exact manual test steps for the human.
- Stop at the end of the phase. Don't start the next one.
