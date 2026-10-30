/**
 * Tags a line can carry.
 *  - Moon (v1): first-ever, milestone, quick, long-hunt, the phase tags, daytime, below-horizon,
 *    late-night, repeat.
 *  - Every other target: first, milestone, quick, long-hunt, repeat, plus context tags that fit it:
 *    bright / low (planets, stars), twinkle (stars), faint (deep sky), overhead / shadow (satellites),
 *    safety (the Sun, which has nothing else).
 */
export type LineTag =
  | 'first-ever'
  | 'first'
  | 'milestone'
  | 'quick'
  | 'long-hunt'
  | 'new'
  | 'crescent'
  | 'quarter'
  | 'gibbous'
  | 'full'
  | 'daytime'
  | 'below-horizon'
  | 'late-night'
  | 'repeat'
  | 'bright'
  | 'low'
  | 'twinkle'
  | 'faint'
  | 'overhead'
  | 'shadow'
  | 'safety';

export type LinePack = Partial<Record<LineTag, readonly string[]>>;
