import {
  HorizonFromVector,
  MakeTime,
  Observer,
  RotateVector,
  Rotation_EQJ_HOR,
  Spherical,
  VectorFromSphere,
} from 'astronomy-engine';
import { angleBetweenDeg, directionFromAzAlt } from '../math/vec3';
import { projectDirection } from '../projection/projection';
import { cameraBasisFromAzAlt } from '../sensors/orientation-math';
import { TARGETS } from '../targets/catalog';
import { fixedSkyTargetState } from '../targets/providers/fixed-sky';
import { SkyField } from './sky-field';
import { skyGeometry } from './testing/sky-fixture';

const OVERLAP = ['polaris', 'sirius', 'betelgeuse', 'vega', 'arcturus'];
const DATES = ['2026-10-29T03:00:00Z', '2026-03-01T22:30:00Z', '2026-07-15T11:00:00Z'].map(
  (d) => new Date(d),
);
const PLACES = [
  { name: 'Denver', latitude: 39.6, longitude: -104.7, heightM: 1800 },
  { name: 'Sydney', latitude: -33.87, longitude: 151.2, heightM: 0 },
  { name: 'Abu Dhabi', latitude: 24.45, longitude: 54.38, heightM: 0 },
];

/** The sky.json star nearest a catalog fixed-sky target. */
function starIndexFor(id: string): number {
  const def = TARGETS.find((t) => t.id === id)!;
  const f = def.fixed!;
  const want = VectorFromSphere(new Spherical(f.decDeg, f.raHours * 15, 1), new Date());
  const g = skyGeometry();
  let best = { i: -1, d: Infinity };
  for (let i = 0; i < g.starCount; i++) {
    const d = angleBetweenDeg(
      [g.starEqj[i * 3], g.starEqj[i * 3 + 1], g.starEqj[i * 3 + 2]],
      [want.x, want.y, want.z],
    );
    if (d < best.d) best = { i, d };
  }
  expect(best.d, `${id}: nearest sky.json star is ${best.d} degrees away`).toBeLessThan(0.1);
  return best.i;
}

describe('horizon -> ENU axis mapping (derived from the 5-star overlap, not assumed)', () => {
  /** Geometric (no refraction) horizontal vectors from astronomy-engine, and the ENU vector for the same star. */
  function samples() {
    const out: { hor: number[]; enu: number[] }[] = [];
    const place = PLACES[0];
    const observer = new Observer(place.latitude, place.longitude, place.heightM);
    for (const date of DATES) {
      const t = MakeTime(date);
      const rot = Rotation_EQJ_HOR(t, observer);
      for (const id of OVERLAP) {
        const f = TARGETS.find((x) => x.id === id)!.fixed!;
        const v = VectorFromSphere(new Spherical(f.decDeg, f.raHours * 15, 1), t);
        const h = RotateVector(rot, v);
        const hz = HorizonFromVector(h, ''); // lat = altitude, lon = azimuth clockwise from north
        out.push({ hor: [h.x, h.y, h.z], enu: Array.from(directionFromAzAlt(hz.lon, hz.lat)) });
      }
    }
    return out;
  }

  it('exactly one of the 48 signed axis permutations maps astronomy-engine HOR to our ENU: E = -y, N = x, U = z', () => {
    const rows = samples();
    const perms = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ];
    const matches: { idx: number[]; sign: number[] }[] = [];
    for (const idx of perms) {
      for (let s = 0; s < 8; s++) {
        const sign = [s & 1 ? -1 : 1, s & 2 ? -1 : 1, s & 4 ? -1 : 1];
        const worst = Math.max(
          ...rows.flatMap((r) =>
            [0, 1, 2].map((i) => Math.abs(sign[i] * r.hor[idx[i]] - r.enu[i])),
          ),
        );
        if (worst < 1e-9) matches.push({ idx, sign });
      }
    }
    expect(rows).toHaveLength(15);
    expect(matches).toEqual([{ idx: [1, 0, 2], sign: [-1, 1, 1] }]);
  });
});

describe('SkyField transform vs the Phase 4 fixed-sky provider', () => {
  it('the five catalog stars that are also background stars agree within 0.02 degrees at 3 dates (3 places, refraction included)', () => {
    const field = new SkyField(skyGeometry());
    let worst = 0;
    let pairs = 0;
    let belowHorizon = 0;
    for (const place of PLACES) {
      for (const date of DATES) {
        field.update(date, place);
        for (const id of OVERLAP) {
          const i = starIndexFor(id);
          const ours: [number, number, number] = [
            field.starEnu[i * 3],
            field.starEnu[i * 3 + 1],
            field.starEnu[i * 3 + 2],
          ];
          const state = fixedSkyTargetState(
            TARGETS.find((t) => t.id === id)!,
            date,
            place,
          );
          const err = angleBetweenDeg(ours, state.direction);
          worst = Math.max(worst, err);
          pairs++;
          if (state.altitudeDeg < 0) belowHorizon++;
          expect(err, `${id} ${place.name} ${date.toISOString()}`).toBeLessThan(0.02);
        }
      }
    }
    expect(pairs).toBe(45);
    // The cases must include stars on both sides of the horizon.
    expect(belowHorizon).toBeGreaterThan(5);
    console.info(
      `[phase10] worst transform-vs-provider error over ${pairs} star/date/place cases: ${worst.toFixed(6)} deg`,
    );
  });

  it('applies refraction: a star at the horizon is lifted by about half a degree', () => {
    const g = skyGeometry();
    const field = new SkyField(g);
    const place = PLACES[0];
    const date = DATES[0];
    field.update(date, place);
    const t = MakeTime(new Date(Math.floor(date.getTime() / 1000) * 1000));
    const rot = Rotation_EQJ_HOR(t, new Observer(place.latitude, place.longitude, place.heightM));
    let checked = 0;
    for (let i = 0; i < g.starCount && checked < 3; i++) {
      const v = RotateVector(rot, {
        x: g.starEqj[i * 3],
        y: g.starEqj[i * 3 + 1],
        z: g.starEqj[i * 3 + 2],
        t,
      } as never);
      const geometric = Math.asin(v.z) * (180 / Math.PI);
      if (geometric > -0.2 && geometric < 0.2) {
        const ours = Math.asin(field.starEnu[i * 3 + 2]) * (180 / Math.PI);
        expect(ours - geometric).toBeGreaterThan(0.4);
        expect(ours - geometric).toBeLessThan(0.7);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('keeps every transformed vector a unit vector', () => {
    const field = new SkyField(skyGeometry());
    field.update(DATES[1], PLACES[1]);
    for (let i = 0; i < skyGeometry().starCount; i += 53) {
      const n = Math.hypot(
        field.starEnu[i * 3],
        field.starEnu[i * 3 + 1],
        field.starEnu[i * 3 + 2],
      );
      expect(n).toBeCloseTo(1, 12);
    }
  });

  it('update() is a no-op within the same second and place, and redoes the work when either changes', () => {
    const field = new SkyField(skyGeometry());
    expect(field.update(new Date('2026-10-29T03:00:00.100Z'), PLACES[0])).toBe(true);
    expect(field.update(new Date('2026-10-29T03:00:00.900Z'), PLACES[0])).toBe(false);
    expect(field.update(new Date('2026-10-29T03:00:01.000Z'), PLACES[0])).toBe(true);
    expect(field.update(new Date('2026-10-29T03:00:01.500Z'), PLACES[1])).toBe(true);
  });
});

describe('SkyField projection', () => {
  const viewport = { width: 390, height: 844, vFovDeg: 62 };

  it('matches projectDirection for every star and point, including which are behind the camera', () => {
    const g = skyGeometry();
    const field = new SkyField(g);
    field.update(DATES[0], PLACES[0]);
    const basis = cameraBasisFromAzAlt(130, 35);
    field.project(basis, viewport);
    let inFront = 0;
    for (let i = 0; i < g.starCount; i++) {
      const p = projectDirection(
        [field.starEnu[i * 3], field.starEnu[i * 3 + 1], field.starEnu[i * 3 + 2]],
        basis,
        viewport,
      );
      expect(field.starInFront[i] === 1, `star ${i}`).toBe(p.inFront);
      if (p.inFront) {
        inFront++;
        expect(Math.abs(field.starX[i] - p.x)).toBeLessThan(0.05);
        expect(Math.abs(field.starY[i] - p.y)).toBeLessThan(0.05);
      }
    }
    for (let i = 0; i < g.pointCount; i++) {
      const p = projectDirection(
        [field.pointEnu[i * 3], field.pointEnu[i * 3 + 1], field.pointEnu[i * 3 + 2]],
        basis,
        viewport,
      );
      expect(field.pointInFront[i] === 1, `point ${i}`).toBe(p.inFront);
    }
    expect(inFront).toBeGreaterThan(100);
    expect(inFront).toBeLessThan(g.starCount);
  });

  it('allocates nothing per call: the same typed arrays are reused', () => {
    const field = new SkyField(skyGeometry());
    field.update(DATES[0], PLACES[0]);
    const before = [field.starX, field.starY, field.starInFront, field.pointX, field.pointY];
    field.project(cameraBasisFromAzAlt(0, 10), viewport);
    field.project(cameraBasisFromAzAlt(200, 50), viewport);
    const after = [field.starX, field.starY, field.starInFront, field.pointX, field.pointY];
    after.forEach((a, k) => expect(a).toBe(before[k]));
    expect(field.starX.constructor).toBe(Float32Array);
    expect(field.starEnu.constructor).toBe(Float64Array);
  });
});

describe('SkyField timing (reported in docs/phases/phase10-report.md)', () => {
  it('transform of all stars and points, and per-frame projection, are cheap', () => {
    const g = skyGeometry();
    const field = new SkyField(g);
    const viewport = { width: 390, height: 844, vFovDeg: 62 };
    const basis = cameraBasisFromAzAlt(130, 35);
    // Warm up (JIT, the astronomy-engine tables), then time many runs on distinct seconds.
    for (let i = 0; i < 5; i++) {
      field.update(new Date(DATES[0].getTime() + i * 1000), PLACES[0]);
      field.project(basis, viewport);
    }
    const transform: number[] = [];
    const project: number[] = [];
    for (let i = 0; i < 200; i++) {
      field.update(new Date(DATES[0].getTime() + (10 + i) * 1000), PLACES[0]);
      transform.push(field.lastTransformMs);
      field.project(basis, viewport);
      project.push(field.lastProjectMs);
    }
    const stats = (xs: number[]) => {
      const s = [...xs].sort((a, b) => a - b);
      return { median: s[100], p95: s[190], max: s[199] };
    };
    const tr = stats(transform);
    const pr = stats(project);
    console.info(
      `[phase10] transform (${g.starCount} stars + ${g.pointCount} points): median ${tr.median.toFixed(3)} ms, p95 ${tr.p95.toFixed(3)} ms, max ${tr.max.toFixed(3)} ms`,
    );
    console.info(
      `[phase10] projection (same points, per frame): median ${pr.median.toFixed(3)} ms, p95 ${pr.p95.toFixed(3)} ms, max ${pr.max.toFixed(3)} ms`,
    );
    // Generous: the whole suite runs in parallel on shared machines. Measured alone it is far below these.
    expect(tr.median).toBeLessThan(15);
    expect(pr.median).toBeLessThan(4);
  });
});
