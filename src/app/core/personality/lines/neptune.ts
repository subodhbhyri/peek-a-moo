import type { LinePack } from './types';

/**
 * Voice: Lonely, far away.
 * Facts: Too faint for the naked eye; light from Neptune takes about four hours to reach Earth (29 to 30 AU).
 */
export const NEPTUNE_LINES: LinePack = {
  first: ["neptune. too faint for bare eyes, but it's right there."],
  repeat: [
    "neptune again. it's a long way out here.",
    'you came all this way. my light takes about four hours to reach you.',
    "hello. it's quiet out here.",
  ],
  quick: ['you found me fast. nobody does that.', "that was quick. i'm not used to company."],
  'long-hunt': [
    "i'm very far away. thanks for looking anyway.",
    "took a while. i'm used to waiting.",
  ],
  low: ["near the horizon. it's lonely down here too.", 'low and far away. the story of my life.'],
  milestone: ['you keep visiting. that means a lot, out here.'],
};
