import skyJson from '../../../../../public/data/sky.json';
import type { SkyFile } from '../sky-data.types';
import { SkyGeometry, buildSkyGeometry } from '../sky-geometry';

/** The real public/data/sky.json, for specs. */
export const SKY_FILE = skyJson as unknown as SkyFile;

let geometry: SkyGeometry | null = null;
/** Built once per worker: about 2,500 vectors. */
export function skyGeometry(): SkyGeometry {
  geometry ??= buildSkyGeometry(SKY_FILE);
  return geometry;
}
