// Writes public/data/gp-fallback.json from CelesTrak: the offline snapshot GpService falls back to.
// Same rules as api/gp.ts: fixed whitelist, FORMAT=JSON, one request each, no retries, and a non-zero
// exit (writing nothing) on any non-200, timeout or odd answer. Run it with `npm run gp:refresh`.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Keep in sync with api/gp.ts.
const WHITELIST = [25544, 48274, 20580];
const OMM_FIELDS = [
  'OBJECT_NAME',
  'OBJECT_ID',
  'EPOCH',
  'MEAN_MOTION',
  'ECCENTRICITY',
  'INCLINATION',
  'RA_OF_ASC_NODE',
  'ARG_OF_PERICENTER',
  'MEAN_ANOMALY',
  'NORAD_CAT_ID',
  'REV_AT_EPOCH',
  'BSTAR',
  'MEAN_MOTION_DOT',
  'MEAN_MOTION_DDOT',
  'EPHEMERIS_TYPE',
  'CLASSIFICATION_TYPE',
  'ELEMENT_SET_NO',
];
const USER_AGENT = 'peek-a-moo (+https://github.com/subodhbhyri/peek-a-moo)';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../public/data/gp-fallback.json');
const elements = [];

for (const id of WHITELIST) {
  let res;
  try {
    res = await fetch(`https://celestrak.org/NORAD/elements/gp.php?CATNR=${id}&FORMAT=JSON`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    console.error(`gp:refresh: no answer for ${id}: ${e}`);
    process.exit(1);
  }
  if (res.status !== 200) {
    console.error(`gp:refresh: CelesTrak answered ${res.status} for ${id}; stopping.`);
    process.exit(1);
  }
  let body;
  try {
    body = await res.json();
  } catch {
    console.error(`gp:refresh: CelesTrak sent something other than JSON for ${id}; stopping.`);
    process.exit(1);
  }
  const raw = Array.isArray(body) ? body[0] : null;
  if (!raw || Number(raw.NORAD_CAT_ID) !== id || typeof raw.EPOCH !== 'string') {
    console.error(`gp:refresh: unexpected record for ${id}; stopping.`);
    process.exit(1);
  }
  elements.push(Object.fromEntries(OMM_FIELDS.filter((k) => k in raw).map((k) => [k, raw[k]])));
}

await mkdir(dirname(out), { recursive: true });
await writeFile(
  out,
  JSON.stringify({ fetchedAt: new Date().toISOString(), elements }, null, 2) + '\n',
);
console.log(`gp:refresh: wrote ${elements.length} element sets to ${out}`);
