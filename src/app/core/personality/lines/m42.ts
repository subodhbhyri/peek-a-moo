import type { LinePack } from './types';

/**
 * Voice: A busy nursery.
 * Facts: Sits in the sword of Orion below the belt; an active star-forming region.
 */
export const M42_LINES: LinePack = {
  first: ['the orion nebula. new stars are being born in there right now.'],
  repeat: [
    'busy in here. new stars, as usual.',
    "orion nebula. the nursery's open all hours.",
    "back to the nursery? shh, they're sleeping. (they're not.)",
  ],
  quick: ["found me fast. i'm just below orion's belt.", 'quick. you know where to look.'],
  'long-hunt': [
    "it's busy in here, and i'm easy to miss.",
    "took you a minute. i've got stars to raise.",
  ],
  faint: [
    "a faint smudge by eye, but there's a lot going on.",
    'binoculars help. so much is happening in here.',
  ],
  low: [
    "low in the sky. the nursery's still open.",
    'near the horizon. the stars in here keep growing.',
  ],
  milestone: ['you keep visiting. the stars in here are growing up fast.'],
};
