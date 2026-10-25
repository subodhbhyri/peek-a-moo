import { Body, DefineStar, Equator, Horizon, Observer } from 'astronomy-engine';
import { wrap180 } from '../../math/vec3';
import { TARGETS, getTarget } from '../catalog';
import { computeTargetState } from '../compute';

const POS = { latitude: 39.6, longitude: -104.7, heightM: 1800 };
const FIXED = TARGETS.filter((t) => t.kind === 'fixed');
const at = (id: string, d: Date, pos = POS) => computeTargetState(getTarget(id)!, d, pos);

describe('catalog: fixed-sky entries', () => {
  it('has the five stars and five deep-sky objects with the specified J2000 coordinates', () => {
    const expected: Record<string, [number, number, number | null]> = {
      polaris: [2.530303, 89.264109, 1.98],
      sirius: [6.752478, -16.716116, -1.46],
      betelgeuse: [5.919529, 7.407064, 0.42],
      vega: [18.615649, 38.783689, 0.03],
      arcturus: [14.26102, 19.182409, -0.05],
      m31: [0.712306, 41.269167, 3.44],
      m42: [5.588139, -5.391111, 4.0],
      m45: [3.79, 24.116667, 1.6],
      'galactic-center': [17.761122, -29.007811, null],
      lmc: [5.392917, -69.756111, 0.9],
    };
    expect(FIXED.map((t) => t.id).sort()).toEqual(Object.keys(expected).sort());
    for (const [id, [ra, dec, mag]] of Object.entries(expected)) {
      const f = getTarget(id)!.fixed!;
      expect([f.raHours, f.decDeg, f.magnitude], id).toEqual([ra, dec, mag]);
    }
  });

  it('stars carry B-V and render as stars; deep sky carries size, PA and style', () => {
    for (const t of FIXED.filter((t) => t.category === 'stars')) {
      expect(t.render).toBe('star');
      expect(typeof t.fixed!.bv, t.id).toBe('number');
    }
    const sizes: Record<string, [[number, number], number, string]> = {
      m31: [[3.17, 1.0], 35, 'galaxy'],
      m42: [[1.42, 1.0], 0, 'nebula'],
      m45: [[1.83, 1.83], 0, 'cluster'],
      'galactic-center': [[2.0, 2.0], 0, 'marker'],
      lmc: [[10.75, 9.17], 170, 'galaxy'],
    };
    for (const [id, [size, pa, style]] of Object.entries(sizes)) {
      const t = getTarget(id)!;
      expect(t.render).toBe('extended');
      expect([t.fixed!.sizeDeg, t.fixed!.positionAngleDeg, t.fixed!.style], id).toEqual([
        size,
        pa,
        style,
      ]);
    }
    const bv: Record<string, number> = {
      polaris: 0.6,
      sirius: 0.0,
      betelgeuse: 1.85,
      vega: 0.0,
      arcturus: 1.23,
    };
    for (const [id, v] of Object.entries(bv)) expect(getTarget(id)!.fixed!.bv, id).toBe(v);
  });

  it('the Galactic Center blurb says it is hidden and not visible', () => {
    const b = getTarget('galactic-center')!.blurb;
    expect(b).toMatch(/hidden behind dust/i);
    expect(b).toMatch(/not visible to the eye/);
    expect(b).toMatch(/26,000 light-years/);
  });
});

describe('fixed-sky provider vs a second library path (DefineStar -> Equator -> Horizon)', () => {
  const dates = ['2026-10-25T09:54:00Z', '2027-03-14T02:00:00Z', '2028-07-01T21:30:00Z'].map(
    (d) => new Date(d),
  );
  it('agrees within 0.05 deg in altitude and azimuth for every fixed target', () => {
    const observer = new Observer(POS.latitude, POS.longitude, POS.heightM);
    for (const t of FIXED) {
      DefineStar(Body.Star1, t.fixed!.raHours, t.fixed!.decDeg, 1000);
      for (const d of dates) {
        const eq = Equator(Body.Star1, d, observer, true, true);
        const ref = Horizon(d, observer, eq.ra, eq.dec, 'normal');
        const got = at(t.id, d);
        expect(
          Math.abs(got.altitudeDeg - ref.altitude),
          `${t.id} alt ${d.toISOString()}`,
        ).toBeLessThan(0.05);
        // Azimuth is ill-conditioned right at the pole; scale by cos(alt) there.
        const dAz =
          Math.abs(wrap180(got.azimuthDeg - ref.azimuth)) *
          Math.cos((ref.altitude * Math.PI) / 180);
        expect(dAz, `${t.id} az ${d.toISOString()}`).toBeLessThan(0.05);
      }
    }
  });
});

/** Max/min altitude of a target sampled every 10 minutes over 48 hours. */
function altitudeRange(id: string, pos: typeof POS, start = Date.UTC(2026, 9, 25)) {
  let min = Infinity;
  let max = -Infinity;
  for (let t = start; t <= start + 48 * 3_600_000; t += 600_000) {
    const alt = at(id, new Date(t), pos).altitudeDeg;
    min = Math.min(min, alt);
    max = Math.max(max, alt);
  }
  return { min, max };
}

describe('fixed-sky provider: independent geometry', () => {
  it('Polaris altitude stays within 1.0 deg of the latitude over 48 h at lat 39.6', () => {
    const { min, max } = altitudeRange('polaris', POS);
    expect(min).toBeGreaterThan(POS.latitude - 1.0);
    expect(max).toBeLessThan(POS.latitude + 1.0);
  });

  it('Polaris is always below the horizon at lat -30', () => {
    expect(altitudeRange('polaris', { ...POS, latitude: -30 }).max).toBeLessThan(0);
  });

  it('Vega culminates at 90 - |lat - dec| (within 0.3 deg)', () => {
    const { max } = altitudeRange('vega', POS);
    expect(Math.abs(max - (90 - Math.abs(POS.latitude - 38.783689)))).toBeLessThan(0.3);
  });

  it('the LMC never rises above 0 deg at lat 39.6', () => {
    expect(altitudeRange('lmc', POS).max).toBeLessThan(0);
  });

  it('M31 at 2026-10-25T09:54Z from lat 39.6, lon -104.7 is near alt 40.7, az 294.9 (planning reference)', () => {
    const s = at('m31', new Date('2026-10-25T09:54:00Z'));
    expect(Math.abs(s.altitudeDeg - 40.7)).toBeLessThan(0.1);
    expect(Math.abs(wrap180(s.azimuthDeg - 294.9))).toBeLessThan(0.1);
  });
});

describe('fixed-sky provider: state shape', () => {
  const d = new Date('2026-10-25T09:54:00Z');

  it('uses the catalog magnitude, major axis as size (0 for stars), and the celestial pole', () => {
    const star = at('sirius', d);
    expect(star.magnitude).toBe(-1.46);
    expect(star.angularSizeDeg).toBe(0);
    expect(star.skyNorthDirection![1]).toBeCloseTo(Math.cos((POS.latitude * Math.PI) / 180), 12);
    expect(at('m31', d).angularSizeDeg).toBe(3.17);
    expect(at('lmc', d).angularSizeDeg).toBe(10.75);
    expect(at('galactic-center', d).magnitude).toBeNull();
  });

  it('direction is a unit vector matching the reported az/alt', () => {
    const s = at('vega', d);
    expect(Math.hypot(...s.direction)).toBeCloseTo(1, 12);
    expect(s.direction[2]).toBeCloseTo(Math.sin((s.altitudeDeg * Math.PI) / 180), 12);
  });

  it('the cached rotation gives the same answer for repeated and sub-second-apart calls', () => {
    const a = at('vega', d);
    const b = at('vega', d);
    const c = at('vega', new Date(d.getTime() + 400)); // same 1 s bucket
    expect(b.altitudeDeg).toBe(a.altitudeDeg);
    expect(c.altitudeDeg).toBe(a.altitudeDeg);
    // A different observer must not reuse the cached matrix.
    const elsewhere = at('vega', d, { ...POS, longitude: POS.longitude + 40 });
    expect(Math.abs(elsewhere.azimuthDeg - a.azimuthDeg)).toBeGreaterThan(1);
    // A different second changes the answer (Earth turns 15 arcsec per second).
    expect(at('vega', new Date(d.getTime() + 60_000)).azimuthDeg).not.toBe(a.azimuthDeg);
  });
});
