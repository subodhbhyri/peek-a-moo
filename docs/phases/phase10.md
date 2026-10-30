# Phase 10 — Constellations, background stars, red night mode

> Read `docs/ARCHITECTURE.md` (§2, §5, §8) and `docs/phases/phase9-report.md` first.
> Adds about 1,600 real background stars and the 88 IAU constellations (stick figures + names) to Look Around, makes every constellation a findable target, and adds a red night-vision mode.
> Existing providers, availability, satellites, the find flow for existing targets, and Phase 9 location must not change. All pins pass with no expected-value edits.

## Out of scope

Star hopping guides, constellation boundaries, Milky Way band, non-Western sky cultures, star names beyond the existing targets, time slider. (Candidates for later phases.)

---

## Task 1 — Data from d3-celestial (BSD-3-Clause)

Verified during planning: `d3-celestial@0.7.35` on npm is BSD-3-Clause and ships, in `data/`:
- `stars.6.json` — GeoJSON points, `id` = Hipparcos number, `properties.mag`, `properties.bv`, `geometry.coordinates = [lon, lat]` where **lat = Dec (deg)** and **lon = RA in degrees wrapped to [−180, 180]**: `raDeg = lon < 0 ? lon + 360 : lon`. Spot-checked: Betelgeuse (HIP 27989) 88.7929 / 7.4071, Arcturus (HIP 69673) lon −146.0847 → RA 213.9153. 1,627 stars have mag ≤ 5.0.
- `constellations.lines.json` — 89 `MultiLineString` features (893 vertices, J2000 [lon, lat] same convention). **Serpens appears twice with id `Ser`** (Caput and Cauda).
- `constellations.json` — 89 features with `id` (IAU abbreviation), `properties.name` (Latin, e.g. "Ursa Major", "Serpens Caput"), `en`, `rank` (1 = most prominent, 22 of them; 2 = 24; 3 = 43), and a label position in `geometry`.

Steps:
- Add `d3-celestial` as an **exact-pinned devDependency** (`0.7.35`). It's only read at build time; nothing from it is imported into the app.
- `scripts/sky-data.mjs` → `public/data/sky.json`:
  ```ts
  {
    version: 1,
    source: 'd3-celestial 0.7.35 (BSD-3-Clause), Hipparcos-based',
    stars: [raDeg, decDeg, mag, bv][],                 // mag <= 5.0, rounded: ra/dec 4 dp, mag 2 dp, bv 2 dp (null if missing)
    constellations: {
      id: string;            // URL-safe slug of the Latin name: 'orion', 'ursa-major', 'serpens'
      iau: string;           // 'Ori'
      name: string;          // Latin: 'Orion'
      english: string;       // see below
      rank: 1 | 2 | 3;
      lines: [raDeg, decDeg][][];   // polylines; Serpens = both halves merged into one entry
      label: [raDeg, decDeg];
    }[]
  }
  ```
- English names: start from `en`, but it's not always the meaning of the name (UMa's is "Big Dipper", an asterism). Use the standard English meaning ("Great Bear", "Little Bear", "Hunter" for Orion, etc.). List every name you changed in the report.
- Copy d3-celestial's LICENSE to `public/data/LICENSE-d3-celestial.txt` (BSD-3 requires keeping the notice), and credit it in the README and in the picker's credits line.
- Report the generated file's raw and gzipped size (target < 40 KB gzipped). Commit the output.

## Task 2 — Sky data service (lazy)

`core/sky/sky-data.service.ts`: fetches `/data/sky.json` **only** when Look Around starts or a constellation target is selected (service worker: lazy asset). Never in the main bundle; never at app start (test it, like the Phase 6 GpService test). On failure, Look Around works as before without background stars or constellations, and constellation targets show "Star map unavailable".

Precompute once after load: J2000 unit vectors in the EQJ frame for every star and every line vertex (`VectorFromSphere`, as in the fixed-sky provider).

## Task 3 — Fast horizon transform

`core/sky/sky-transform.ts`:
- Once per second (or when location changes), get `Rotation_EQJ_HOR(time, observer)`, rotate all star and vertex vectors, convert astronomy-engine's horizontal vector to our ENU, and apply refraction to the altitude (astronomy-engine `Refraction('normal', alt)`), matching the fixed-sky provider.
- Derive the HOR → ENU axis mapping **from a test**, not intuition: for every catalog fixed-sky target that is also in the star list (Polaris, Sirius, Betelgeuse, Vega, Arcturus), the transformed direction must match the Phase 4 fixed-sky provider within 0.02° at 3 dates.
- Per frame: only projection (dot products with the camera basis); no allocations proportional to star count beyond reusable typed arrays (`Float32Array`/`Float64Array`).
- Measure: transform time for all stars + vertices, and per-frame projection time. Report both.

## Task 4 — Look Around: stars and constellations

Draw order: horizon/cardinals → constellation lines → background stars → existing target markers → labels.

- **Background stars:** dot radius and alpha from magnitude (reuse the Phase 4 star brightness curve, smaller scale), color from B−V (reuse the Phase 4 table). Below-horizon stars at 25% alpha. No labels for background stars.
- **Constellation lines:** thin (1 px CSS), low alpha (~0.25), drawn only for segments with both ends in front of the camera. Below-horizon segments at half that alpha, dashed.
- **Constellation names:** at the label point, letter-spaced small caps style, dimmer than target labels. They go into the Phase 8 label layout as **lower priority** than all targets (targets first, then constellations by rank 1 → 3). Hidden when they'd overlap.
- A toggle in Look Around (small chip, `aria-pressed`): **Constellations on/off**, persisted. Background stars always on.
- Accessibility: the Phase 8 visually hidden live region also lists constellation names currently on screen.
- Performance target: Look Around stays smooth on a phone; no long tasks > 16 ms caused by this work. Report the per-frame numbers from Task 3.

## Task 5 — Constellations as targets

- New `TargetKind` `'constellation'`, category `'constellations'`, render `'constellation'`. Generate catalog entries from `sky.json` at load time (88 entries; ids are the slugs; ids must be unique across the whole catalog — test it).
- Provider: direction = normalized mean of all its line-vertex unit vectors (J2000), transformed like fixed-sky targets; `angularSizeDeg` = 2 × the largest angle from that center to any vertex; magnitude `null`.
- Find mode drawing: the target's own figure bright (lines alpha ~0.8, its stars brighter), its name; plus faint background stars for context. Edge glow and size-aware threshold work as for other targets.
- Availability: use the existing scan on the center direction. Add a label for the partly-up case: if the center is below the horizon but at least one vertex is above, "Partly up" (tone meh). Document this in the report.
- Picker: new **Constellations** section after Satellites, sorted rank 1 first then alphabetical. Collapsed to the 22 rank-1 constellations with a "Show all 88" toggle; search always covers all 88 (Latin and English names, e.g. "great bear" finds Ursa Major). Constellations never appear in "Best right now".
- Info card: type "Constellation". Description: "{Latin} — the {English}. One of the 88 constellations recognized by the International Astronomical Union." Rank-1 constellations get exactly 3 confident, stable facts (same fact rules as Phase 8); others have no facts list. Update the Phase 8 info tests to allow 0 facts **only** for constellations of rank 2–3. Live stats: "Up from here" / "Partly up" / "Below the horizon".
- Found moment: no face. Rank-1 constellations get one short line each in the plain voice; others use "Found {Latin}." Toast "Found {Latin} in X.Xs".

## Task 6 — Red night mode

Keeps your eyes adjusted to the dark.

- Toggle button next to the camera toggle (eye icon, `aria-label="Red night mode"`, `aria-pressed`), keyboard `n`, persisted (`ptm.night`).
- Implementation: a full-viewport overlay above all UI, `pointer-events: none`, `background: #ff0000; mix-blend-mode: multiply`, plus an overall dim (target perceived brightness about 60%). This keeps only the red channel for canvas, DOM, info cards and the camera feed. If you find a cheaper or more reliable approach in testing, use it and explain why.
- Set `<meta name="theme-color">` to `#000000` while on (it already is; make sure nothing overrides it).
- The Sun safety banner must stay clearly readable in night mode.
- Test: toggle state persists; overlay present and non-interactive (clicks pass through to the picker chip).

## Task 7 — Analytics

| Event | Properties |
|---|---|
| `night_mode_toggled` | `on`: boolean |
| `constellations_toggled` | `on`: boolean |

Constellation finds reuse `target_selected` / `target_found` with the constellation id. Exact-property tests as before.

## Acceptance criteria

- [ ] `sky.json` generated from d3-celestial 0.7.35, license copied and credited, sizes reported.
- [ ] Not fetched at app start; not in the main bundle.
- [ ] Transform matches the fixed-sky provider for the 5 overlap stars within 0.02°.
- [ ] Pins pass with no expected-value edits; existing providers and find flow unchanged.
- [ ] New tests for Tasks 2–7 pass; report the new total and the timing numbers.
- [ ] `npm run format && npm run lint && npx ng test --watch=false && npm run build` pass; main bundle < 150 KB gzipped.
- [ ] `docs/phases/phase10-report.md` per ARCHITECTURE §8 with the manual checks below.

## Manual checks (for the human)

1. Look Around at night: the background stars and stick figures line up with the real sky. Easy ones in late autumn evenings: Cassiopeia's "W" (northeast), the Great Square of Pegasus (high south), and later Orion rising in the east.
2. Sweeping feels smooth on your phone, with constellations on.
3. Picker → Constellations → "Orion" → find it. Search "great bear" finds Ursa Major.
4. Turn on red night mode outside for a few minutes: everything is red and dim, and you can still read the picker, info cards and Sun banner.
5. Toggle constellations off and on in Look Around.
