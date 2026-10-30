import {
  HorizonFromVector,
  MakeTime,
  Observer,
  RotateVector,
  Rotation_EQJ_HOR,
} from 'astronomy-engine';
import { skyGeometry } from '../../sky/testing/sky-fixture';
import { ALL_TARGETS, getTarget } from '../catalog';
import { computeTargetState } from '../compute';
import { SkyDataError, constellationTargetState } from './constellation';

const DENVER = { latitude: 39.6, longitude: -104.7, heightM: 1800 };
const SYDNEY = { latitude: -33.87, longitude: 151.2, heightM: 0 };
const sky = skyGeometry();
const def = (id: string) => getTarget(id)!;

/** Independent oracle: astronomy-engine's own calls, one vertex at a time. */
function oracle(
  id: string,
  date: Date,
  place: { latitude: number; longitude: number; heightM: number },
) {
  const file = sky.byId.get(id)!;
  const t = MakeTime(date);
  const rot = Rotation_EQJ_HOR(t, new Observer(place.latitude, place.longitude, place.heightM));
  const alt = (x: number, y: number, z: number) =>
    HorizonFromVector(RotateVector(rot, { x, y, z, t } as never), 'normal').lat;
  // Mean of the vertex unit vectors, then normalized.
  const m = [0, 0, 0];
  for (let p = file.vertexStart; p < file.vertexEnd; p++) {
    for (let k = 0; k < 3; k++) m[k] += sky.pointEqj[p * 3 + k];
  }
  const len = Math.hypot(m[0], m[1], m[2]);
  const hor = HorizonFromVector(
    RotateVector(rot, { x: m[0] / len, y: m[1] / len, z: m[2] / len, t } as never),
    'normal',
  );
  let anyUp = false;
  for (let p = file.vertexStart; p < file.vertexEnd; p++) {
    if (alt(sky.pointEqj[p * 3], sky.pointEqj[p * 3 + 1], sky.pointEqj[p * 3 + 2]) > 0)
      anyUp = true;
  }
  return { azimuthDeg: hor.lon, altitudeDeg: hor.lat, anyUp };
}

describe('constellation provider', () => {
  const date = new Date('2026-12-15T04:00:00Z');

  it('points at the mean of the figure, rotated like a fixed-sky target (refraction included)', () => {
    for (const id of ['orion', 'ursa-major', 'crux', 'cassiopeia', 'scorpius']) {
      for (const place of [DENVER, SYDNEY]) {
        const s = constellationTargetState(def(id), date, place, sky);
        const o = oracle(id, date, place);
        expect(Math.abs(s.altitudeDeg - o.altitudeDeg), `${id} altitude`).toBeLessThan(1e-6);
        const dAz = Math.abs(((s.azimuthDeg - o.azimuthDeg + 540) % 360) - 180);
        expect(dAz, `${id} azimuth`).toBeLessThan(1e-6);
        expect(Math.hypot(...s.direction)).toBeCloseTo(1, 12);
      }
    }
  });

  it('is twice the largest angle from the center to any vertex, has no magnitude, and sets sky north', () => {
    const s = constellationTargetState(def('orion'), date, DENVER, sky);
    expect(s.angularSizeDeg).toBeCloseTo(2 * sky.byId.get('orion')!.radiusDeg, 12);
    expect(s.angularSizeDeg).toBeGreaterThan(30);
    expect(s.angularSizeDeg).toBeLessThan(70);
    expect(s.magnitude).toBeNull();
    expect(s.skyNorthDirection).toBeDefined();
    expect(s.id).toBe('orion');
    expect(s.computedAt).toBe(date);
  });

  it('partlyUp: the center is below the horizon but at least one vertex is above (independent oracle agrees)', () => {
    let partly = 0;
    let wholeDown = 0;
    let up = 0;
    for (const c of sky.constellations) {
      for (const place of [DENVER, SYDNEY]) {
        for (const hours of [0, 5, 11, 17]) {
          const when = new Date(date.getTime() + hours * 3_600_000);
          const s = constellationTargetState(def(c.id), when, place, sky);
          const o = oracle(c.id, when, place);
          const expected = o.altitudeDeg <= 0 && o.anyUp;
          expect(s.constellation?.partlyUp, `${c.id} ${place.latitude} +${hours}h`).toBe(expected);
          if (s.altitudeDeg > 0) {
            up++;
            // Up from the center means "not partly": partlyUp is only the below-center case.
            expect(s.constellation?.partlyUp).toBe(false);
          } else if (s.constellation?.partlyUp) partly++;
          else wholeDown++;
        }
      }
    }
    // The sweep must actually exercise all three situations.
    expect(partly).toBeGreaterThan(10);
    expect(wholeDown).toBeGreaterThan(10);
    expect(up).toBeGreaterThan(10);
  });

  it('throws SkyDataError("no-star-map") without the star map, and for an id the map does not have', () => {
    expect(() => constellationTargetState(def('orion'), date, DENVER, undefined)).toThrow(
      SkyDataError,
    );
    expect(() => constellationTargetState(def('moon'), date, DENVER, sky)).toThrow(SkyDataError);
    try {
      constellationTargetState(def('orion'), date, DENVER, undefined);
    } catch (e) {
      expect((e as SkyDataError).code).toBe('no-star-map');
    }
  });

  it('computeTargetState dispatches constellations (and still the original kinds) with the sky argument', () => {
    const viaDispatch = computeTargetState(def('leo'), date, DENVER, undefined, sky);
    expect(viaDispatch).toEqual(constellationTargetState(def('leo'), date, DENVER, sky));
    expect(() => computeTargetState(def('leo'), date, DENVER)).toThrow(SkyDataError);
    // A fixed-sky target is untouched by the extra argument.
    expect(computeTargetState(def('sirius'), date, DENVER, undefined, sky).id).toBe('sirius');
  });

  it('every constellation produces a finite state for a spread of dates', () => {
    for (const t of ALL_TARGETS.filter((x) => x.kind === 'constellation')) {
      const s = constellationTargetState(t, date, SYDNEY, sky);
      expect(Number.isFinite(s.altitudeDeg), t.id).toBe(true);
      expect(Number.isFinite(s.azimuthDeg), t.id).toBe(true);
      expect(s.angularSizeDeg, t.id).toBeGreaterThan(1);
    }
  });

  it('sizes are sensible: Crux is small, Hydra is huge', () => {
    const crux = constellationTargetState(def('crux'), date, SYDNEY, sky);
    const hydra = constellationTargetState(def('hydra'), date, SYDNEY, sky);
    expect(crux.angularSizeDeg).toBeLessThan(15);
    expect(hydra.angularSizeDeg).toBeGreaterThan(80);
  });
});
