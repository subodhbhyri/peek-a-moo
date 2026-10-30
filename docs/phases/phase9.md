# Phase 9 — Works from anywhere

> Read `docs/ARCHITECTURE.md` and `docs/phases/phase8-report.md` first.
> A tester in Abu Dhabi got stuck: the manual city picker has only ~107 cities and Abu Dhabi isn't one of them. The astronomy works for any latitude/longitude on Earth; only the **location fallback** (used when GPS is denied or unavailable) is limited. This phase makes sure nobody, anywhere, ever hits a dead end.
> Providers, availability, the satellite pipeline, find flow and Look Around must not change.

## Why a nearby city is enough

1° of latitude is about 111 km. Moving the observer by 100 km shifts where things appear in the sky by about 1° or less, smaller than the find threshold. So "the nearest big city" or "the center of your time zone" is plenty accurate for this app. Say so in the UI copy where it helps ("A nearby city is close enough").

## Out of scope

Reverse geocoding, IP geolocation services, any new network call, UI redesign.

---

## Task 1 — Time-zone fallback location (no prompt, no network)

- Generate `src/app/core/data/timezone-locations.ts` from the IANA tz database's `zone1970.tab` (each zone has reference coordinates, e.g. `Asia/Dubai`). Write `scripts/tz-locations.mjs` that downloads/reads it and emits `{ [zone: string]: { lat, lon, label } }`, where `label` is the zone's city part (`"Dubai"`). Also map common **backward-link aliases** to their canonical zone (e.g. `Asia/Calcutta` → `Asia/Kolkata`, `Asia/Muscat` → `Asia/Dubai`); the `backward` file in tzdb lists them. Commit the generated file. If the script can't reach the internet, say so and ask the human to run it.
- `LocationService`: when geolocation is denied, unavailable or times out, fall back to `Intl.DateTimeFormat().resolvedOptions().timeZone` → its coordinates, with `source: 'timezone'`. Only if the zone is unknown (or `UTC`/`Etc/*`) does the app show the city picker with no location set.
- UI: a small chip "Using Dubai area (from your time zone) · Change", which opens the city picker. Never a blocking screen.
- Tests: `Asia/Dubai`, `Asia/Muscat` (alias), `America/Denver`, `Asia/Kolkata` and `Asia/Calcutta`, `Etc/UTC` → null; every entry has finite lat in [−90, 90] and lon in [−180, 180]; the generated file has at least 300 zones.

## Task 2 — A much larger city list, loaded lazily

- Replace the 107-city list with a generated dataset from GeoNames `cities15000` (CC BY 4.0): keep cities with population ≥ 100,000 **plus** every national capital (`feature_code` `PPLC`) regardless of population. Fields: `name`, ASCII name, country name, admin1 name if cheap to include, `lat`, `lon` (4 decimals), population (for ranking). Generate with `scripts/cities.mjs` into `public/data/cities.json`; commit the output. Expect roughly 4,000–5,000 entries; report the count and gzipped size (keep it under ~120 KB gzipped).
- Load it **only when the city picker opens** (fetch from `/data/cities.json`, cached by the service worker as a lazy asset). Not in the main bundle. Keep a tiny built-in list of ~30 capitals as the offline fallback if the fetch fails.
- Search: case- and accent-insensitive prefix match on name and ASCII name, then substring; rank by population; show the top 30. "abu" must find Abu Dhabi; "dhabi" must find it too.
- Credit GeoNames (CC BY 4.0) in the README credits and in a small line at the bottom of the city picker.

## Task 3 — No dead ends in the picker

- **No results:** show "Can't find it? A nearby city works fine — the sky looks the same within about 100 km." plus two actions: **Use my time zone (Dubai area)** (when Task 1 resolved a zone) and **Enter coordinates** (two numeric fields, validated ranges, accepts decimal degrees; also accepts a pasted `25.2048, 55.2708`).
- Selected location shows as "Abu Dhabi, UAE" (or "25.20°, 55.27°" for coordinates) in the chip.
- Persist the manual choice in localStorage (`ptm.location`, try/catch) so returning visitors aren't asked again. Rounded to 2 decimals before storing. GPS fixes are still never stored.

## Task 4 — Copy audit

Search all user-facing strings for anything that reads like "not available", "unsupported" or "can't be used here", and make sure none of them can show because of **where** someone is. Device limits (no motion sensors → drag mode) keep their existing wording. List every string you checked in the report.

## Acceptance criteria

- [ ] With geolocation denied and the time zone set to `Asia/Dubai`, the app starts immediately with the Dubai-area location, and the chip lets you change it. (Component test with a stubbed `Intl` / geolocation.)
- [ ] City search finds Abu Dhabi by "abu" and "dhabi"; the cities file is not in the main bundle.
- [ ] Pins pass with no expected-value edits; providers and find flow unchanged.
- [ ] `npm run format && npm run lint && npx ng test --watch=false && npm run build` pass; main bundle < 150 KB gzipped.
- [ ] `docs/phases/phase9-report.md` per ARCHITECTURE §8, including the city count, file size and the copy audit list.

## Manual checks (for the human)

1. In a desktop browser, block location for the site and reload: the app should start with your time-zone area and a "Change" chip.
2. Open the city picker, search "abu dhabi": it's there. Pick it.
3. Search "zzzz": the no-results help appears, and **Enter coordinates** with `24.45, 54.38` works.
4. Ask your Abu Dhabi tester to open the link again. If the page itself doesn't load for them (not just the city search), that's a network-level problem with `vercel.app`, not this; tell me exactly what they see.
