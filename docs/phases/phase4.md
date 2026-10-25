# Phase 4 — Stars and deep sky

> Read `docs/ARCHITECTURE.md` (§2, §5, §8) and `docs/phases/phase3-report.md` first.
> Adds 10 fixed-sky targets: 5 bright stars and 5 deep-sky objects. Still chosen with `?target=<id>` or the debug selector; the picker is Phase 5. The Moon and planets must not change.

## Out of scope

Picker / availability labels / intro rewrite (Phase 5), satellites (Phase 6), personality voices (Phase 7).

---

## Task 0 — Type cleanup from Phase 3

Replace the `phase.name: string` + casts with proper types: e.g. `phase?: MoonPhaseInfo | PlanetPhaseInfo` as a discriminated union (`kind: 'moon' | 'planet'`), or separate fields. No casts remain at the Moon call sites. Pure type change: Phase 2 characterization and Phase 3 draw-call pins must stay green with no expected-value edits.

## Task 1 — Catalog entries

Coordinates are **J2000** (ICRS). RA in decimal hours, Dec in decimal degrees. Values below were cross-checked during planning; copy them exactly.

**Stars** (`kind: 'fixed'`, `category: 'stars'`, `render: 'star'`):

| id | name | raHours | decDeg | mag | B−V |
|---|---|---|---|---|---|
| polaris | Polaris | 2.530303 | 89.264109 | 1.98 | 0.60 |
| sirius | Sirius | 6.752478 | −16.716116 | −1.46 | 0.00 |
| betelgeuse | Betelgeuse | 5.919529 | 7.407064 | 0.42 | 1.85 |
| vega | Vega | 18.615649 | 38.783689 | 0.03 | 0.00 |
| arcturus | Arcturus | 14.261020 | 19.182409 | −0.05 | 1.23 |

**Deep sky** (`kind: 'fixed'`, `category: 'deep-sky'`, `render: 'extended'`):

| id | name | raHours | decDeg | mag | size (deg, major × minor) | PA (deg) | style |
|---|---|---|---|---|---|---|---|
| m31 | Andromeda Galaxy | 0.712306 | 41.269167 | 3.44 | 3.17 × 1.00 | 35 | galaxy |
| m42 | Orion Nebula | 5.588139 | −5.391111 | 4.0 | 1.42 × 1.00 | 0 | nebula |
| m45 | Pleiades | 3.790000 | 24.116667 | 1.6 | 1.83 × 1.83 | 0 | cluster |
| galactic-center | Galactic Center | 17.761122 | −29.007811 | null | 2.0 × 2.0 | 0 | marker |
| lmc | Large Magellanic Cloud | 5.392917 | −69.756111 | 0.9 | 10.75 × 9.17 | 170 | galaxy |

Add `fixed.style` and `fixed.bv` to the def type. Each target gets a factual one-line blurb; the Galactic Center's blurb must say it's hidden behind dust and not visible to the eye ("you're pointing at the center of the Milky Way, ~26,000 light-years away"). Ignore proper motion (Arcturus moves ~1′ since 2000 — negligible).

## Task 2 — Fixed-sky provider

`core/targets/providers/fixed-sky.ts`, using astronomy-engine:

```ts
const t = MakeTime(date);
const v = VectorFromSphere(new Spherical(decDeg, raHours * 15, 1), t);
const hor = HorizonFromVector(RotateVector(Rotation_EQJ_HOR(t, observer), v), 'normal');
// hor.lat = altitude, hor.lon = azimuth
```

Return `TargetState` with `magnitude` from the catalog, `angularSizeDeg` = major axis (stars: 0), and `skyNorthDirection` = NCP from Phase 3's `northCelestialPole(latitude)`. Cache the rotation matrix per (time rounded to 1 s, observer) so 20+ targets per picker refresh stay cheap. Register for kind `fixed` in `compute.ts`.

**Tests (independent oracles):**
- Second library path: for every fixed target at 3 dates, `DefineStar(Body.Star1, ra, dec, 1000)` → `Equator(Star1, date, observer, true, true)` → `Horizon(..., 'normal')` agrees with the provider within 0.05° alt and az (planning run: max 0.014°).
- Polaris: at lat 39.6 over any 48 h, altitude stays within 1.0° of the latitude. At lat −30, it's always below the horizon.
- Upper culmination: Vega's maximum altitude over 48 h at lat 39.6 (10-min sampling) = `90 − |lat − dec|` within 0.3° (planning run: 89.17 vs 89.18).
- LMC at lat 39.6 never exceeds 0° over 48 h. (Note: astronomy-engine's refraction adds ~0.5° even below the horizon, so don't assert the exact negative value.)
- Az/alt of M31 at lat 39.6, 2026-10-25T09:54Z ≈ alt 40.7°, az 294.9° (within 0.1°) — a planning-time reference value, not a self-snapshot.

## Task 3 — Renderers

`core/render/draw-star.ts`:
- Point + soft glow. Core radius and glow scale with brightness: `brightness = clamp(10^(−0.4·(mag − 1)), 0.15, 4)`; core `≈ 2.5 + 2·sqrt(brightness)` px (CSS px), glow ≈ 6× core with low alpha.
- Color from B−V via a small piecewise lerp table (B−V −0.3 → #9bb0ff, 0.0 → #cad7ff, 0.6 → #fff4ea, 1.2 → #ffd2a1, 1.85 → #ffb36b). Subtle twinkle (±8% alpha, ~1.5 Hz) unless `prefers-reduced-motion`.

`core/render/draw-extended.ts` (procedural only, no images):
- Ellipse at **true angular size** (convert degrees → px with the current focal length), rotated by `positionAngleToScreen(skyNorthScreenAngle(...), pa)` from Phase 3. Minimum displayed major axis = the planet minimum (3.5% of the short side).
- `galaxy`: radial-gradient ellipse, bright compact core, faint wide halo, alpha ≈ 0.35 max.
- `nebula`: 3–5 overlapping soft blobs (seeded by target id so they don't change frame to frame), faint pink/teal.
- `cluster`: 7–10 seeded small blue-white dots inside the ellipse plus a faint haze (Pleiades should read as "a little clump of stars").
- `marker`: dashed circle + small crosshair + label "Galactic Center (hidden behind dust)". No glow.
- If the true size is larger than the screen (LMC in a narrow FOV), clamp alpha so the screen doesn't wash out.

Write a test that the on-screen major-axis direction for M31 matches `positionAngleToScreen` for at least two phone rolls (draw-call or pure geometry check — your call).

## Task 4 — Size-aware find threshold (closes the Phase 2 TODO)

In `display.ts`: `centeredThreshold(radiusPx, viewport) = max(0.35, min(0.8, 0.8 · radiusPx / (min(w, h)/2)))`. For the Moon and planets this must still return exactly 0.35 at their current sizes — assert it in a test so Phase 2 characterization stays unchanged. Large objects (M31, LMC) get a looser threshold so you don't need to pinpoint their center. Stars use 0.35.

## Task 5 — Found moment and labels

- No face for stars/deep sky. One factual line per target from a small table (Polaris: "Polaris. The sky turns around me." Galactic Center: "You can't see it — but 4 million suns' worth of black hole is right there.").
- Toast: "Found {name} in X.Xs".
- When a target is found and its magnitude is null or > 6 (Galactic Center today), show an extra line under the toast: "Not visible to the eye — it's there, behind dust." (generic, reused by Phase 5 availability).
- Debug selector already lists the catalog; add the new entries' magnitude/size to the debug readout.

## Acceptance criteria

- [ ] Phase 2 characterization and Phase 3 Moon draw-call pins pass with no expected-value edits.
- [ ] New tests for Tasks 2–4 pass; report the new total.
- [ ] On a laptop in drag mode: `?target=polaris` sits ~your latitude above due north; M31 draws as a tilted ellipse that rotates correctly when you roll (debug roll); Pleiades read as a clump; Galactic Center shows the marker.
- [ ] `npm run format && npm run lint && npx ng test --watch=false && npm run build` pass; bundle < 150 KB gzipped.
- [ ] `docs/phases/phase4-report.md` per ARCHITECTURE §8 with the manual steps below.

## Manual field test (for the human)

1. Outside after dark, `?target=polaris`. Find it, then look: it's the lone medium-bright star roughly above due north at the height of your latitude (~40° in Colorado). Copy a report.
2. Late October evening/night: try `?target=m45` (Pleiades, east in the evening, high after midnight) and `?target=m31` (high in the east/northeast in the evening). The Pleiades are an obvious little clump; Andromeda is a faint smudge under dark skies — in a city, just check the overlay lands in the right patch near the "W" of Cassiopeia.
3. Pre-dawn or late night: `?target=sirius` / `?target=betelgeuse` (Orion rises late evening in October).
4. `?target=lmc`: from the US it should say it's below the horizon / never come on screen. Note what happens (Phase 5 adds proper labels).
