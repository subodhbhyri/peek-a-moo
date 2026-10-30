# Phase 9 report — Works from anywhere

Status: implemented; `npm run format && npm run lint && npx ng test --watch=false && npm run build` pass (format:check clean; the full suite passed on every run I made, two in a row at the end). **Nothing is committed**, and the Phase 8 work is also still uncommitted in the working tree (this phase did not touch it). Not checked on a device.

**Numbers:** tests 544 → **603** (57 files). Main bundle 122.40 → **129.66 KB** gzipped (limit 150 KB). The city list is **not** in the main bundle (checked: the built `main-*.js` contains none of its names; it is `dist/.../data/cities.json`, fetched when the picker opens).

## Data generation (the internet was reachable; nothing was invented)

- **Time zones:** `node scripts/tz-locations.mjs` reads the IANA tz database release **2026f** (`zone1970.tab` for coordinates, `backward` for alias links, from data.iana.org) and writes [timezone-locations.ts](../../src/app/core/data/timezone-locations.ts): **549 zones** (312 canonical plus their aliases; each alias takes its canonical zone's coordinates and label, so `Asia/Muscat` is "Dubai" and `Asia/Calcutta` is "Kolkata"). Alias chains are resolved. The script exits non-zero without writing if a download fails or fewer than 300 zones come out. The generated table adds about 7 KB gzipped to the main bundle.
- **Cities:** `node scripts/cities.mjs` downloads GeoNames `cities15000.zip` (parsed with a tiny built-in zip reader, no dependency), `countryInfo.txt` and `admin1CodesASCII.txt`, keeps population ≥ 100,000 **plus every national capital** (feature code `PPLC`), and writes `public/data/cities.json`.
  - **Count: 6,364 cities** (above the 4,000–5,000 you estimated; that is simply how many GeoNames has at ≥ 100,000 plus capitals).
  - **Size: 346,520 bytes raw, 120,289 bytes (117.5 KiB) gzipped**, right at your ~120 KB. To get there from 162 KB I dropped the capital flag, rounded the population to two significant digits (it only ranks results), and kept the first-level region name only where a name is ambiguous within its country. Coordinates are 4 decimals.
  - Country names are shortened the way people write them (USA, UK, UAE, Russia, DR Congo). A few tiny capitals have no population in GeoNames (Ngerulmud is 0); they are kept.
  - Capitals that are below GeoNames' 15,000-person cut-off (e.g. Valletta, Vatican City) are not in `cities15000` at all, so they are not in the file; the time-zone fallback and coordinates cover those users.

## Task 1 — time-zone fallback (no prompt, no network)

- `LocationService` now falls back when geolocation is denied, unavailable, times out, or does not exist: first a place the user chose before (Task 3), then `Intl.DateTimeFormat().resolvedOptions().timeZone` → its coordinates, with `source: 'timezone'` and a label ("Dubai"). `UTC`, `GMT`, `Etc/*`, unknown zones and an absent zone give no position, so only then is the user asked for a city. A fallback never overrides a position already set, and GPS (if it works) always wins.
- Status keeps meaning what geolocation did (`denied` / `unavailable`); new signals `source` (`gps` | `manual` | `timezone`) and `label`. `timeZoneArea()` and `useTimeZone()` back the picker's action.
- UI: a small chip at the bottom-left: "Using Dubai area (from your time zone) · Change" (opens the city picker), "Abu Dhabi, UAE · Change" for a chosen place, "Set location" only when there is no position at all, and nothing for GPS. Never a blocking screen: the app starts at once.
- Tests: `Asia/Dubai`, `Asia/Muscat` (alias → Dubai), `America/Denver`, `Asia/Kolkata` = `Asia/Calcutta`, `Etc/UTC` (and UTC, GMT, `Etc/GMT+5`, unknown, empty) → null; every entry has finite lat in [−90, 90] and lon in [−180, 180] and a label; ≥ 300 zones; 22 common zones all resolve. Service tests cover denied, timeout, unavailable and a missing API, aliases, no-position cases, GPS winning and never being stored, and not overriding an existing position.
- **Acceptance test:** `app.location.spec.ts` stubs geolocation as denied and `Intl` as `Asia/Dubai`, renders the whole `App`, and checks it starts with the Dubai-area location, the engine has a target, and the chip reads "Using Dubai area (from your time zone) · Change".

## Task 2 — a much larger city list, loaded lazily

- `CityService` fetches `/data/cities.json` **only when the city picker opens** (one fetch, no retries, 15 s timeout), swaps the index in, and otherwise keeps a built-in list of 34 capitals (Abu Dhabi included) as the offline fallback. `ngsw-config.json` gained a lazy `data` asset group for `/data/cities.json`.
- Search ([cities.ts](../../src/app/core/data/cities.ts)): case- and accent-insensitive, prefix match on name or ASCII name first, then substring, each tier ranked by population, top 30. "abu" and "dhabi" both find Abu Dhabi ("Abu Dhabi" puts it first); "bogota" finds Bogotá; "zurich" finds Zürich.
- GeoNames is credited (CC BY 4.0) in the README credits and in a small line at the bottom of the city picker, linking to geonames.org.

## Task 3 — no dead ends in the picker

- **No results:** "Can't find it? A nearby city works fine — the sky looks the same within about 100 km." with **Use my time zone (Dubai area)** (only when the zone resolved) and **Enter coordinates**. Two numeric fields (decimal degrees, `inputmode="decimal"`) with inline messages ("Latitude must be between -90 and 90.", "Longitude should be a number like 54.38."); pasting `25.2048, 55.2708` (comma, space, semicolon, tab or newline) into the latitude field fills both. The panel always says "A nearby city is close enough" and has a Close button, so it can never trap you.
- **Chip text:** "Abu Dhabi, UAE" for a city (with the region where the name is ambiguous), "25.20°, 55.27°" for coordinates.
- **Persistence:** `ptm.location` (try/catch), rounded to 2 decimals before storing. Only the picker's choice is saved (`chooseManual`); `setManual`, time-zone fallbacks and GPS fixes are never stored (tested). A saved choice is used when GPS is denied, so a returning visitor is not asked again. Choosing "Use my time zone" forgets a saved city. Corrupt or out-of-range saved data is ignored.

## Task 4 — copy audit

I searched every user-facing string (templates, component text, the formatter, personality lines, `index.html`, manifest, README) for "not available", "unavailable", "unsupported", "can't / couldn't", "denied", "never rises", "not up", "doesn't work", "only visible/available", and region/country wording. Each hit, and what I did:

| String | Where | Verdict |
|---|---|---|
| "Orbit data unavailable" / "Getting orbit data…" | app.html, formatter | About the network fetch of orbital data, not your location. Unchanged. |
| "Orbit data unavailable. Check your connection and try again." | intro note | Same. Unchanged. |
| "Motion access was denied. Reload the page and choose Allow when Safari asks…" | app.html | Device permission, not place. Unchanged. |
| "This device can't tell which way it's pointing — drag the sky instead." | app.html | Device limit (no motion sensors), keeps its wording as required. |
| "Couldn't access the camera." | app.ts | Device/permission. Unchanged. |
| "Couldn't align without a location." | align control | Only reachable with no position at all; with the fallbacks that is now just the "no zone and no city yet" case, and the chip is already offering to set one. Unchanged. |
| "Camera is off for the Sun." | Sun safety | Safety rule, not place. Unchanged. |
| "Never rises from here" / "… never rises from here." / "Not up in the next 2 days" / "… is below the horizon right now — it rises …" | availability labels and intro notes | These depend on where you are, but they describe the **sky** (the Large Magellanic Cloud really never clears the horizon from Abu Dhabi), not whether the app works; the picker still lets you pick the target and the intro does not block anything. Kept, deliberately: hiding them would be less honest. |
| "…; only visible from the southern hemisphere." | LMC blurb | **Changed** to "best seen from the southern hemisphere": the old wording was both too absolute (it is visible from the tropics and low northern latitudes, up to about 20°N) and read like "not for you". |
| "Set location" | location chip | Now shown only when there is genuinely no position (no GPS, no saved city, no usable time zone). |
| "Choose your city so the sky knows where to look. A nearby city is close enough." / "Can't find it? A nearby city works fine…" | city picker | New copy; says what is true. |
| Moon line "can't find me down there. try again later." | personality | In the Moon's voice for a below-horizon find; not about the user's place. Unchanged. |
| "Choose Allow", "Hold your phone flat…", "Still calibrating…", "Compass is unsteady…" | calibration | Device guidance, not place. Unchanged. |

No string says the app, a target or a feature is unavailable because of where someone is.

## Pins and scope

Providers, `availability.ts`, `satellite-passes.ts`, the satellite pipeline (`gp.service.ts`, `api/gp.ts`), the find flow and Look Around (`sky-engine.service.ts`, `sky-view.ts`, `draw-look.ts`, `label-layout.ts`): no changes in this phase. The Phase 2 characterization spec, the Phase 3 Moon pins and `find-lines.spec.ts` pass with no expected-value edits. Existing app specs set the location with `setManual`, which is unchanged in behaviour (not persisted), so none needed editing.

## Decisions and deviations

- The tz table is a TypeScript module in the main bundle (as specified), about 7 KB gzipped; it could be made lazy later if the bundle gets tight.
- `LocationService.status` keeps its geolocation meaning; where the position came from is the new `source` signal (the debug report now says `timezone` too).
- The picker's output changed from `pick: City` to `choose: { latitude, longitude, label }` (+ `useTimeZone`, `closed`), so cities and typed coordinates go through one path.
- I did not add an "Enter coordinates" link outside the no-results help (the spec puts it there).
- The cities file is 117.5 KiB gzipped, just under your ~120 KB; the entry count is higher than you estimated (6,364).

## Open questions

- Should the weekly GitHub Action also refresh `cities.json` and the tz table? They change rarely (tzdb a few times a year); I left them as manual scripts.
- Phase 8 is still uncommitted in this working tree; commit it (and this) when you are happy.

## Out of scope, noticed

- The service worker does not cache `gp-fallback.json` (only `cities.json` was added), so satellites on a cold offline start rely on the browser cache.
- The location chip sits at the bottom-left and could collide with other bottom overlays on very small screens; I only checked it by tests.
- Reverse geocoding or IP lookups were not added, as specified.

## Manual checks (for the human)

1. In a desktop browser, block location for the site and reload: the app should start with your time-zone area and a "Change" chip.
2. Open the city picker, search "abu dhabi": it's there. Pick it.
3. Search "zzzz": the no-results help appears, and **Enter coordinates** with `24.45, 54.38` works.
4. Ask your Abu Dhabi tester to open the link again. If the page itself doesn't load for them (not just the city search), that's a network-level problem with `vercel.app`, not this; tell me exactly what they see.
