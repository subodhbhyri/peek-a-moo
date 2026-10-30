import {
  CONSTELLATION_FOUND_LINES,
  constellationFoundLine,
} from '../personality/constellation-lines';
import { targetFoundToast } from '../personality/target-lines';
import { ALL_TARGETS, TARGETS, getTarget } from './catalog';
import { recomputeIntervalMs } from './cadence';

const constellations = ALL_TARGETS.filter((t) => t.kind === 'constellation');

describe('constellation info and found moment', () => {
  it('the card says: type "Constellation", "{Latin} — the {English}. One of the 88 ..."', () => {
    const orion = getTarget('orion')!;
    expect(orion.info.type).toBe('Constellation');
    expect(orion.info.description).toBe(
      'Orion — the Hunter. One of the 88 constellations recognized by the International Astronomical Union.',
    );
    const ursa = getTarget('ursa-major')!;
    expect(ursa.info.description.startsWith('Ursa Major — the Great Bear.')).toBe(true);
    expect(getTarget('great-bear')).toBeUndefined();
  });

  it('rank-1 constellations have exactly 3 facts, rank 2-3 have none; nothing has a distance', () => {
    expect(constellations.filter((c) => c.constellation!.rank === 1)).toHaveLength(22);
    for (const c of constellations) {
      expect(c.info.facts, c.id).toHaveLength(c.constellation!.rank === 1 ? 3 : 0);
      expect(c.info.distanceLy, c.id).toBeUndefined();
      expect(c.info.description.length, c.id).toBeLessThanOrEqual(220);
      for (const f of c.info.facts) expect(f.length, `${c.id}: ${f}`).toBeLessThanOrEqual(120);
    }
  });

  it('rank-1 constellations have a one-line found message; the rest say "Found {Latin}."', () => {
    for (const c of constellations) {
      const line = constellationFoundLine(c);
      if (c.constellation!.rank === 1) {
        expect(line, c.id).toBe(CONSTELLATION_FOUND_LINES[c.id]);
        expect(line.length, c.id).toBeGreaterThan(8);
        expect(line.length, c.id).toBeLessThanOrEqual(60);
      } else {
        expect(line, c.id).toBe(`Found ${c.name}.`);
      }
    }
    expect(Object.keys(CONSTELLATION_FOUND_LINES)).toHaveLength(22);
    expect(constellationFoundLine(getTarget('crux')!)).toBe('Found Crux.');
  });

  it('the toast is "Found {Latin} in X.Xs"', () => {
    expect(targetFoundToast(getTarget('orion')!, 3200)).toBe('Found Orion in 3.2s');
    expect(targetFoundToast(getTarget('ursa-major')!, 12_345)).toBe('Found Ursa Major in 12.3s');
  });

  it('recomputes on the slow cadence (a figure does not move), and the original 22 are unchanged', () => {
    expect(recomputeIntervalMs('constellation')).toBe(30_000);
    expect(TARGETS).toHaveLength(22);
    expect(TARGETS.every((t) => t.kind !== 'constellation')).toBe(true);
  });
});
