import type { LinePack } from './types';

/**
 * Voice: A southern object that never visits.
 * Facts: A satellite galaxy of the Milky Way at declination about -70 degrees, so it stays in the southern sky.
 */
export const LMC_LINES: LinePack = {
  first: ['the large magellanic cloud. a whole galaxy, circling ours.'],
  repeat: [
    'the lmc again. still in the south.',
    "you found me again. i don't visit the north much.",
    "hello again. don't forget me up there.",
  ],
  quick: [
    'quick. most people never get to see me.',
    'found me fast. southern skies are good like that.',
  ],
  'long-hunt': [
    "took a while. i'm not around much in the north.",
    'i stay in the southern sky. you found me anyway.',
  ],
  faint: ["i'm big and faint. dark skies, please.", 'a pale cloud. look for the glow.'],
  low: ["low in the sky. i don't get north much.", 'near the horizon. i keep my distance.'],
  milestone: ["you keep finding me. i'm not used to visitors."],
};
