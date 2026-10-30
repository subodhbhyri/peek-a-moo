import { Refraction } from 'astronomy-engine';
import type { GeoPosition } from '../../astro/ephemeris';
import { RAD, azAltFromDirection } from '../../math/vec3';
import { northCelestialPole } from '../../projection/sky-orientation';
import { horizonRotation } from '../../sky/horizon-rotation';
import { rotateToEnu } from '../../sky/sky-field';
import type { ConstellationGeo, SkyGeometry } from '../../sky/sky-geometry';
import type { TargetDef, TargetState } from '../target.types';

/** The star map is needed and is not loaded (yet), or does not know this constellation. */
export class SkyDataError extends Error {
  constructor(readonly code: 'no-star-map') {
    super(`Star map not available (${code}).`);
  }
}

const scratchIn = new Float64Array(3);
const scratchOut = new Float64Array(3);

/** True if any vertex of the figure is above the horizon (apparent altitude, refraction included). */
function anyVertexUp(
  rotation: ReturnType<typeof horizonRotation>['rotation'],
  geo: ConstellationGeo,
  pointEqj: Float64Array,
): boolean {
  const r = rotation.rot;
  for (let p = geo.vertexStart; p < geo.vertexEnd; p++) {
    const x = pointEqj[p * 3],
      y = pointEqj[p * 3 + 1],
      z = pointEqj[p * 3 + 2];
    const up = r[0][2] * x + r[1][2] * y + r[2][2] * z;
    const north = r[0][0] * x + r[1][0] * y + r[2][0] * z;
    const west = r[0][1] * x + r[1][1] * y + r[2][1] * z;
    const alt = Math.atan2(up, Math.hypot(north, west)) * RAD;
    if (alt + Refraction('normal', alt) > 0) return true;
  }
  return false;
}

/**
 * A constellation as a target: the direction is the normalized mean of its line vertices, rotated into
 * the horizon frame exactly like a fixed-sky target (refraction included); its size is twice the largest
 * angle from that center to any vertex. `partlyUp` says whether part of the figure is above the horizon
 * while the center is not. Magnitude is null: a figure has no brightness of its own.
 */
export function constellationTargetState(
  def: TargetDef,
  date: Date,
  pos: GeoPosition,
  sky: SkyGeometry | undefined,
): TargetState {
  const geo = sky?.byId.get(def.id);
  if (!sky || !geo) throw new SkyDataError('no-star-map');
  const { rotation } = horizonRotation(date, pos);
  scratchIn.set(geo.centerEqj);
  rotateToEnu(rotation, scratchIn, scratchOut, 1);
  const { azimuthDeg, altitudeDeg } = azAltFromDirection([
    scratchOut[0],
    scratchOut[1],
    scratchOut[2],
  ]);
  return {
    id: def.id,
    computedAt: date,
    direction: [scratchOut[0], scratchOut[1], scratchOut[2]],
    azimuthDeg,
    altitudeDeg,
    magnitude: null,
    angularSizeDeg: 2 * geo.radiusDeg,
    skyNorthDirection: northCelestialPole(pos.latitude),
    constellation: {
      partlyUp: altitudeDeg <= 0 && anyVertexUp(rotation, geo, sky.pointEqj),
    },
  };
}
