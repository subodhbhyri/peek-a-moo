import { MOON_LINES } from './moon';
import { SUN_LINES } from './sun';
import { MERCURY_LINES } from './mercury';
import { VENUS_LINES } from './venus';
import { MARS_LINES } from './mars';
import { JUPITER_LINES } from './jupiter';
import { SATURN_LINES } from './saturn';
import { URANUS_LINES } from './uranus';
import { NEPTUNE_LINES } from './neptune';
import { POLARIS_LINES } from './polaris';
import { SIRIUS_LINES } from './sirius';
import { BETELGEUSE_LINES } from './betelgeuse';
import { VEGA_LINES } from './vega';
import { ARCTURUS_LINES } from './arcturus';
import { M31_LINES } from './m31';
import { M42_LINES } from './m42';
import { M45_LINES } from './m45';
import { GALACTIC_CENTER_LINES } from './galactic-center';
import { LMC_LINES } from './lmc';
import { ISS_LINES } from './iss';
import { TIANGONG_LINES } from './tiangong';
import { HUBBLE_LINES } from './hubble';
import type { LinePack } from './types';

export type { LinePack, LineTag } from './types';
export { MOON_LINES };

/** One pack per catalog target id. */
export const LINE_PACKS: Readonly<Record<string, LinePack>> = {
  moon: MOON_LINES,
  sun: SUN_LINES,
  mercury: MERCURY_LINES,
  venus: VENUS_LINES,
  mars: MARS_LINES,
  jupiter: JUPITER_LINES,
  saturn: SATURN_LINES,
  uranus: URANUS_LINES,
  neptune: NEPTUNE_LINES,
  polaris: POLARIS_LINES,
  sirius: SIRIUS_LINES,
  betelgeuse: BETELGEUSE_LINES,
  vega: VEGA_LINES,
  arcturus: ARCTURUS_LINES,
  m31: M31_LINES,
  m42: M42_LINES,
  m45: M45_LINES,
  'galactic-center': GALACTIC_CENTER_LINES,
  lmc: LMC_LINES,
  iss: ISS_LINES,
  tiangong: TIANGONG_LINES,
  hubble: HUBBLE_LINES,
};
