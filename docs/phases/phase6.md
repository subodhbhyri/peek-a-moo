# Phase 6 — Satellites (ISS, Tiangong, Hubble)

> Read `docs/ARCHITECTURE.md` (§2, §5.7, §8) and `docs/phases/phase5-report.md` first.
> Adds the first targets that **move fast** and the first **network call**: public orbital elements from CelesTrak through our own cached Vercel function. Everything from Phases 2–5 must keep working offline exactly as today.

## Out of scope

More satellites than the three below, Starlink, notifications ("ISS overhead in 5 min"), personality voices (Phase 7).

---

## Task 0 — Dependency

`npm i satellite.js@^7.1.0` (ESM; exports `json2satrec`, `sgp4`, `propagate`, `gstime`, `eciToEcf`, `ecfToLookAngles`, `degreesToRadians`). Verified during planning: `json2satrec` with a minimal OMM record gives positions identical to `twoline2satrec` for the same element set. Report the bundle size change; keep the main bundle < 150 KB gzipped (lazy-load the satellite module if needed).

## Task 1 — Catalog entries

`category: 'satellites'`, `kind: 'satellite'`, `render: 'satellite'`:

| id | name | shortName | nameInSentence | noradId |
|---|---|---|---|---|
| iss | International Space Station | ISS | the ISS | 25544 |
| tiangong | Tiangong Space Station | Tiangong | Tiangong | 48274 |
| hubble | Hubble Space Telescope | Hubble | Hubble | 20580 |

Typical bright magnitudes for the visibility engine: ISS −3.5, Tiangong −1.5, Hubble +1.5 (use as `magnitude` when sunlit; `null` when in Earth's shadow). Factual blurbs (ISS: "Crew of ~7, 400 km up, one lap every 92 minutes.").

## Task 2 — Server: `api/gp.ts` (Vercel Function)

- Location: repo root `api/gp.ts` (Vercel picks it up regardless of framework). Use the Web-standard handler: `export async function GET(): Promise<Response>`. No dependencies beyond the runtime. Exclude `api/` from the Angular build / tsconfig.app if it interferes.
- **Ignores all client input.** Fetches a hard-coded whitelist only: `[25544, 48274, 20580]`, one request each:
  `https://celestrak.org/NORAD/elements/gp.php?CATNR=<id>&FORMAT=JSON`
  (CelesTrak's default format is now CSV; always pass `FORMAT=JSON`.)
- Send `User-Agent: peek-a-moo (+https://github.com/subodhbhyri/peek-a-moo)`.
- Response: `{ fetchedAt: ISO, elements: OmmRecord[] }` — keep only the OMM fields `json2satrec` needs (OBJECT_NAME, OBJECT_ID, EPOCH, MEAN_MOTION, ECCENTRICITY, INCLINATION, RA_OF_ASC_NODE, ARG_OF_PERICENTER, MEAN_ANOMALY, NORAD_CAT_ID, REV_AT_EPOCH, BSTAR, MEAN_MOTION_DOT, MEAN_MOTION_DDOT, plus EPHEMERIS_TYPE/CLASSIFICATION_TYPE/ELEMENT_SET_NO if present). CelesTrak omits blank or redundant OMM fields; don't require them.
- Success: `Cache-Control: public, s-maxage=7200, stale-while-revalidate=86400` (CelesTrak updates GP every 2 h and asks clients to download at most once per update; the CDN cache makes this at most ~once per 2 h per region).
- **Any non-200 from CelesTrak, or a timeout (8 s): don't retry.** Return HTTP 502 `{ error }` with `Cache-Control: public, s-maxage=600` so a CelesTrak outage isn't hammered. Never loop.
- Unit-test the handler with a mocked `fetch`: success shape and headers; one upstream 403 → 502 with no further fetches attempted; exactly 3 upstream calls on success.

## Task 3 — Client data: `GpService` + fallback

- `public/data/gp-fallback.json` in the same shape, plus `scripts/gp-refresh.mjs` and `npm run gp:refresh` that writes it from CelesTrak (same whitelist, same rules, exits non-zero on any non-200). Run it once and commit the file (if your environment can't reach CelesTrak, commit a clearly-labeled placeholder and say so — the human will run the script).
- `GpService.get()`: order of preference → in-memory → localStorage (`ptm.gp`, try/catch, ≤ 2 h old) → `fetch('/api/gp')` (5 s timeout) → fallback file. Keep the newest good copy in localStorage. Only fetch when a satellite target is selected or the picker's satellites section is rendered — never at app start.
- `ng serve` doesn't run Vercel functions: in dev it naturally falls through to the fallback file. Document `npx vercel dev` for testing the real endpoint.
- Service worker (`ngsw-config.json`): add a `dataGroups` entry for `/api/gp` with `strategy: "freshness"`, `maxAge: "2h"`, `timeout: "5s"`.
- Element age: `ageDays = (now − EPOCH)`. 3–14 days → state flag `approximate`; > 14 days → `stale` (still draw it, but label it, see Task 6).

## Task 4 — Satellite provider (`core/targets/providers/satellite.ts`)

- `json2satrec(omm)` once per element set (cache by NORAD id + EPOCH).
- Position at `date`: `propagate` → `eciToEcf(pos, gstime(date))` → `ecfToLookAngles(observerGd, ecf)` with observer lat/lon in radians and height in **km**. Azimuth/elevation → ENU `direction` via `directionFromAzAlt`. Add refraction for consistency with other targets (astronomy-engine `Refraction('normal', alt)`), so a satellite and a star at the same spot agree.
- **Sunlit test** (cylindrical Earth shadow, good enough here): with ECI satellite position `r` (km) and unit Sun direction `ŝ` (astronomy-engine `GeoVector(Body.Sun, date, true)` normalized; the frame difference vs TEME is < 0.5°, fine for this), the satellite is in shadow iff `r·ŝ < 0` and `|r − (r·ŝ)ŝ| < 6378`.
- `TargetState.satellite = { sunlit, rangeKm, ageDays, approximate, stale, trail: Vec3[] }` where `trail` = directions at t−1 s … t−12 s (12 points). `magnitude` = catalog value when sunlit, else `null`.
- SGP4 error codes (decayed, bad elements) → throw a typed error; the engine shows "Orbit data unavailable" instead of crashing.
- Per-frame recompute: cadence 0 (already in `cadence.ts`). Implement it in the engine now (Phase 2 left it unexercised). Keep the trail computation cheap: reuse the satrec, no allocations beyond the 12 vectors.

**Tests (independent oracles):**
- Vallado SGP4 verification vector (catalog 00005), via `twoline2satrec` and via an equivalent OMM record through `json2satrec`:
  ```
  1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753
  2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667
  ```
  TEME position at t=0 min: (7022.46529266, −1400.08296755, 0.03995155) km; at 360 min: (−7154.03120202, −3783.17682504, −3536.19412294) km; within 1e-3 km. (Reproduced during planning.) Both input paths agree within 1 m at 720 min.
- Look angles: a satellite placed directly overhead (ECF = observer ECF + 400 km along the local up) → elevation ≈ 90°. One 400 km due north at the same altitude → azimuth ≈ 0°, elevation small positive. (Construct the ECF vectors with `geodeticToEcf`.)
- Shadow model: satellite on the Sun side → sunlit; directly behind Earth (r = −7000 ŝ) → shadow; behind but offset 7000 km sideways → sunlit.
- Provider never returns NaN for a valid record at ±3 days from epoch.

## Task 5 — Passes and availability

Reuse Phase 5's generic crossing scan with satellite settings: horizon **10°** (passes below that are hard to see), step **20 s**, window **24 h**, bisect to 1 s. A pass = rise → max elevation → set. Classify each pass as **visible** iff, at some point during it, the satellite is sunlit, above 10°, and the Sun is below −6° at the observer.

Availability for satellites adds `nextVisiblePass: { start, maxElevationDeg, end } | null` and `currentPass` (if overhead now). Labels (extend the Phase 5 formatter):

| Situation | Label | Tone |
|---|---|---|
| Overhead now and visible | "Overhead now — look fast" | good |
| Overhead now, not visible (daylight or shadow) | "Overhead now, but not visible" | meh |
| Next visible pass < 12 h | "Visible pass in 2h 14m · 63° high" | meh |
| Later visible pass | "Visible pass tomorrow 6:12 AM" | off |
| No visible pass in 24 h | "No visible passes today" | off |
| Data stale | append " · orbit data is N days old" | (downgrade one step) |

Satellites never appear in "Best right now" unless "Overhead now — look fast". Measure the 3-satellite pass scan time and report it (expect tens of ms).

Tests: pass detection on a synthetic altitude function (known rise/max/set); visibility classification combinations; formatter rows (en-US, America/Denver).

## Task 6 — Rendering and UX

- `core/render/draw-satellite.ts`: bright dot (sunlit) or dim hollow dot (in shadow), a fading trail through the projected `trail` points, and a small arrow showing direction of travel. Name label next to it ("ISS"). No size exaggeration beyond a fixed ~6 px core.
- Off-screen: the existing edge glow works as-is; while a satellite is above the horizon, make the glow appear immediately (no 20 s wait) because it moves.
- Found: line per satellite ("That's the ISS. Seven people up there, waving.") and toast "Found the ISS in X.Xs". If in shadow: "It's in Earth's shadow right now — invisible, but right there."
- Picker: new "Satellites" section after Deep sky, with the labels from Task 5. The first time the section renders, it triggers `GpService.get()`; rows show skeletons until data arrives; on total failure (no network, no cache, no fallback), rows say "Orbit data unavailable".
- Intro for a satellite: "Find the ISS." + the pass label. If no visible pass, add "You can still find where it is right now — even in daylight."
- Alignment stays available but disabled for satellites (they move too fast to align against); hide the button.
- Debug readout: NORAD id, element age, sunlit, range km.

## Acceptance criteria

- [ ] All earlier pins pass unchanged (Phase 2 characterization, Phase 3 Moon draw calls). Non-satellite behavior unchanged, and the app works fully offline for non-satellite targets.
- [ ] New tests for Tasks 2–5 pass, including the Vallado vector. Report the new total.
- [ ] No network request at app start (verify in a test that `GpService.get` isn't called until a satellite target or the satellites section is used).
- [ ] `npm run format && npm run lint && npx ng test --watch=false && npm run build` pass; main bundle < 150 KB gzipped (note any lazy chunk size).
- [ ] `docs/phases/phase6-report.md` per ARCHITECTURE §8 with the manual steps below, plus: whether `gp-fallback.json` is real data or a placeholder.

## Manual check (for the human)

1. If the fallback file is a placeholder, run `npm run gp:refresh` and commit `public/data/gp-fallback.json`.
2. Deploy. Open `https://<your-domain>/api/gp` in a browser: JSON with 3 elements and a recent `fetchedAt`. Reload: response headers show it's served from cache (`x-vercel-cache: HIT` after the first load).
3. Open the picker → Satellites. Compare the ISS "next visible pass" with NASA's Spot the Station or Heavens-Above for your location: start time within ~1 min, max elevation within a few degrees.
4. During that pass, select the ISS and track it. Does the dot stay on the real ISS as it crosses? Copy a debug report mid-pass.
5. At any time (even daytime), select the ISS and find it: the dot should land where trackers say it is, with the "not visible" note if it's in daylight or shadow.
