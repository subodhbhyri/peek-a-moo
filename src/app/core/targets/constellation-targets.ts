import { CONSTELLATION_ROWS } from '../sky/constellation-index';
import { CONSTELLATION_FACTS } from '../sky/constellation-facts';
import type { TargetDef } from './target.types';

/**
 * The 88 constellations as catalog entries, built from the generated index (scripts/sky-data.mjs), which
 * is just names and rank: the figures themselves are in sky.json, fetched only when needed. Known at
 * start-up so a `?target=orion` link or a remembered choice resolves at once.
 *
 * Sorted for the picker: rank 1 first, then by Latin name.
 */
export const CONSTELLATION_TARGETS: readonly TargetDef[] = CONSTELLATION_ROWS.map(
  ([id, iau, name, english, rank]): TargetDef => ({
    id,
    name,
    nameInSentence: name,
    shortName: name,
    kind: 'constellation',
    category: 'constellations',
    blurb: `The ${english}.`,
    render: 'constellation',
    constellation: { iau, english, rank },
    info: {
      type: 'Constellation',
      description: `${name} — the ${english}. One of the 88 constellations recognized by the International Astronomical Union.`,
      facts: CONSTELLATION_FACTS[id] ?? [],
    },
  }),
).sort((a, b) => a.constellation!.rank - b.constellation!.rank || a.name.localeCompare(b.name));
