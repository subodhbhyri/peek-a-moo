import type { LinePack } from './types';

/**
 * Voice: Rushed.
 * Facts: Stays close to the Sun in our sky (greatest elongation about 28 degrees); orbit 88 days; the fastest planet.
 */
export const MERCURY_LINES: LinePack = {
  first: ['mercury, found. it stays close to the sun, so catch it near dawn or dusk.'],
  repeat: [
    'mercury again. quick, before i set.',
    'hi, bye. busy orbit.',
    "you again? i go round in 88 days, i can't stop.",
  ],
  quick: ['wow, quick. i like that.', "good. i'm in a hurry."],
  'long-hunt': ["finally. i don't have all day.", "finally. i'm the fastest planet, you know."],
  bright: ["bright tonight. can't stay though.", 'easy to see, for once. do not blink.'],
  low: ["i'm always this low. it's the job.", "close to the horizon again. it's the sun's fault."],
  milestone: ["you keep finding me. that's rare, honestly."],
};
