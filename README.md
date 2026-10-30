# Peek-a-Moo

**Point your phone at the sky and find the Moon, planets, stars, galaxies and the ISS.**

Live: <LIVE_URL> · Demo: ![demo](docs/media/demo.gif)

Pick something in the sky, then move your phone until it slides into view from the right edge. Peek-a-Moo draws the target where it really is, tells you what is up right now, and — once you find it — says something about it. The Moon is mildly embarrassed. Jupiter is smug. Uranus is tired of the jokes.

## What you can find

| Category | Examples |
|---|---|
| Solar system | the Moon (with phase), the Sun (with safety warnings), Mercury to Neptune, Saturn with rings |
| Stars | Polaris, Sirius, Betelgeuse, Vega, Arcturus |
| Deep sky | Andromeda, the Orion Nebula, the Pleiades, the Galactic Center, the Large Magellanic Cloud |
| Satellites | the ISS, Tiangong, Hubble, with their next visible pass |

Tap the ⓘ on any row (or on the found toast) for a short description, three facts and live numbers (distance, light travel time, height and speed for satellites). **Look Around** shows every target at once, named, as you sweep the phone across the sky: a horizon line with N/E/S/W, names that never overlap, and targets below the ground faded and dashed. Tap a name for its card.

The picker shows live status for each ("Up now", "Rises in 3h 12m", "Visible pass in 2h 14m · 63° high", "Never rises from here") and a "Best right now" row. Everything except the satellites works offline.

## How it works

Everything that is math is a pure function with tests; the app around it is glue. Deeper notes: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and the phase write-ups in [docs/phases/](docs/phases/).

**One world frame.** Everything lives in a local **ENU** frame: x = East, y = North, z = Up. Azimuth is measured clockwise from *true* north; altitude is up from the horizon. Screen angles are y-up.

**Phone orientation → camera direction.** The browser gives `DeviceOrientation` Euler angles (α, β, γ). The W3C definition of those angles is a rotation matrix `R = Rz(α)·Rx(β)·Ry(γ)`; the direction the back camera looks is `−z` of the device frame rotated by `R`. We check this against the W3C spec's own compass-heading formula for hundreds of random orientations. The result is a camera basis (right, up, forward) in ENU, smoothed with a quaternion low-pass.

**iOS compass, and why it only samples when flat.** Android reports an absolute heading. iOS reports a relative α plus `webkitCompassHeading`, which is only unambiguous when the phone is lying flat in portrait (it is then the heading of the top edge). So we sample it only then, estimate the offset between the gyro α and true heading, hold that offset while you lift the phone, and ask you to "hold flat for a second" at the start.

**Magnetic → true north.** Compasses point at magnetic north. We add the local declination from the **WMM2025** world magnetic model (the `geomagnetism` package) for your location.

**Sight alignment.** Phone magnetometers are often off by 5–30° (cases, magnets, cars). Tap the crosshair, center the *real* target, tap Lock: we store the yaw difference between where the phone says it points and where the target is, and apply it afterwards (it expires after 6 hours or 50 km).

**Projection and the edge hint.** A target direction `d` is projected with a pinhole camera: `x = W/2 + f·(d·right)/(d·forward)`, `y = H/2 − f·(d·up)/(d·forward)`, with `f = (H/2)/tan(vFOV/2)`. Because it is a real perspective projection, an off-screen target lands just outside the screen on the correct side, so it slides in naturally. If you search for 20 seconds, a glow appears on the nearest edge. With the camera on, the field of view is derived from the video's size and its cover-crop, with an adjustable per-device slider.

**Where the Moon and planets are.** [astronomy-engine](https://github.com/cosinekitty/astronomy) gives topocentric (as seen from your location, parallax included) equatorial coordinates, converted to horizontal with standard refraction. Phase and magnitude come from its illumination model.

**Where the stars and galaxies are.** Fixed objects are stored as J2000 RA/Dec. A rotation matrix from J2000 to the local horizon (`Rotation_EQJ_HOR`) for your time and place turns them into ENU directions. We check it against astronomy-engine's own star path to 0.01°, and that Polaris sits at an altitude equal to your latitude.

**Where the ISS is.** Public orbital elements (OMM JSON from CelesTrak) feed the SGP4 propagator ([satellite.js](https://github.com/shashwatak/satellite-js)); the TEME position is rotated to Earth-fixed, then to azimuth/elevation from you. "Sunlit?" is a cylindrical Earth-shadow test: the satellite is in shadow iff `r·ŝ < 0` and `|r − (r·ŝ)ŝ| < 6378 km`. A *pass* is found by sampling elevation every 20 s and bisecting each 10° crossing to 1 s; it is *visible* if at some moment the satellite is sunlit, above 10°, and the Sun is below −6°.

**Rise and set times.** One generic crossing search (sample, then bisect) serves every kind of target; only the step and horizon change (20 min and 0° for the sky, 20 s and 10° for satellites).

**Orienting galaxies and rings on screen.** Extended objects are drawn at their true angular size and rotated by their position angle, measured from *celestial north*. The on-screen direction of celestial north is the tangent at the target toward the north celestial pole, projected onto the screen axes (the same trick that points the Moon's lit side at the Sun).

## How it's tested

- **Oracle tests** compare against something independent: the W3C compass formula, a second library path (`DefineStar` vs the rotation matrix), published ranges for magnitudes and sizes, `SearchRiseSet` for rise/set times, and the **Vallado SGP4 verification vector** (catalog 00005, to 1e-3 km, through both the TLE and the OMM input paths).
- **Characterization pins** freeze behavior that must not change while the code underneath does: the Moon's numbers from v1, its exact canvas draw calls, and the Moon's line selection (replayed from 120 recorded cases).
- **Field tests**, one gate per phase. Phase 1 (iPhone, iOS 26): the drawn Moon matched the real Moon without alignment; upright compass heading agreed with the flat-calibrated heading to about 1°. Android and camera-mode FOV are the open ones.
- The `api/gp` function is tested with a mocked `fetch`, including "one 403 means no more requests".

## Privacy

Your location never leaves your device. The only network calls are public orbital elements, fetched through our own cached endpoint (and only when a satellite is selected), and anonymous usage counts through Vercel Web Analytics: which target, how long it took in coarse buckets, share method, sensor type. Never location, coordinates or user agent, and nothing under `?debug`.

## Run it

Node ≥ 22.12.

```bash
npm install
npm start                  # http://localhost:4200   (add ?debug for a live sensor readout)
npm run format:check && npm run lint && npx ng test --watch=false && npm run build
```

Phones need HTTPS for motion sensors, so test on a deployed preview (see below), or fake sensors in Chrome DevTools → Sensors.

**Deploy.** Push to GitHub and import the repo in [Vercel](https://vercel.com/new) (preset Angular; `vercel.json` already points at `dist/find-the-moon/browser`). `api/gp.ts` is picked up automatically as a Vercel Function. The package and output folder keep the old name `find-the-moon` so the Vercel setup does not break.

**Satellite data.** `ng serve` does not run Vercel functions, so locally the app uses the bundled snapshot `public/data/gp-fallback.json`. To try the real endpoint, run `npx vercel dev`. `npm run gp:refresh` rewrites the snapshot (a weekly GitHub Action does too). CelesTrak asks clients to fetch at most once per update; our function caches for 2 hours and never retries.

**Location.** GPS is used when allowed and never stored. If it is denied or unavailable, the app falls back to a place you chose before (remembered on this device, rounded to about 1 km), then to the reference point of your device's time zone (no prompt, no network), and only then asks for a city. A nearby city is close enough: the sky looks the same within about 100 km. The city list (`public/data/cities.json`, about 6,000 places) loads only when the picker opens; regenerate it with `node scripts/cities.mjs` and the time-zone table with `node scripts/tz-locations.mjs`.

**Share links.** `?target=<id>` opens straight into a target, e.g. `/?target=jupiter`; `?mode=look` opens Look Around.

## Credits

- [astronomy-engine](https://github.com/cosinekitty/astronomy) by Don Cross: ephemeris, rise/set, illumination.
- [satellite.js](https://github.com/shashwatak/satellite-js): SGP4 propagation.
- [geomagnetism](https://github.com/naturalatlas/geomagnetism) with the NOAA/BGS World Magnetic Model (WMM2025).
- [GeoNames](https://www.geonames.org) (CC BY 4.0) for the city list, and the IANA time zone database for the time-zone fallback.
- [CelesTrak](https://celestrak.org) for public orbital elements; please read their usage guidance on the site before building on it (they ask clients to download at most once per update).
- Angular, Vercel Web Analytics.

## More

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) is the design doc; [docs/phases/](docs/phases/) has the spec and the report for every phase. The original v1 plan is archived in [docs/archive/PLAN-v1.md](docs/archive/PLAN-v1.md).
