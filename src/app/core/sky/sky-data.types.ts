/** public/data/sky.json (scripts/sky-data.mjs). All positions are J2000 [RA in degrees, Dec in degrees]. */
export interface SkyConstellationData {
  /** URL-safe slug of the Latin name: 'orion', 'ursa-major'. */
  id: string;
  /** IAU abbreviation: 'Ori'. */
  iau: string;
  name: string;
  english: string;
  rank: 1 | 2 | 3;
  /** Stick-figure polylines. */
  lines: [ra: number, dec: number][][];
  label: [ra: number, dec: number];
}

export interface SkyFile {
  version: 1;
  source: string;
  /** [RA deg, Dec deg, magnitude, B-V or null], brightest first. */
  stars: [ra: number, dec: number, mag: number, bv: number | null][];
  constellations: SkyConstellationData[];
}

const isPair = (p: unknown): p is [number, number] =>
  Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && Number.isFinite(n));

/** Structural check on a parsed sky.json; a file that fails it is treated as unavailable. */
export function isSkyFile(x: unknown): x is SkyFile {
  if (typeof x !== 'object' || x === null) return false;
  const f = x as Partial<SkyFile>;
  return (
    f.version === 1 &&
    Array.isArray(f.stars) &&
    f.stars.length > 1000 &&
    f.stars.every(
      (s) =>
        Array.isArray(s) &&
        s.length === 4 &&
        isPair(s.slice(0, 2)) &&
        typeof s[2] === 'number' &&
        (s[3] === null || typeof s[3] === 'number'),
    ) &&
    Array.isArray(f.constellations) &&
    f.constellations.length === 88 &&
    f.constellations.every(
      (c) =>
        typeof c.id === 'string' &&
        [1, 2, 3].includes(c.rank) &&
        isPair(c.label) &&
        Array.isArray(c.lines) &&
        c.lines.length > 0 &&
        c.lines.every((l) => Array.isArray(l) && l.length >= 2 && l.every(isPair)),
    )
  );
}
