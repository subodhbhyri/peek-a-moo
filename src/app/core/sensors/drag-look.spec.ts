import { dragToLook, keyToLook } from './drag-look';

describe('dragToLook', () => {
  it('dragging right increases azimuth (looking right)', () => {
    const r = dragToLook({ azimuthDeg: 0, altitudeDeg: 0 }, 40, 0, 0.25);
    expect(r.azimuthDeg).toBeCloseTo(10, 9);
  });

  it('dragging up (negative deltaY) increases altitude', () => {
    const r = dragToLook({ azimuthDeg: 0, altitudeDeg: 0 }, 0, -40, 0.25);
    expect(r.altitudeDeg).toBeCloseTo(10, 9);
  });

  it('wraps azimuth past 360', () => {
    const r = dragToLook({ azimuthDeg: 350, altitudeDeg: 0 }, 80, 0, 0.25);
    expect(r.azimuthDeg).toBeCloseTo(10, 9);
  });

  it('clamps altitude just short of the poles', () => {
    const r = dragToLook({ azimuthDeg: 0, altitudeDeg: 85 }, 0, -1000, 1);
    expect(r.altitudeDeg).toBe(89);
  });
});

describe('keyToLook', () => {
  it('arrow keys nudge azimuth and altitude', () => {
    expect(keyToLook({ azimuthDeg: 10, altitudeDeg: 0 }, 'ArrowRight', 5)?.azimuthDeg).toBeCloseTo(
      15,
      9,
    );
    expect(keyToLook({ azimuthDeg: 10, altitudeDeg: 0 }, 'ArrowLeft', 5)?.azimuthDeg).toBeCloseTo(
      5,
      9,
    );
    expect(keyToLook({ azimuthDeg: 0, altitudeDeg: 10 }, 'ArrowUp', 5)?.altitudeDeg).toBeCloseTo(
      15,
      9,
    );
    expect(keyToLook({ azimuthDeg: 0, altitudeDeg: 10 }, 'ArrowDown', 5)?.altitudeDeg).toBeCloseTo(
      5,
      9,
    );
  });

  it('ignores other keys', () => {
    expect(keyToLook({ azimuthDeg: 0, altitudeDeg: 0 }, 'Tab')).toBeNull();
  });
});
