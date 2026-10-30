// Generates public/data/cities.json from GeoNames cities15000 (CC BY 4.0, https://www.geonames.org):
// every city with population >= 100,000 plus every national capital (feature code PPLC), with the country
// and first-level region names from GeoNames' own countryInfo and admin1CodesASCII files.
// Run: node scripts/cities.mjs   Needs the internet; exits non-zero, writing nothing, if anything is off.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const BASE = 'https://download.geonames.org/export/dump/';
const out = resolve(dirname(fileURLToPath(import.meta.url)), '../public/data/cities.json');
const MIN_POPULATION = 100_000;

/** Long official names shortened the way people write them. */
const SHORT_COUNTRY = {
  'United States': 'USA',
  'United Kingdom': 'UK',
  'United Arab Emirates': 'UAE',
  'Russian Federation': 'Russia',
  'Republic of the Congo': 'Congo',
  'Democratic Republic of the Congo': 'DR Congo',
  'South Korea': 'South Korea',
  'North Korea': 'North Korea',
  Czechia: 'Czechia',
};

async function download(name) {
  const res = await fetch(BASE + name, { signal: AbortSignal.timeout(120_000) });
  if (res.status !== 200) {
    console.error(`cities: ${BASE}${name} answered ${res.status}`);
    process.exit(1);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** Reads one file out of a (single-entry, deflate) zip without any dependency. */
function unzipFile(zip, wanted) {
  // End of central directory record: signature 0x06054b50, searched from the end.
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip file');
  let p = zip.readUInt32LE(eocd + 16);
  const entries = zip.readUInt16LE(eocd + 10);
  for (let i = 0; i < entries; i++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory');
    const method = zip.readUInt16LE(p + 10);
    const compressed = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const localOffset = zip.readUInt32LE(p + 42);
    const name = zip.toString('utf8', p + 46, p + 46 + nameLen);
    if (name === wanted) {
      const lhNameLen = zip.readUInt16LE(localOffset + 26);
      const lhExtraLen = zip.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + lhNameLen + lhExtraLen;
      const data = zip.subarray(start, start + compressed);
      return method === 8 ? inflateRawSync(data) : data;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${wanted} not in the zip`);
}

const round4 = (v) => Math.round(Number(v) * 1e4) / 1e4;

const countries = {};
for (const line of (await download('countryInfo.txt')).toString('utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const f = line.split('\t');
  countries[f[0]] = SHORT_COUNTRY[f[4]] ?? f[4];
}
const admin1 = {};
for (const line of (await download('admin1CodesASCII.txt')).toString('utf8').split('\n')) {
  if (!line) continue;
  const f = line.split('\t');
  admin1[f[0]] = f[1]; // "AE.01" -> "Abu Dhabi"
}

const text = unzipFile(await download('cities15000.zip'), 'cities15000.txt').toString('utf8');
const rows = [];
for (const line of text.split('\n')) {
  if (!line) continue;
  const f = line.split('\t');
  const [, name, ascii, , lat, lon, , featureCode, cc, , a1] = f;
  const population = Number(f[14]);
  if (!(population >= MIN_POPULATION || featureCode === 'PPLC')) continue;
  const country = countries[cc];
  if (!country || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) continue;
  rows.push([
    name,
    ascii === name ? '' : ascii,
    country,
    admin1[`${cc}.${a1}`] ?? '',
    round4(lat),
    round4(lon),
    population,
  ]);
}
// The population only ranks search results, so two significant digits are plenty (and compress well).
for (const r of rows) r[6] = Number(r[6].toPrecision(2));
// The region name only disambiguates, so keep it just where another city shares name and country.
const seen = new Map();
for (const r of rows) seen.set(`${r[0]}|${r[2]}`, (seen.get(`${r[0]}|${r[2]}`) ?? 0) + 1);
for (const r of rows) if (seen.get(`${r[0]}|${r[2]}`) === 1) r[3] = '';
rows.sort((a, b) => b[6] - a[6] || a[0].localeCompare(b[0]));

if (rows.length < 3000) {
  console.error(`cities: only ${rows.length} cities; something is wrong`);
  process.exit(1);
}
await mkdir(dirname(out), { recursive: true });
await writeFile(
  out,
  JSON.stringify({
    source: 'GeoNames cities15000 (https://www.geonames.org), CC BY 4.0',
    generated: new Date().toISOString().slice(0, 10),
    minPopulation: MIN_POPULATION,
    // ascii is "" when it equals name; admin1 (first-level region) is only given where the name is ambiguous
    // within its country; population is rounded to two significant digits and only used to rank results.
    columns: ['name', 'ascii', 'country', 'admin1', 'lat', 'lon', 'population'],
    cities: rows,
  }) + '\n',
);
console.log(`cities: wrote ${rows.length} cities to ${out}`);
