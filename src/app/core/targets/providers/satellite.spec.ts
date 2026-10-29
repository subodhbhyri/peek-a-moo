import { geodeticToEcf, sgp4, twoline2satrec } from '../../satellite-lib';
import { FIXTURE_ELEMENTS } from '../../gp/testing/gp-fixture';
import { epochMs, type OmmRecord } from '../../gp/gp.types';
import { angleBetweenDeg, Vec3 } from '../../math/vec3';
import { getTarget } from '../catalog';
import { computeTargetState } from '../compute';
import {
  SatelliteDataError,
  isSunlit,
  lookAngles,
  observerGeodetic,
  satelliteFix,
  satelliteTargetState,
  satrecFor,
  sunForSatellites,
} from './satellite';

const POS = { latitude: 39.6, longitude: -104.7, heightM: 1800 };
/** TEME position (km) of a satrec `min` minutes after its epoch. */
const pos = (rec: Parameters<typeof sgp4>[0], min: number) => {
  const r = sgp4(rec, min);
  if (!r || typeof r.position === 'boolean') throw new Error('SGP4 failed');
  return r.position;
};
const km = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

describe('SGP4 through our wrappers: Vallado verification vector (catalog 00005)', () => {
  // https://celestrak.org/publications/AIAA/2006-6753/ , SGP4-VER.TLE
  const L1 = '1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753';
  const L2 = '2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667';
  const EXPECTED_0 = { x: 7022.46529266, y: -1400.08296755, z: 0.03995155 };
  const EXPECTED_360 = { x: -7154.03120202, y: -3783.17682504, z: -3536.19412294 };

  // The same element set as a CelesTrak OMM record (epoch 2000 day 179.78495062 = 18:50:19.733568 UTC).
  const OMM: OmmRecord = {
    OBJECT_NAME: 'VANGUARD 1',
    OBJECT_ID: '1958-002B',
    EPOCH: '2000-06-27T18:50:19.733568',
    MEAN_MOTION: 10.82419157,
    ECCENTRICITY: 0.1859667,
    INCLINATION: 34.2682,
    RA_OF_ASC_NODE: 348.7242,
    ARG_OF_PERICENTER: 331.7664,
    MEAN_ANOMALY: 19.3264,
    EPHEMERIS_TYPE: 0,
    CLASSIFICATION_TYPE: 'U',
    NORAD_CAT_ID: 5,
    ELEMENT_SET_NO: 475,
    REV_AT_EPOCH: 41366,
    BSTAR: 0.000028098,
    MEAN_MOTION_DOT: 0.00000023,
    MEAN_MOTION_DDOT: 0,
  };

  it('the TLE path reproduces the published TEME positions within 1e-3 km', () => {
    const rec = twoline2satrec(L1, L2);
    expect(km(pos(rec, 0), EXPECTED_0)).toBeLessThan(1e-3);
    expect(km(pos(rec, 360), EXPECTED_360)).toBeLessThan(1e-3);
  });

  it('the OMM path (json2satrec via satrecFor) reproduces them too, and agrees with the TLE path within 1 m at 720 min', () => {
    const tle = twoline2satrec(L1, L2);
    const omm = satrecFor(OMM);
    expect(km(pos(omm, 0), EXPECTED_0)).toBeLessThan(1e-3);
    expect(km(pos(omm, 360), EXPECTED_360)).toBeLessThan(1e-3);
    expect(km(pos(omm, 720), pos(tle, 720))).toBeLessThan(1e-3);
  });

  it('propagating by Date lands on the same vector (epoch parsed as UTC)', () => {
    const when = new Date(epochMs(OMM) + 360 * 60_000);
    // Date has millisecond resolution: 0.4 ms at ~8 km/s is a few metres.
    const rec = satrecFor(OMM);
    const eci = satelliteFix(rec, when, observerGeodetic(POS)).eci;
    expect(
      Math.hypot(eci[0] - EXPECTED_360.x, eci[1] - EXPECTED_360.y, eci[2] - EXPECTED_360.z),
    ).toBeLessThan(0.05);
  });

  it('caches one satrec per NORAD id + epoch', () => {
    expect(satrecFor(OMM)).toBe(satrecFor({ ...OMM }));
    expect(satrecFor({ ...OMM, EPOCH: '2000-06-28T00:00:00' })).not.toBe(satrecFor(OMM));
  });
});

describe('look angles', () => {
  const obs = observerGeodetic({ latitude: 39.6, longitude: -104.7, heightM: 0 });
  const here = geodeticToEcf(obs);
  const lat = obs.latitude;
  const lon = obs.longitude;
  const up = {
    x: Math.cos(lat) * Math.cos(lon),
    y: Math.cos(lat) * Math.sin(lon),
    z: Math.sin(lat),
  };
  const north = {
    x: -Math.sin(lat) * Math.cos(lon),
    y: -Math.sin(lat) * Math.sin(lon),
    z: Math.cos(lat),
  };
  const offset = (v: { x: number; y: number; z: number }, d: number) => ({
    x: here.x + v.x * d,
    y: here.y + v.y * d,
    z: here.z + v.z * d,
  });

  it('a satellite 400 km straight up is at elevation 90 degrees', () => {
    const l = lookAngles(obs, offset(up, 400));
    expect(l.elevationDeg).toBeCloseTo(90, 1);
    expect(l.rangeKm).toBeCloseTo(400, 3);
  });

  it('one 400 km along the northern tangent is due north on the horizon', () => {
    const l = lookAngles(obs, offset(north, 400));
    expect(Math.abs(((l.azimuthDeg + 180) % 360) - 180)).toBeLessThan(0.01);
    expect(Math.abs(l.elevationDeg)).toBeLessThan(0.01);
  });

  it('one 400 km along the northern tangent and 10 km up: due north, small positive elevation', () => {
    const p = offset(north, 400);
    const l = lookAngles(obs, { x: p.x + up.x * 10, y: p.y + up.y * 10, z: p.z + up.z * 10 });
    const az = ((l.azimuthDeg + 180) % 360) - 180;
    expect(Math.abs(az)).toBeLessThan(0.01);
    expect(l.elevationDeg).toBeGreaterThan(0);
    expect(l.elevationDeg).toBeLessThan(3);
  });

  it('a satellite 400 km high over a point 400 km north is north and well up', () => {
    const point = geodeticToEcf({ latitude: lat + 400 / 6371, longitude: lon, height: 400 });
    const l = lookAngles(obs, point);
    const az = ((l.azimuthDeg + 180) % 360) - 180;
    expect(Math.abs(az)).toBeLessThan(1);
    expect(l.elevationDeg).toBeGreaterThan(30);
    expect(l.elevationDeg).toBeLessThan(60);
  });
});

describe('Earth shadow (cylindrical)', () => {
  const sun: Vec3 = [1, 0, 0];
  it('on the Sun side: sunlit', () => {
    expect(isSunlit([7000, 0, 0], sun)).toBe(true);
    expect(isSunlit([0, 7000, 0], sun)).toBe(true);
  });
  it('directly behind the Earth: in shadow', () => {
    expect(isSunlit([-7000, 0, 0], sun)).toBe(false);
  });
  it('behind but offset 7000 km sideways: sunlit again', () => {
    expect(isSunlit([-7000, 7000, 0], sun)).toBe(true);
    expect(isSunlit([-7000, 0, 7000], sun)).toBe(true);
  });
  it('the shadow edge is one Earth radius from the axis', () => {
    expect(isSunlit([-7000, 6377, 0], sun)).toBe(false);
    expect(isSunlit([-7000, 6379, 0], sun)).toBe(true);
  });
  it('works for a tilted Sun direction', () => {
    const s: Vec3 = [0.6, 0.8, 0];
    expect(isSunlit([-7000 * 0.6, -7000 * 0.8, 0], s)).toBe(false);
  });
});

describe('satellite provider', () => {
  const iss = getTarget('iss')!;
  const T0 = new Date('2026-10-28T20:00:00Z');

  it('fills the satellite fields: 12-point trail, range, age, magnitude from the catalog when sunlit', () => {
    // Scan one orbit for a sunlit and an in-shadow moment.
    let sunlit: ReturnType<typeof satelliteTargetState> | null = null;
    let shadow: ReturnType<typeof satelliteTargetState> | null = null;
    for (let m = 0; m < 95 && !(sunlit && shadow); m++) {
      const s = satelliteTargetState(
        iss,
        new Date(T0.getTime() + m * 60_000),
        POS,
        FIXTURE_ELEMENTS,
      );
      if (s.satellite!.sunlit) sunlit ??= s;
      else shadow ??= s;
    }
    expect(sunlit && shadow).toBeTruthy();
    expect(sunlit!.magnitude).toBe(-3.5);
    expect(shadow!.magnitude).toBeNull();
    const sat = sunlit!.satellite!;
    expect(sat.trail).toHaveLength(12);
    expect(sat.rangeKm).toBeGreaterThan(380);
    expect(sat.rangeKm).toBeLessThan(13_000);
    expect(sat.ageDays).toBeGreaterThan(0.2);
    expect(sat.ageDays).toBeLessThan(1);
    expect(sat.approximate).toBe(false);
    expect(sat.stale).toBe(false);
    expect(sunlit!.angularSizeDeg).toBe(0);
    expect(sunlit!.sunAltitudeDeg).toBeDefined();
  });

  it('the trail runs backward in time along the track: each point about a second behind the last', () => {
    // Find a moment when the ISS is above the horizon, so the angular speed is large and visible.
    let state = null as ReturnType<typeof satelliteTargetState> | null;
    for (let m = 0; m < 24 * 60 && !state; m++) {
      const s = satelliteTargetState(
        iss,
        new Date(T0.getTime() + m * 60_000),
        POS,
        FIXTURE_ELEMENTS,
      );
      if (s.altitudeDeg > 30) state = s;
    }
    expect(state).not.toBeNull();
    const trail = state!.satellite!.trail;
    const steps = [state!.direction, ...trail]
      .slice(0, -1)
      .map((d, i) => angleBetweenDeg(d, [state!.direction, ...trail][i + 1]));
    for (const s of steps) {
      expect(s).toBeGreaterThan(0.05);
      expect(s).toBeLessThan(2);
    }
  });

  it('is never NaN for a valid record, +-3 days from the epoch', () => {
    for (const id of ['iss', 'tiangong', 'hubble']) {
      const def = getTarget(id)!;
      const epoch = epochMs(FIXTURE_ELEMENTS.get(def.satellite!.noradId)!);
      for (let h = -72; h <= 72; h += 3) {
        const s = satelliteTargetState(def, new Date(epoch + h * 3_600_000), POS, FIXTURE_ELEMENTS);
        const nums = [
          ...s.direction,
          s.azimuthDeg,
          s.altitudeDeg,
          s.satellite!.rangeKm,
          s.satellite!.ageDays,
          ...s.satellite!.trail.flat(),
        ];
        for (const n of nums) expect(Number.isFinite(n), `${id} ${h}h`).toBe(true);
        expect(Math.hypot(...s.direction)).toBeCloseTo(1, 9);
      }
    }
  });

  it('flags element age: approximate at 3-14 days, stale beyond', () => {
    const epoch = epochMs(FIXTURE_ELEMENTS.get(25544)!);
    const at = (days: number) =>
      satelliteTargetState(iss, new Date(epoch + days * 86_400_000), POS, FIXTURE_ELEMENTS)
        .satellite!;
    expect(at(2.9)).toMatchObject({ approximate: false, stale: false });
    expect(at(3.1)).toMatchObject({ approximate: true, stale: false });
    expect(at(13.9)).toMatchObject({ approximate: true, stale: false });
    expect(at(14.1)).toMatchObject({ approximate: false, stale: true });
  });

  it('agrees with a star at the same spot on refraction: low satellites are lifted like everything else', () => {
    let low = null as ReturnType<typeof satelliteTargetState> | null;
    for (let m = 0; m < 3 * 24 * 60 && !low; m++) {
      const s = satelliteTargetState(
        iss,
        new Date(T0.getTime() + m * 60_000),
        POS,
        FIXTURE_ELEMENTS,
      );
      if (s.altitudeDeg > 0.5 && s.altitudeDeg < 3) low = s;
    }
    expect(low).not.toBeNull();
    const fix = satelliteFix(
      satrecFor(FIXTURE_ELEMENTS.get(25544)!),
      low!.computedAt,
      observerGeodetic(POS),
    );
    // Refraction near the horizon is a fraction of a degree, always upward.
    expect(low!.altitudeDeg - fix.elevationDeg).toBeGreaterThan(0.1);
    expect(low!.altitudeDeg - fix.elevationDeg).toBeLessThan(0.6);
  });

  it('throws a typed error without orbit data, and for an orbit SGP4 cannot propagate', () => {
    expect(() => satelliteTargetState(iss, T0, POS, undefined)).toThrow(SatelliteDataError);
    expect(() => satelliteTargetState(iss, T0, POS, new Map())).toThrow(/orbit data is not loaded/);
    const doomed: OmmRecord = {
      ...FIXTURE_ELEMENTS.get(25544)!,
      EPOCH: '2026-10-28T00:00:00',
      ECCENTRICITY: 0.99,
      MEAN_MOTION: 15.5,
      BSTAR: 0.9,
    };
    let err: unknown;
    try {
      satelliteTargetState(iss, new Date('2026-12-30T00:00:00Z'), POS, new Map([[25544, doomed]]));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SatelliteDataError);
    expect((err as SatelliteDataError).code).toBe('propagation-failed');
  });

  it('computeTargetState dispatches satellites to the provider', () => {
    const s = computeTargetState(iss, T0, POS, FIXTURE_ELEMENTS);
    expect(s.id).toBe('iss');
    expect(s.satellite).toBeDefined();
  });
});

describe('sun for satellites', () => {
  it('is a unit vector and its altitude matches the time of day', () => {
    const noon = sunForSatellites(new Date('2026-06-21T18:30:00Z'), POS); // ~local noon in Colorado
    const midnight = sunForSatellites(new Date('2026-06-21T06:30:00Z'), POS);
    expect(Math.hypot(...noon.unit)).toBeCloseTo(1, 9);
    expect(noon.altitudeDeg).toBeGreaterThan(60);
    expect(midnight.altitudeDeg).toBeLessThan(-20);
  });
});
