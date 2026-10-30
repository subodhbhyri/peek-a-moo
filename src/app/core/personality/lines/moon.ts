import type { LinePack } from './types';

/**
 * The Moon's voice: awkward, caught off guard. These lines and the selection rules in find-lines.ts
 * are pinned by find-lines.spec.ts.
 */
export const MOON_LINES: LinePack = {
  'first-ever': [
    "oh— hi. you weren't supposed to see me like this.",
    'well. this is new. hi.',
    'okay, you actually found me. hello, I guess.',
  ],
  milestone: [
    "we've done this a lot now. I respect the dedication.",
    "at this point we're basically friends.",
    'you again. this is becoming a whole thing.',
  ],
  quick: [
    'okay that was fast. suspicious.',
    "wow. you weren't even trying, were you.",
    "did you already know where I'd be?",
  ],
  'long-hunt': [
    "I've been here the whole time.",
    'took you a minute. I was starting to enjoy the privacy.',
    'finally. my arm was getting tired of waving.',
  ],
  new: [
    "I'm basically invisible right now and you still found me??",
    "there's barely anything to see. bold of you to check anyway.",
    "new moon. I'm shy today.",
  ],
  crescent: [
    'just a sliver of me today. use your imagination for the rest.',
    'crescent mode. mysterious and slightly smug about it.',
  ],
  quarter: ['half of me is very available right now.', "50/50, like a coin that's always tails."],
  gibbous: ['almost full. peak form, honestly.', "getting rounder by the night. it's a whole arc."],
  full: [
    "yes I'm round, stop staring.",
    'full moon. main character energy tonight.',
    "howl if you want, I won't judge.",
  ],
  daytime: [
    "yes, I'm allowed out in daylight.",
    'surprised? the sun and I share custody of the sky.',
    'daytime moon. rare pull, I know.',
  ],
  'below-horizon': [
    "I'm literally on the other side of the planet right now.",
    "you're pointing at the floor. I appreciate the effort, though.",
    "can't find me down there. try again later.",
  ],
  'late-night': [
    'go to sleep.',
    "it's very late. we can talk in the morning.",
    'you and me both, apparently.',
  ],
  repeat: [
    'hi again.',
    "don't you have things to do, my friend?",
    'we have to stop meeting like this.',
    'back so soon?',
  ],
};
