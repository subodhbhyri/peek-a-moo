import type { LinePack } from './types';

/**
 * Voice: Sisters talking over each other.
 * Facts: Young open cluster of around a thousand stars; the naked eye usually sees six or seven.
 */
export const M45_LINES: LinePack = {
  first: ['the pleiades. a young cluster of around a thousand stars.'],
  repeat: [
    "it's us again!",
    "oh, you're back! we were just talking about you.",
    'hello! wait, no, let me— hello!',
  ],
  quick: ['you found us! all of us! at once!', "that was quick! we're easy to find!"],
  'long-hunt': [
    'we were waving the whole time! did you not see us?',
    'we were right here! seven of us! well, more than seven!',
  ],
  faint: ["we're small and we shimmer. look closer!", 'look a little to the side, we like that!'],
  low: ["we're low! but we're still here!", 'near the horizon! we get shy! a bit!'],
  milestone: ['so many visits! somebody say something!'],
};
