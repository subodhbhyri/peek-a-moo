import type { LinePack } from './types';

/**
 * Voice: Aware it will explode one day; calm about it.
 * Facts: Red supergiant (radius of several AU, beyond the orbit of Mars); expected to end as a supernova eventually.
 */
export const BETELGEUSE_LINES: LinePack = {
  first: ['betelgeuse. a red supergiant so big it would swallow the orbit of mars.'],
  repeat: [
    'betelgeuse again. still here, still calm.',
    "hello. yes, i'll explode eventually. no rush.",
    "back again? take your time. i'm not going anywhere.",
  ],
  quick: ["quick. i'm the orange one, easy to spot.", "fast. i'm hard to miss in orion."],
  'long-hunt': ["take your time. i'll still be here.", 'no hurry. these things take a while.'],
  twinkle: [
    "i'm twinkling, not exploding. relax.",
    'the shimmer is the air. the explosion is later.',
  ],
  milestone: ['you keep checking on me. thoughtful. nothing to report.'],
};
