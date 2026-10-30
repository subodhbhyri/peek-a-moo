import type { LinePack } from './types';

/**
 * Voice: Unseen, a little ominous.
 * Facts: Sagittarius A* is about 4 million solar masses at roughly 26,000 light-years; dust blocks it in visible light.
 */
export const GALACTIC_CENTER_LINES: LinePack = {
  first: ["you can't see it, but a black hole of about 4 million suns is right there."],
  repeat: [
    "you're pointing at it again. it doesn't mind.",
    'still there. still unseen.',
    'back again. it noticed.',
  ],
  quick: ["that was quick. it didn't expect to be found.", 'so fast. like it was waiting for you.'],
  'long-hunt': [
    "it isn't hiding. there's just a lot of dust in the way.",
    'a long look. nothing to see, everything to know.',
  ],
  faint: [
    "you won't see anything. it's dust and 26,000 light-years.",
    'nothing visible. the dust sees to that.',
  ],
  low: ['low, and hidden twice over.', 'near the horizon, behind the dust, out of sight.'],
  milestone: ['you keep looking toward the center of the galaxy. it keeps looking back.'],
};
