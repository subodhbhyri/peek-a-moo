import type { LinePack } from './types';

/**
 * Voice: Knows it is the brightest.
 * Facts: Brightest star in the night sky; about 8.6 light-years away; scintillates in colour when low.
 */
export const SIRIUS_LINES: LinePack = {
  first: ['sirius. the brightest star in the night sky, and only 8.6 light-years away.'],
  repeat: [
    'sirius. yes, still the brightest.',
    'back to look at the brightest star? fair.',
    "i'm still the brightest. nothing changed.",
  ],
  quick: ["of course you found me quickly. i'm the brightest.", "quick. i'm hard to miss."],
  'long-hunt': [
    "took you a while. i'm literally the brightest one.",
    'i was right here, being the brightest.',
  ],
  bright: ["i'm bright and i know it.", 'brightest star in the night sky. just saying.'],
  twinkle: [
    "when i'm low i flash every colour. it's my signature.",
    'the shimmer is the air. the brilliance is me.',
  ],
  milestone: ['you keep finding the brightest star. good taste.'],
};
