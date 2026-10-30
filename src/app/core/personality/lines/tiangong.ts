import type { LinePack } from './types';

/**
 * Voice: Busy too.
 * Facts: China's space station; one orbit takes roughly 90 minutes.
 */
export const TIANGONG_LINES: LinePack = {
  first: ["that's tiangong. china's space station, one lap about every 90 minutes."],
  repeat: [
    'tiangong again. busy as ever.',
    'hi. also cannot stay. orbit to do.',
    'back again. same as the iss: always moving.',
  ],
  quick: ['fast. well spotted.', "quick. i don't linger."],
  'long-hunt': ['sorry, i was in motion.', "thanks for waiting. i'm hard to pin down."],
  overhead: ["overhead. i'm just passing through.", "right above you. don't blink."],
  shadow: [
    'the dark side of the orbit. still here.',
    "in earth's shadow. nothing to see, but i'm up here.",
  ],
  milestone: ["you keep finding me. we're both busy, you and i."],
};
