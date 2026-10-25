import { Body, Elongation } from 'astronomy-engine';
import { angleBetweenDeg, dot } from '../../math/vec3';
import { brightLimbScreenAngle } from '../../projection/projection';
import { CameraBasis, cameraBasisFromAzAlt } from '../../sensors/orientation-math';
import { getTarget } from '../catalog';
import { computeTargetState } from '../compute';
import { moonTargetState } from './moon';

const POS = { latitude: 39.6, longitude: -104.7, heightM: 1800 };
const WEEK_MS = 7 * 86_400_000;
const START = Date.UTC(2026, 0, 1);
const END = Date.UTC(2030, 11, 31);

function weekly(): Date[] {
  const out: Date[] = [];
  for (let t = START; t <= END; t += WEEK_MS) out.push(new Date(t));
  return out;
}
const DATES = weekly();

const state = (id: string, d: Date) => computeTargetState(getTarget(id)!, d, POS);
const ARCSEC = 3600;

describe('solar-system provider: angular size vs published ranges (weekly 2026-2030)', () => {
  const ranges: [string, number, number][] = [
    ['mercury', 4.5, 13.0],
    ['venus', 9.5, 66.0],
    ['mars', 3.5, 25.2],
    ['jupiter', 29.5, 50.2],
    ['saturn', 14.5, 20.8],
    ['uranus', 3.3, 4.1],
    ['neptune', 2.2, 2.4],
  ];
  for (const [id, lo, hi] of ranges) {
    it(`${id} stays within ${lo}-${hi} arcsec`, () => {
      let min = Infinity;
      let max = -Infinity;
      for (const d of DATES) {
        const s = state(id, d).angularSizeDeg * ARCSEC;
        min = Math.min(min, s);
        max = Math.max(max, s);
      }
      expect(min).toBeGreaterThanOrEqual(lo);
      expect(max).toBeLessThanOrEqual(hi);
      // And it actually varies, rather than being a constant.
      expect(max).toBeGreaterThan(min);
    });
  }

  it('sun stays within 31.4-32.7 arcmin', () => {
    for (const d of DATES) {
      const arcmin = state('sun', d).angularSizeDeg * 60;
      expect(arcmin).toBeGreaterThanOrEqual(31.4);
      expect(arcmin).toBeLessThanOrEqual(32.7);
    }
  });
});

describe('solar-system provider: magnitudes (weekly 2026-2030)', () => {
  const ranges: [string, number, number][] = [
    ['venus', -4.9, -3.8],
    ['jupiter', -2.95, -1.6],
    ['mars', -2.95, 1.9],
    ['saturn', -0.6, 1.5],
  ];
  for (const [id, lo, hi] of ranges) {
    it(`${id} stays within ${lo}..${hi}`, () => {
      for (const d of DATES) {
        const m = state(id, d).magnitude!;
        expect(m, `${id} ${d.toISOString()}`).toBeGreaterThanOrEqual(lo);
        expect(m, `${id} ${d.toISOString()}`).toBeLessThanOrEqual(hi);
      }
    });
  }

  it('sun is a constant -26.7', () => {
    expect(state('sun', DATES[0]).magnitude).toBe(-26.7);
  });
});

describe('solar-system provider: structure', () => {
  const d = new Date('2026-10-26T15:00:00Z');

  it('Sun direction equals the Moon provider sunDirection at the same instant (1e-9)', () => {
    const sun = state('sun', d).direction;
    const viaMoon = moonTargetState(d, POS).sunDirection!;
    sun.forEach((v, i) => expect(Math.abs(v - viaMoon[i])).toBeLessThan(1e-9));
    expect(state('sun', d).sunAltitudeDeg).toBeUndefined();
  });

  it('every planet carries a sunDirection; the Sun does not', () => {
    for (const id of ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']) {
      expect(state(id, d).sunDirection, id).toBeDefined();
    }
    expect(state('sun', d).sunDirection).toBeUndefined();
  });

  it('only Mercury and Venus have phases; only Saturn has rings', () => {
    for (const id of ['mercury', 'venus']) {
      const p = state(id, d).phase!;
      expect(p.illuminatedFraction).toBeGreaterThan(0);
      expect(p.illuminatedFraction).toBeLessThanOrEqual(1);
    }
    for (const id of ['mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'sun']) {
      expect(state(id, d).phase, id).toBeUndefined();
    }
    expect(Math.abs(state('saturn', d).rings!.tiltDeg)).toBeLessThanOrEqual(28);
    expect(state('jupiter', d).rings).toBeUndefined();
  });

  it('Venus illuminated fraction spans thin crescent to near full over the period', () => {
    let min = 1;
    let max = 0;
    for (const dt of DATES) {
      const f = state('venus', dt).phase!.illuminatedFraction;
      min = Math.min(min, f);
      max = Math.max(max, f);
    }
    expect(min).toBeLessThan(0.1);
    expect(max).toBeGreaterThan(0.9);
  });
});

describe('solar-system provider: elongation oracle', () => {
  it('angle between planet and Sun matches astronomy-engine Elongation within 0.5 deg', () => {
    const bodies: [string, Body][] = [
      ['mercury', Body.Mercury],
      ['venus', Body.Venus],
      ['mars', Body.Mars],
      ['jupiter', Body.Jupiter],
      ['saturn', Body.Saturn],
    ];
    let checked = 0;
    for (const [id, body] of bodies) {
      for (const dt of DATES) {
        const s = state(id, dt);
        const sun = state('sun', dt);
        // Both clear of the horizon, so refraction (which we include and Elongation does not) is negligible.
        if (s.altitudeDeg < 15 || sun.altitudeDeg < 15) continue;
        const ours = angleBetweenDeg(s.direction, sun.direction);
        expect(
          Math.abs(ours - Elongation(body, dt).elongation),
          `${id} ${dt.toISOString()}`,
        ).toBeLessThan(0.5);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });
});

describe('solar-system provider: lit limb points toward the Sun', () => {
  const roll = (b: CameraBasis, deg: number): CameraBasis => {
    const t = (deg * Math.PI) / 180;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const mix = (a: CameraBasis['up'], b2: CameraBasis['up'], ca: number, cb: number) =>
      [0, 1, 2].map((i) => ca * a[i] + cb * b2[i]) as unknown as CameraBasis['up'];
    return { forward: b.forward, up: mix(b.up, b.right, c, s), right: mix(b.right, b.up, c, -s) };
  };

  it('for Mercury and Venus across dates and phone rolls', () => {
    let checked = 0;
    for (const id of ['mercury', 'venus']) {
      for (const dt of DATES.filter((_, i) => i % 9 === 0)) {
        const s = state(id, dt);
        const sunDir = s.sunDirection!;
        if (angleBetweenDeg(s.direction, sunDir) < 10) continue; // limb undefined near conjunction
        for (const r of [0, 33, -110, 200]) {
          const cam = roll(cameraBasisFromAzAlt(s.azimuthDeg, s.altitudeDeg), r);
          const a = brightLimbScreenAngle(s.direction, sunDir, cam);
          // The planet is at the screen center, so the Sun's offset from it is just its projection.
          const sunX = dot(sunDir, cam.right);
          const sunY = dot(sunDir, cam.up);
          expect(
            Math.cos(a) * sunX + Math.sin(a) * sunY,
            `${id} ${dt.toISOString()} roll ${r}`,
          ).toBeGreaterThan(0);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(40);
  });
});
