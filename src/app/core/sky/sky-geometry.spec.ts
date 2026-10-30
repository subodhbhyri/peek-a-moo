import { Spherical, VectorFromSphere } from 'astronomy-engine';
import { CONSTELLATION_ROWS } from './constellation-index';
import { CONSTELLATION_FACTS } from './constellation-facts';
import { isSkyFile } from './sky-data.types';
import { SKY_FILE, skyGeometry } from './testing/sky-fixture';
import { ALL_TARGETS, TARGETS } from '../targets/catalog';
import { angleBetweenDeg } from '../math/vec3';

describe('sky.json (generated from d3-celestial 0.7.35)', () => {
  it('has the documented shape and counts', () => {
    expect(isSkyFile(SKY_FILE)).toBe(true);
    expect(SKY_FILE.version).toBe(1);
    expect(SKY_FILE.source).toBe('d3-celestial 0.7.35 (BSD-3-Clause), Hipparcos-based');
    expect(SKY_FILE.stars).toHaveLength(1627);
    expect(SKY_FILE.stars.every((s) => s[2] <= 5.0)).toBe(true);
    expect(SKY_FILE.constellations).toHaveLength(88);
    const vertices = SKY_FILE.constellations.reduce(
      (n, c) => n + c.lines.reduce((m, l) => m + l.length, 0),
      0,
    );
    expect(vertices).toBe(893);
    const ranks = [1, 2, 3].map((r) => SKY_FILE.constellations.filter((c) => c.rank === r).length);
    expect(ranks).toEqual([22, 24, 42]); // 22 / 24 / 43 in d3-celestial, with Serpens' two halves merged
  });

  it('wraps right ascension to 0-360 and matches the spot checks (Betelgeuse, Arcturus)', () => {
    for (const [ra, dec] of SKY_FILE.stars) {
      expect(ra).toBeGreaterThanOrEqual(0);
      expect(ra).toBeLessThan(360);
      expect(Math.abs(dec)).toBeLessThanOrEqual(90);
    }
    const near = (ra: number, dec: number, mag: number) =>
      SKY_FILE.stars.find(
        (s) => Math.abs(s[0] - ra) < 0.001 && Math.abs(s[1] - dec) < 0.001,
      )?.[2] === mag;
    expect(near(88.7929, 7.4071, 0.45)).toBe(true); // Betelgeuse, HIP 27989
    expect(near(213.9153, 19.1824, -0.05)).toBe(true); // Arcturus, HIP 69673 (lon -146.0847)
  });

  it('merges Serpens into one entry with both halves, and every slug is unique and URL-safe', () => {
    const serpens = SKY_FILE.constellations.filter((c) => c.iau === 'Ser');
    expect(serpens).toHaveLength(1);
    expect(serpens[0].id).toBe('serpens');
    expect(serpens[0].lines).toHaveLength(2);
    const ids = SKY_FILE.constellations.map((c) => c.id);
    expect(new Set(ids).size).toBe(88);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(ids).toContain('ursa-major');
    expect(ids).toContain('bootes'); // Boötes, accents stripped
  });

  it('the start-up index (constellation-index.ts) says exactly what sky.json says', () => {
    expect(CONSTELLATION_ROWS).toHaveLength(88);
    const byId = new Map(SKY_FILE.constellations.map((c) => [c.id, c]));
    for (const [id, iau, name, english, rank] of CONSTELLATION_ROWS) {
      const c = byId.get(id);
      expect(c, id).toBeDefined();
      expect([c!.iau, c!.name, c!.english, c!.rank], id).toEqual([iau, name, english, rank]);
    }
  });

  it('labels the 22 rank-1 constellations with the standard English meanings', () => {
    const english = (id: string) => SKY_FILE.constellations.find((c) => c.id === id)!.english;
    expect(english('ursa-major')).toBe('Great Bear');
    expect(english('ursa-minor')).toBe('Little Bear');
    expect(english('orion')).toBe('Hunter');
    const rank1 = SKY_FILE.constellations.filter((c) => c.rank === 1).map((c) => c.id);
    expect(Object.keys(CONSTELLATION_FACTS).sort()).toEqual([...rank1].sort());
  });
});

describe('buildSkyGeometry', () => {
  const g = skyGeometry();

  it('turns the file into unit EQJ vectors (same VectorFromSphere path as the fixed-sky provider)', () => {
    expect(g.starCount).toBe(1627);
    expect(g.pointCount).toBe(893 + 88);
    for (let i = 0; i < g.starCount; i += 97) {
      const norm = Math.hypot(g.starEqj[i * 3], g.starEqj[i * 3 + 1], g.starEqj[i * 3 + 2]);
      expect(norm).toBeCloseTo(1, 12);
    }
    const [ra, dec] = SKY_FILE.stars[5];
    const v = VectorFromSphere(new Spherical(dec, ra, 1), new Date());
    expect([g.starEqj[15], g.starEqj[16], g.starEqj[17]]).toEqual([v.x, v.y, v.z]);
  });

  it('a constellation center is the normalized mean of its vertices; its radius reaches the farthest one', () => {
    const orion = g.byId.get('orion')!;
    const mean = [0, 0, 0];
    for (let p = orion.vertexStart; p < orion.vertexEnd; p++) {
      for (let k = 0; k < 3; k++) mean[k] += g.pointEqj[p * 3 + k];
    }
    const len = Math.hypot(...mean);
    orion.centerEqj.forEach((c, k) => expect(c).toBeCloseTo(mean[k] / len, 12));
    let far = 0;
    for (let p = orion.vertexStart; p < orion.vertexEnd; p++) {
      far = Math.max(
        far,
        angleBetweenDeg(orion.centerEqj, [
          g.pointEqj[p * 3],
          g.pointEqj[p * 3 + 1],
          g.pointEqj[p * 3 + 2],
        ]),
      );
    }
    expect(orion.radiusDeg).toBeCloseTo(far, 9);
    // Orion sits near RA 5.5 h, Dec ~0, and is about 40-50 degrees long.
    const center = Math.atan2(orion.centerEqj[1], orion.centerEqj[0]) * (180 / Math.PI);
    expect(center).toBeGreaterThan(75);
    expect(center).toBeLessThan(90);
    expect(orion.radiusDeg).toBeGreaterThan(15);
    expect(orion.radiusDeg).toBeLessThan(35);
  });

  it('records line segments as vertex-index pairs inside the constellation own range', () => {
    for (const c of g.constellations) {
      expect(c.segments.length % 2).toBe(0);
      for (const idx of c.segments) {
        expect(idx).toBeGreaterThanOrEqual(c.vertexStart);
        expect(idx).toBeLessThan(c.vertexEnd);
      }
      expect(c.labelIndex).toBeGreaterThanOrEqual(893);
    }
  });
});

describe('the catalog with constellations', () => {
  it('has 88 constellation targets, unique ids across the whole catalog, and the original 22 untouched', () => {
    expect(TARGETS).toHaveLength(22);
    const constellations = ALL_TARGETS.filter((t) => t.kind === 'constellation');
    expect(constellations).toHaveLength(88);
    expect(ALL_TARGETS).toHaveLength(110);
    expect(new Set(ALL_TARGETS.map((t) => t.id)).size).toBe(ALL_TARGETS.length);
    for (const c of constellations) {
      expect(c.category).toBe('constellations');
      expect(c.render).toBe('constellation');
      expect(c.info.type).toBe('Constellation');
    }
  });

  it('is ordered rank 1 first, then alphabetically within a rank', () => {
    const list = ALL_TARGETS.filter((t) => t.kind === 'constellation');
    const key = (t: (typeof list)[number]) => [t.constellation!.rank, t.name] as const;
    const sorted = [...list].sort(
      (a, b) => key(a)[0] - key(b)[0] || key(a)[1].localeCompare(key(b)[1]),
    );
    expect(list.map((t) => t.id)).toEqual(sorted.map((t) => t.id));
    expect(list.slice(0, 22).every((t) => t.constellation!.rank === 1)).toBe(true);
  });
});
