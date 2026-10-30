import type { LinePack } from './types';

/**
 * Voice: Former pole star, and it is fine.
 * Facts: Vega was the pole star about 12,000 BC and will be again in roughly 12,000 years (precession of the Earth's axis).
 */
export const VEGA_LINES: LinePack = {
  first: ["vega. i'll be the pole star again in about 12,000 years. it's fine."],
  repeat: [
    "vega again. still not the pole star. it's fine.",
    "hi. i'm a former pole star. i'm over it.",
    'back for me? flattering.',
  ],
  quick: ["quick. i'm easy to spot.", "fast. i'm told i'm hard to miss."],
  'long-hunt': [
    "it's fine. i've waited longer.",
    'took a while. nobody noticed i was the pole star either.',
  ],
  twinkle: ["i twinkle a bit. it's fine.", "the shimmer is the air, not me. it's fine."],
  milestone: ["you keep finding me. it's fine. it's really fine."],
};
