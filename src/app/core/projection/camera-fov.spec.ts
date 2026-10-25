import { DEG, RAD } from '../math/vec3';
import { CameraFovInput, displayedVerticalFovDeg } from './camera-fov';

const base: CameraFovInput = {
  videoWidth: 1080,
  videoHeight: 1920,
  viewportWidth: 1080,
  viewportHeight: 1920,
  longSideFovDeg: 69,
};

describe('displayedVerticalFovDeg', () => {
  it('portrait video filling a same-aspect viewport: height is the long side, so vFov = L', () => {
    expect(displayedVerticalFovDeg(base)).toBeCloseTo(69, 9);
  });

  it('is scale-invariant in the viewport size', () => {
    expect(
      displayedVerticalFovDeg({ ...base, viewportWidth: 390, viewportHeight: 693.33 }),
    ).toBeCloseTo(69, 3);
  });

  it('wider-than-video viewport crops the height: smaller vFov', () => {
    // 1080x1920 video in a 1080x1500 viewport: scale 1, only 1500/1920 of the height is visible.
    const v = displayedVerticalFovDeg({ ...base, viewportHeight: 1500 });
    const expected = 2 * Math.atan(Math.tan(34.5 * DEG) * (1500 / 1920)) * RAD;
    expect(v).toBeCloseTo(expected, 9);
    expect(v).toBeLessThan(69);
  });

  it('taller-than-video viewport crops the width instead: height fully visible, vFov = L', () => {
    expect(displayedVerticalFovDeg({ ...base, viewportHeight: 2400 })).toBeCloseTo(69, 9);
  });

  it('square viewport: hand-computed 42.3° for a 1080x1920 video', () => {
    // s = 500/1080, visible height = 1080 of 1920 px -> fraction 0.5625.
    const v = displayedVerticalFovDeg({ ...base, viewportWidth: 500, viewportHeight: 500 });
    expect(v).toBeCloseTo(2 * Math.atan(Math.tan(34.5 * DEG) * 0.5625) * RAD, 9);
    expect(v).toBeCloseTo(42.3, 1);
  });

  it('symmetry: transposing video and viewport turns vFov into the horizontal FOV of the original', () => {
    // Horizontal FOV of the portrait case: width is the short side.
    const hFov = 2 * Math.atan(Math.tan(34.5 * DEG) * (1080 / 1920)) * RAD;
    const transposed = displayedVerticalFovDeg({
      videoWidth: 1920,
      videoHeight: 1080,
      viewportWidth: 1920,
      viewportHeight: 1080,
      longSideFovDeg: 69,
    });
    expect(transposed).toBeCloseTo(hFov, 9);
  });

  it('grows monotonically with the long-side FOV', () => {
    const a = displayedVerticalFovDeg({ ...base, longSideFovDeg: 50 });
    const b = displayedVerticalFovDeg({ ...base, longSideFovDeg: 80 });
    expect(a).toBeCloseTo(50, 9);
    expect(b).toBeCloseTo(80, 9);
  });
});
