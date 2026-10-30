import type { TargetDef } from '../targets/target.types';

/**
 * One short line for each rank-1 constellation, in the plain voice (the Moon, the planets and the ISS have
 * their own; a constellation is a pattern, so it just says what you found). The other 66 use
 * "Found {Latin}."
 */
export const CONSTELLATION_FOUND_LINES: Readonly<Record<string, string>> = {
  andromeda: 'There she is, chained to her rock.',
  aquila: 'The Eagle, wings out.',
  aries: 'The Ram, small but proud.',
  auriga: 'The Charioteer, with Capella blazing.',
  bootes: 'The Herdsman, and Arcturus at his knee.',
  'canis-major': 'The Great Dog, with Sirius as its nose.',
  carina: 'The Keel of the old ship.',
  cassiopeia: 'The W, right where it should be.',
  centaurus: 'The Centaur, with our nearest star neighbours.',
  cetus: 'The Sea Monster, mostly faint, all there.',
  cygnus: 'The Swan, flying down the Milky Way.',
  eridanus: 'The River, all the long way down.',
  gemini: 'The Twins, side by side.',
  leo: 'The Lion, mane and all.',
  orion: 'The Hunter, belt and all.',
  pegasus: 'The Winged Horse, upside down as usual.',
  perseus: 'The Hero, with the Double Cluster at his shoulder.',
  sagittarius: 'The Archer, pointing at the heart of the galaxy.',
  scorpius: 'The Scorpion, tail curled.',
  taurus: 'The Bull, red eye first.',
  'ursa-major': 'The Great Bear, Dipper and all.',
  virgo: 'The Maiden, with Spica shining.',
};

/** The line shown when a constellation is found. */
export function constellationFoundLine(def: TargetDef): string {
  return CONSTELLATION_FOUND_LINES[def.id] ?? `Found ${def.name}.`;
}
