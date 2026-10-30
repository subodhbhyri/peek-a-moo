// Generates the star map from d3-celestial 0.7.35 (BSD-3-Clause, Hipparcos-based). Run: node scripts/sky-data.mjs
//   public/data/sky.json                       ~1,600 stars (mag <= 5.0) + the 88 constellations' stick figures
//   public/data/LICENSE-d3-celestial.txt       the BSD-3 notice, which has to travel with the data
//   src/app/core/sky/constellation-index.ts    id / names / rank of the 88, so the catalog is known at start-up
// The package is a build-time devDependency only; nothing from it is imported into the app.
// All input coordinates are [lon, lat] = [RA in degrees wrapped to -180..180, Dec]. Exits non-zero, writing
// nothing, if any count is off.
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = resolve(root, 'node_modules/d3-celestial');
const dataDir = resolve(pkgDir, 'data');
const MAX_MAG = 5.0;

const pkg = JSON.parse(await readFile(resolve(pkgDir, 'package.json'), 'utf8'));
if (pkg.version !== '0.7.35' || pkg.license !== 'BSD-3-Clause') {
  fail(`expected d3-celestial 0.7.35 (BSD-3-Clause), found ${pkg.version} (${pkg.license})`);
}

/**
 * The standard English meaning of each name. d3-celestial's `en` is sometimes an asterism ("Big Dipper"
 * for Ursa Major), a spelling of the Latin name, or terse; where this differs from `en` it is listed in
 * docs/phases/phase10-report.md.
 */
const ENGLISH = {
  And: 'Chained Maiden',
  Ant: 'Air Pump',
  Aps: 'Bird of Paradise',
  Aqr: 'Water Bearer',
  Aql: 'Eagle',
  Ara: 'Altar',
  Ari: 'Ram',
  Aur: 'Charioteer',
  Boo: 'Herdsman',
  Cae: 'Chisel',
  Cam: 'Giraffe',
  Cnc: 'Crab',
  CVn: 'Hunting Dogs',
  CMa: 'Great Dog',
  CMi: 'Little Dog',
  Cap: 'Sea Goat',
  Car: 'Keel',
  Cas: 'Seated Queen',
  Cen: 'Centaur',
  Cep: 'King',
  Cet: 'Sea Monster',
  Cha: 'Chameleon',
  Cir: 'Drawing Compass',
  Col: 'Dove',
  Com: "Berenice's Hair",
  CrA: 'Southern Crown',
  CrB: 'Northern Crown',
  Crv: 'Crow',
  Crt: 'Cup',
  Cru: 'Southern Cross',
  Cyg: 'Swan',
  Del: 'Dolphin',
  Dor: 'Dolphinfish',
  Dra: 'Dragon',
  Equ: 'Little Horse',
  Eri: 'River',
  For: 'Furnace',
  Gem: 'Twins',
  Gru: 'Crane',
  Her: 'Strongman',
  Hor: 'Clock',
  Hya: 'Water Snake',
  Hyi: 'Lesser Water Snake',
  Ind: 'Indian',
  Lac: 'Lizard',
  Leo: 'Lion',
  LMi: 'Little Lion',
  Lep: 'Hare',
  Lib: 'Scales',
  Lup: 'Wolf',
  Lyn: 'Lynx',
  Lyr: 'Lyre',
  Men: 'Table Mountain',
  Mic: 'Microscope',
  Mon: 'Unicorn',
  Mus: 'Fly',
  Nor: "Carpenter's Square",
  Oct: 'Octant',
  Oph: 'Serpent Bearer',
  Ori: 'Hunter',
  Pav: 'Peacock',
  Peg: 'Winged Horse',
  Per: 'Hero',
  Phe: 'Phoenix',
  Pic: "Painter's Easel",
  Psc: 'Fishes',
  PsA: 'Southern Fish',
  Pup: 'Stern',
  Pyx: "Mariner's Compass",
  Ret: 'Net',
  Sge: 'Arrow',
  Sgr: 'Archer',
  Sco: 'Scorpion',
  Scl: 'Sculptor',
  Sct: 'Shield',
  Ser: 'Serpent',
  Sex: 'Sextant',
  Tau: 'Bull',
  Tel: 'Telescope',
  Tri: 'Triangle',
  TrA: 'Southern Triangle',
  Tuc: 'Toucan',
  UMa: 'Great Bear',
  UMi: 'Little Bear',
  Vel: 'Sails',
  Vir: 'Maiden',
  Vol: 'Flying Fish',
  Vul: 'Little Fox',
};

const json = async (name) => JSON.parse(await readFile(resolve(dataDir, name), 'utf8'));
function fail(msg) {
  console.error(`sky-data: ${msg}`);
  process.exit(1);
}

const round = (v, dp) => Math.round(v * 10 ** dp) / 10 ** dp;
const raDeg = (lon) => (lon < 0 ? lon + 360 : lon);
const point = ([lon, lat]) => [round(raDeg(lon), 4), round(lat, 4)];
const slug = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// --- stars -------------------------------------------------------------------------------------------
const starsFile = await json('stars.6.json');
const stars = starsFile.features
  .filter((f) => f.properties.mag <= MAX_MAG)
  .map((f) => {
    const bv = Number.parseFloat(f.properties.bv);
    const [ra, dec] = point(f.geometry.coordinates);
    return [ra, dec, round(f.properties.mag, 2), Number.isFinite(bv) ? round(bv, 2) : null];
  })
  .sort((a, b) => a[2] - b[2]);
if (stars.length !== 1627) fail(`expected 1627 stars with mag <= ${MAX_MAG}, got ${stars.length}`);

// --- constellations ----------------------------------------------------------------------------------
const linesFile = await json('constellations.lines.json');
const infoFile = await json('constellations.json');
if (linesFile.features.length !== 89 || infoFile.features.length !== 89) {
  fail('expected 89 line features and 89 constellation features');
}

const byIau = new Map();
for (const f of infoFile.features) {
  const iau = f.id;
  const entry = byIau.get(iau);
  if (entry) {
    // Serpens appears twice (Caput and Cauda): one constellation. Its label sits on the head (Caput).
    continue;
  }
  const latin = iau === 'Ser' ? 'Serpens' : f.properties.name;
  const rank = Number(f.properties.rank);
  if (![1, 2, 3].includes(rank)) fail(`${iau}: bad rank ${f.properties.rank}`);
  if (!ENGLISH[iau]) fail(`${iau}: no English name`);
  byIau.set(iau, {
    id: slug(latin),
    iau,
    name: latin,
    english: ENGLISH[iau],
    rank,
    lines: [],
    label: point(f.geometry.coordinates),
    dEn: f.properties.en.replace(/\s+/g, ' '),
  });
}
for (const f of linesFile.features) {
  const c = byIau.get(f.id);
  if (!c) fail(`lines for unknown constellation ${f.id}`);
  for (const polyline of f.geometry.coordinates) c.lines.push(polyline.map(point));
}
const constellations = [...byIau.values()].sort((a, b) => a.name.localeCompare(b.name, 'en'));
if (constellations.length !== 88) fail(`expected 88 constellations, got ${constellations.length}`);
if (new Set(constellations.map((c) => c.id)).size !== 88)
  fail('constellation slugs are not unique');
for (const c of constellations) if (c.lines.length === 0) fail(`${c.iau} has no lines`);
const ranks = [1, 2, 3].map((r) => constellations.filter((c) => c.rank === r).length);
if (ranks.join() !== '22,24,42') fail(`rank counts ${ranks.join()} (expected 22,24,42)`);

const changed = constellations
  .filter((c) => c.dEn !== c.english)
  .map((c) => `${c.iau}: "${c.dEn}" -> "${c.english}"`);

const sky = {
  version: 1,
  source: 'd3-celestial 0.7.35 (BSD-3-Clause), Hipparcos-based',
  stars,
  constellations: constellations.map(({ id, iau, name, english, rank, lines, label }) => ({
    id,
    iau,
    name,
    english,
    rank,
    lines,
    label,
  })),
};
const text = JSON.stringify(sky);
const vertices = constellations.reduce((n, c) => n + c.lines.reduce((m, l) => m + l.length, 0), 0);

// --- the start-up index (TypeScript, formatted by prettier with the rest of src/) ---------------------
const index = `// GENERATED by scripts/sky-data.mjs from d3-celestial 0.7.35 (BSD-3-Clause). Do not edit by hand.
// Identity of the 88 constellations. The geometry (stars, stick figures) is public/data/sky.json, loaded lazily.

/** [id, IAU abbreviation, Latin name, English meaning, rank]; sorted by Latin name. */
export type ConstellationRow = readonly [
  id: string,
  iau: string,
  name: string,
  english: string,
  rank: 1 | 2 | 3,
];

export const CONSTELLATION_ROWS: readonly ConstellationRow[] = ${JSON.stringify(
  constellations.map((c) => [c.id, c.iau, c.name, c.english, c.rank]),
)};
`;

await mkdir(resolve(root, 'src/app/core/sky'), { recursive: true });
await writeFile(resolve(root, 'public/data/sky.json'), text);
await copyFile(resolve(pkgDir, 'LICENSE'), resolve(root, 'public/data/LICENSE-d3-celestial.txt'));
await writeFile(resolve(root, 'src/app/core/sky/constellation-index.ts'), index);

const bytes = Buffer.byteLength(text);
const gz = gzipSync(text, { level: 9 }).length;
console.log(
  `stars: ${stars.length}; constellations: ${constellations.length}; vertices: ${vertices}`,
);
console.log(`sky.json: ${bytes} bytes raw, ${gz} bytes gzipped (${(gz / 1024).toFixed(1)} KiB)`);
console.log(
  `English names changed from d3-celestial's "en" (${changed.length}):\n  ${changed.join('\n  ')}`,
);
