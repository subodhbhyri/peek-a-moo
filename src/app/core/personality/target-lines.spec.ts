import { TARGETS, getTarget } from '../targets/catalog';
import {
  SUN_CAMERA_NOTE,
  SUN_SAFETY_BANNER,
  TARGET_FOUND_LINES,
  targetFoundLine,
  targetFoundToast,
} from './target-lines';

describe('target found lines', () => {
  it('every non-Moon target has exactly one line; the Moon keeps the v1 system', () => {
    for (const t of TARGETS) {
      if (t.kind === 'moon') expect(targetFoundLine(t.id)).toBeNull();
      else expect(targetFoundLine(t.id), t.id).toBeTruthy();
    }
    expect(Object.keys(TARGET_FOUND_LINES).sort()).toEqual(
      TARGETS.filter((t) => t.kind !== 'moon')
        .map((t) => t.id)
        .sort(),
    );
  });

  it('the Sun line is the safety message', () => {
    expect(targetFoundLine('sun')).toBe('Found it. Now look away from it.');
  });

  it('toasts read "Found {name} in X.Xs", with an article for the Sun', () => {
    expect(targetFoundToast(getTarget('jupiter')!, 4234)).toBe('Found Jupiter in 4.2s');
    expect(targetFoundToast(getTarget('sun')!, 12000)).toBe('Found the Sun in 12.0s');
  });

  it('the Sun safety copy is as specified', () => {
    expect(SUN_SAFETY_BANNER).toBe(
      'Never look at the Sun — not directly, not through your camera.',
    );
    expect(SUN_CAMERA_NOTE).toBe('Camera is off for the Sun.');
  });
});
