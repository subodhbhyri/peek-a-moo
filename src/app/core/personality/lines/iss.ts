import type { LinePack } from './types';

/**
 * Voice: Busy, polite.
 * Facts: Orbital speed about 7.66 km/s; one orbit takes roughly 90 minutes; crewed continuously (no count given).
 */
export const ISS_LINES: LinePack = {
  first: ["that's the iss. people live up there, and they might be waving."],
  repeat: [
    "iss again. can't talk, doing 7.66 km/s.",
    'hi! sorry, busy. 7.66 km/s.',
    "you again? i'll be back round in about 90 minutes.",
  ],
  quick: ["wow, quick. most people miss me. i'm fast.", "good eyes. i don't stay long."],
  'long-hunt': [
    'sorry, i was moving. 7.66 km/s is a lot.',
    'you caught me. thanks for your patience.',
  ],
  overhead: ['right overhead. wave, if you like.', 'directly above you. very polite of me.'],
  shadow: ["i'm in earth's shadow. still here, just dark.", 'invisible, but still politely here.'],
  milestone: ["you keep finding me. very kind. i'm always in a hurry."],
};
