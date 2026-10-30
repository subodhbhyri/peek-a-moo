import { Spherical, VectorFromSphere } from 'astronomy-engine';
import { RAD, Vec3, clamp, normalize } from '../math/vec3';
import type { SkyFile } from './sky-data.types';
import { starColorIndex, starSizeClass } from './star-style';

/** One constellation's figure, as ranges and indices into the shared arrays of a SkyGeometry. */
export interface ConstellationGeo {
  id: string;
  rank: 1 | 2 | 3;
  /** Its own line vertices are points [vertexStart, vertexEnd) of the shared point arrays. */
  vertexStart: number;
  vertexEnd: number;
  /** Pairs of point indices, one pair per line segment. */
  segments: Uint32Array;
  /** Point index of the name's anchor. */
  labelIndex: number;
  /** Normalized mean of all its line-vertex unit vectors (duplicates count), J2000. */
  centerEqj: Vec3;
  /** Largest angle from the center to any of its vertices. */
  radiusDeg: number;
  /** Declination range of its vertices, for "can this ever rise from here". */
  decMinDeg: number;
  decMaxDeg: number;
}

/**
 * sky.json turned into typed arrays of J2000 (EQJ) unit vectors, once after load. "Points" are every line
 * vertex of every constellation followed by the 88 label anchors, so one rotation pass moves them all.
 */
export interface SkyGeometry {
  starCount: number;
  /** x, y, z per star. */
  starEqj: Float64Array;
  starColor: Uint8Array;
  starSize: Uint8Array;
  pointCount: number;
  pointEqj: Float64Array;
  constellations: readonly ConstellationGeo[];
  byId: ReadonlyMap<string, ConstellationGeo>;
}

const J2000 = new Date(Date.UTC(2000, 0, 1, 12));

/** J2000 RA/Dec (degrees) to an EQJ unit vector, the way the fixed-sky provider does it. */
function eqj(raDeg: number, decDeg: number): Vec3 {
  const v = VectorFromSphere(new Spherical(decDeg, raDeg, 1), J2000);
  return [v.x, v.y, v.z];
}

export function buildSkyGeometry(file: SkyFile): SkyGeometry {
  const starCount = file.stars.length;
  const starEqj = new Float64Array(starCount * 3);
  const starColor = new Uint8Array(starCount);
  const starSize = new Uint8Array(starCount);
  file.stars.forEach(([ra, dec, mag, bv], i) => {
    starEqj.set(eqj(ra, dec), i * 3);
    starColor[i] = starColorIndex(bv);
    starSize[i] = starSizeClass(mag);
  });

  const vertexTotal = file.constellations.reduce(
    (n, c) => n + c.lines.reduce((m, l) => m + l.length, 0),
    0,
  );
  const pointCount = vertexTotal + file.constellations.length;
  const pointEqj = new Float64Array(pointCount * 3);

  const constellations: ConstellationGeo[] = [];
  let next = 0;
  for (const c of file.constellations) {
    const vertexStart = next;
    const segments: number[] = [];
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let decMin = 90;
    let decMax = -90;
    for (const line of c.lines) {
      line.forEach(([ra, dec], k) => {
        const v = eqj(ra, dec);
        pointEqj.set(v, next * 3);
        sx += v[0];
        sy += v[1];
        sz += v[2];
        decMin = Math.min(decMin, dec);
        decMax = Math.max(decMax, dec);
        if (k > 0) segments.push(next - 1, next);
        next++;
      });
    }
    const centerEqj = normalize([sx, sy, sz]);
    let radiusDeg = 0;
    for (let p = vertexStart; p < next; p++) {
      const d =
        pointEqj[p * 3] * centerEqj[0] +
        pointEqj[p * 3 + 1] * centerEqj[1] +
        pointEqj[p * 3 + 2] * centerEqj[2];
      radiusDeg = Math.max(radiusDeg, Math.acos(clamp(d, -1, 1)) * RAD);
    }
    constellations.push({
      id: c.id,
      rank: c.rank,
      vertexStart,
      vertexEnd: next,
      segments: Uint32Array.from(segments),
      labelIndex: vertexTotal + constellations.length,
      centerEqj,
      radiusDeg,
      decMinDeg: decMin,
      decMaxDeg: decMax,
    });
  }
  // The label anchors go after all vertices, in constellation order.
  file.constellations.forEach((c, i) =>
    pointEqj.set(eqj(c.label[0], c.label[1]), (vertexTotal + i) * 3),
  );

  return {
    starCount,
    starEqj,
    starColor,
    starSize,
    pointCount,
    pointEqj,
    constellations,
    byId: new Map(constellations.map((c) => [c.id, c])),
  };
}
