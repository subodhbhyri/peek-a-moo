import type { LinePack } from './types';

/**
 * Voice: Calm about an eventual collision.
 * Facts: About 2.5 million light-years away; approaching the Milky Way (about 110 km/s); a merger billions of years from now is likely but the timing is uncertain, so no number is given.
 */
export const M31_LINES: LinePack = {
  first: ['andromeda. the light hitting your eye left it 2.5 million years ago.'],
  repeat: [
    'andromeda again. still approaching. no rush.',
    "we might collide in a few billion years. don't worry about it.",
    "hello again. i'm coming your way at about 110 km/s. don't worry.",
  ],
  quick: ['you found a whole galaxy in seconds. nice.', 'quick! most people need dark skies.'],
  'long-hunt': [
    "i'm faint. it's okay. i'm 2.5 million light-years away.",
    "took a while. i'm a long way off.",
  ],
  faint: [
    "i'm easy to miss in a bright sky. it's fine.",
    "you need dark skies to see me properly. but i'm there.",
  ],
  low: [
    "low on the horizon. i'm hard enough to see already.",
    'down here the air is thick. give me dark skies.',
  ],
  milestone: ['you keep visiting the neighbours. very kind.'],
};
