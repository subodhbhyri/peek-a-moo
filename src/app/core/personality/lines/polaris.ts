import type { LinePack } from './types';

/**
 * Voice: Steady; everyone's reference point.
 * Facts: The sky appears to turn about the north celestial pole, which Polaris is within a degree of; its altitude is about the observer's latitude.
 */
export const POLARIS_LINES: LinePack = {
  first: ['polaris. the whole sky turns around me.'],
  repeat: [
    'polaris. still here. still not moving.',
    "you can always find me. that's the point.",
    "same place as last time. i'm reliable.",
  ],
  quick: ["quick. i don't move, so that helps.", 'fast. you know where north is.'],
  'long-hunt': ["i'm in the same place. i always am.", "took a while? i haven't moved."],
  twinkle: ['i twinkle a little. still not going anywhere.', 'the air shimmers. i stay put.'],
  low: ['my height above the horizon is your latitude.', "i'm low. you must be far south."],
  milestone: ['everyone uses me as a reference. you did too.'],
};
