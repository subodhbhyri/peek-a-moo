import {
  HorizonFromVector,
  MakeTime,
  Observer,
  RotateVector,
  Rotation_EQJ_HOR,
  RotationMatrix,
  Spherical,
  VectorFromSphere,
} from 'astronomy-engine';
import type { GeoPosition } from '../../astro/ephemeris';
import { directionFromAzAlt } from '../../math/vec3';
import { northCelestialPole } from '../../projection/sky-orientation';
import type { TargetDef, TargetState } from '../target.types';

/**
 * EQJ -> horizontal rotation, cached for the most recent (time rounded down to 1 s, observer).
 * A refresh of 20+ fixed targets at one instant then costs one matrix, not twenty.
 */
let cache: { key: string; time: ReturnType<typeof MakeTime>; rotation: RotationMatrix } | null =
  null;

function rotationFor(date: Date, pos: GeoPosition) {
  const second = Math.floor(date.getTime() / 1000);
  const key = `${second}|${pos.latitude}|${pos.longitude}|${pos.heightM ?? 0}`;
  if (cache?.key === key) return cache;
  const observer = new Observer(pos.latitude, pos.longitude, pos.heightM ?? 0);
  const time = MakeTime(new Date(second * 1000));
  cache = { key, time, rotation: Rotation_EQJ_HOR(time, observer) };
  return cache;
}

/** Stars and deep-sky objects: fixed J2000 coordinates rotated into the observer's horizon frame. */
export function fixedSkyTargetState(def: TargetDef, date: Date, pos: GeoPosition): TargetState {
  const f = def.fixed;
  if (!f) throw new Error(`Target "${def.id}" has no fixed coordinates.`);
  const { time, rotation } = rotationFor(date, pos);
  const v = VectorFromSphere(new Spherical(f.decDeg, f.raHours * 15, 1), time);
  const hor = HorizonFromVector(RotateVector(rotation, v), 'normal');
  // hor.lat = altitude, hor.lon = azimuth (clockwise from north)
  return {
    id: def.id,
    computedAt: date,
    direction: directionFromAzAlt(hor.lon, hor.lat),
    azimuthDeg: hor.lon,
    altitudeDeg: hor.lat,
    magnitude: f.magnitude,
    angularSizeDeg: f.sizeDeg?.[0] ?? 0,
    skyNorthDirection: northCelestialPole(pos.latitude),
  };
}
