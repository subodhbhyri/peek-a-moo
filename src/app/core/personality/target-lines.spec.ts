import { TARGETS, getTarget } from '../targets/catalog';
import {
  NOT_VISIBLE_NOTE,
  SUN_CAMERA_NOTE,
  SUN_SAFETY_BANNER,
  isNotNakedEye,
  satelliteFoundNote,
  targetFoundToast,
} from './target-lines';

describe('target found lines', () => {
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

  it('flags targets that are not naked-eye: magnitude null or fainter than 6', () => {
    expect(isNotNakedEye(null)).toBe(true);
    expect(isNotNakedEye(7.8)).toBe(true);
    expect(isNotNakedEye(6.01)).toBe(true);
    expect(isNotNakedEye(6)).toBe(false);
    expect(isNotNakedEye(-1.46)).toBe(false);
    const flagged = TARGETS.filter((t) => t.fixed && isNotNakedEye(t.fixed.magnitude)).map(
      (t) => t.id,
    );
    expect(flagged).toEqual(['galactic-center']);
    expect(NOT_VISIBLE_NOTE).toBe("Not visible to the eye — it's there, behind dust.");
  });
});

describe('satellite found moment', () => {
  it('uses the sentence name in the toast', () => {
    expect(targetFoundToast(getTarget('iss')!, 4234)).toBe('Found the ISS in 4.2s');
    expect(targetFoundToast(getTarget('tiangong')!, 4234)).toBe('Found Tiangong in 4.2s');
    expect(targetFoundToast(getTarget('hubble')!, 4234)).toBe('Found Hubble in 4.2s');
  });

  it("in Earth's shadow it says so; in daylight it says the sky is too bright; otherwise nothing", () => {
    expect(satelliteFoundNote(false, -30)).toBe(
      "It's in Earth's shadow right now — invisible, but right there.",
    );
    expect(satelliteFoundNote(true, 20)).toBe(
      "The sky's too bright to see it — but it's right there.",
    );
    expect(satelliteFoundNote(true, -20)).toBeNull();
    expect(satelliteFoundNote(true, undefined)).toBeNull();
  });
});
