import { TestBed } from '@angular/core/testing';
import { DEG, column, dot, wrap180, wrap360 } from '../math/vec3';
import { OrientationService } from './orientation.service';
import { cameraBasisFromRotation, describeBasis, rotationFromEuler } from './orientation-math';

/**
 * Independent oracles for the sensor pipeline: formulas taken from the W3C DeviceOrientation spec,
 * not from our own conventions.
 */

/** W3C DeviceOrientation spec: compass heading of the direction the back of the device points. */
function specCompassHeading(alpha: number, beta: number, gamma: number): number {
  const x = beta * DEG,
    y = gamma * DEG,
    z = alpha * DEG;
  // (The spec's cX is not needed for the back-direction heading.)
  const cY = Math.cos(y),
    cZ = Math.cos(z);
  const sX = Math.sin(x),
    sY = Math.sin(y),
    sZ = Math.sin(z);
  const Vx = -cZ * sY - sZ * sX * cY;
  const Vy = -sZ * sY + cZ * sX * cY;
  return wrap360(Math.atan2(Vx, Vy) / DEG);
}

/** Small seeded PRNG so failures are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('oracle: W3C spec compass formula', () => {
  it('matches describeBasis azimuth for 500+ seeded random orientations', () => {
    const rnd = mulberry32(20240607);
    let checked = 0;
    while (checked < 600) {
      const alpha = rnd() * 360;
      const beta = rnd() * 360 - 180;
      const gamma = rnd() * 180 - 90;
      const r = rotationFromEuler(alpha, beta, gamma);
      const back = [-column(r, 2)[0], -column(r, 2)[1]];
      if (Math.hypot(back[0], back[1]) < 0.2) continue;
      const ours = describeBasis(cameraBasisFromRotation(r, 0)).azimuthDeg;
      const spec = specCompassHeading(alpha, beta, gamma);
      const diff = Math.abs(wrap180(ours - spec));
      expect(diff, `alpha=${alpha} beta=${beta} gamma=${gamma}`).toBeLessThan(1e-6);
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(500);
  });
});

describe('oracle: flat top-edge heading', () => {
  it('heading of the +y column for a flat phone is wrap360(360 - alpha)', () => {
    for (const alpha of [0, 1, 37, 90, 133.5, 180, 271, 359.9]) {
      const y = column(rotationFromEuler(alpha, 0, 0), 1);
      const heading = wrap360(Math.atan2(y[0], y[1]) / DEG);
      expect(Math.abs(wrap180(heading - wrap360(360 - alpha)))).toBeLessThan(1e-9);
      expect(dot(y, [0, 0, 1])).toBeCloseTo(0, 12);
    }
  });
});

describe('oracle: declination round trip through OrientationService', () => {
  const originalOnAbs = (window as unknown as Record<string, unknown>)[
    'ondeviceorientationabsolute'
  ];

  beforeEach(() => {
    // Make the service pick the north-referenced event, as Android Chrome does.
    (window as unknown as Record<string, unknown>)['ondeviceorientationabsolute'] = null;
  });

  afterEach(() => {
    if (originalOnAbs === undefined) {
      delete (window as unknown as Record<string, unknown>)['ondeviceorientationabsolute'];
    } else {
      (window as unknown as Record<string, unknown>)['ondeviceorientationabsolute'] = originalOnAbs;
    }
  });

  function publishedAzimuth(declination: number, alpha: number): number {
    const svc = TestBed.inject(OrientationService);
    svc.setDeclination(declination);
    svc.start();
    const ev = new Event('deviceorientationabsolute');
    Object.assign(ev, { alpha, beta: 90, gamma: 0, absolute: true });
    window.dispatchEvent(ev);
    const b = svc.basis();
    svc.stop();
    expect(b).not.toBeNull();
    return describeBasis(b!).azimuthDeg;
  }

  it('pointing azimuth equals wrap360(360 - alpha + D)', () => {
    for (const D of [-14.5, 0, 3.2, 12]) {
      for (const a of [0, 45, 90, 181, 270, 355]) {
        const az = publishedAzimuth(D, a);
        expect(Math.abs(wrap180(az - wrap360(360 - a + D))), `D=${D} a=${a}`).toBeLessThan(1e-6);
      }
    }
  });
});
