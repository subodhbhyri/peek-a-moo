import { MakeTime, Observer, Rotation_EQJ_HOR, RotationMatrix } from 'astronomy-engine';
import type { GeoPosition } from '../astro/ephemeris';

export interface HorizonRotation {
  time: ReturnType<typeof MakeTime>;
  rotation: RotationMatrix;
}

/**
 * Sky positions change by 15 arcseconds per second, so everything here works on whole seconds. Scanning a
 * constellation's rise and set asks for the same few hundred instants for all of them: the cache keeps
 * the last MAX_ENTRIES rotations (one matrix each) so each is computed once.
 */
const MAX_ENTRIES = 512;
const cache = new Map<string, HorizonRotation>();

/** The EQJ -> horizon rotation for `date` (rounded down to 1 s) and an observer. */
export function horizonRotation(date: Date, pos: GeoPosition): HorizonRotation {
  const second = Math.floor(date.getTime() / 1000);
  const key = `${second}|${pos.latitude}|${pos.longitude}|${pos.heightM ?? 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const time = MakeTime(new Date(second * 1000));
  const observer = new Observer(pos.latitude, pos.longitude, pos.heightM ?? 0);
  const entry = { time, rotation: Rotation_EQJ_HOR(time, observer) };
  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(key, entry);
  return entry;
}
