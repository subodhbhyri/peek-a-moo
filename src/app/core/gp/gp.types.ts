/** One CelesTrak OMM record, trimmed by api/gp.ts to the fields json2satrec needs. */
export type OmmRecord = Record<string, string | number> & {
  OBJECT_NAME: string;
  OBJECT_ID: string;
  EPOCH: string;
  NORAD_CAT_ID: number | string;
};

/** The shape of /api/gp and of public/data/gp-fallback.json. */
export interface GpPayload {
  fetchedAt: string;
  elements: OmmRecord[];
}

/** Element sets by NORAD id: all the satellite provider and the pass search need. */
export interface SatelliteElements {
  get(noradId: number): OmmRecord | undefined;
}

const MS_PER_DAY = 86_400_000;
/** 3-14 days old: still good for finding it, but the position drifts. */
export const APPROXIMATE_AFTER_DAYS = 3;
/** More than 14 days old: draw it, but say so. */
export const STALE_AFTER_DAYS = 14;

/** OMM EPOCH has no zone suffix; it is UTC. */
export function epochMs(omm: Pick<OmmRecord, 'EPOCH'>): number {
  const s = omm.EPOCH;
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z');
}

/** Age of an element set at `now`, in days (negative if the epoch is in the future). */
export function elementAgeDays(omm: Pick<OmmRecord, 'EPOCH'>, now: Date): number {
  return (now.getTime() - epochMs(omm)) / MS_PER_DAY;
}

export interface ElementAgeFlags {
  ageDays: number;
  approximate: boolean;
  stale: boolean;
}

export function ageFlags(omm: Pick<OmmRecord, 'EPOCH'>, now: Date): ElementAgeFlags {
  const ageDays = elementAgeDays(omm, now);
  return {
    ageDays,
    approximate: ageDays >= APPROXIMATE_AFTER_DAYS && ageDays <= STALE_AFTER_DAYS,
    stale: ageDays > STALE_AFTER_DAYS,
  };
}

export function isGpPayload(v: unknown): v is GpPayload {
  if (!v || typeof v !== 'object') return false;
  const p = v as Partial<GpPayload>;
  return (
    typeof p.fetchedAt === 'string' &&
    Number.isFinite(Date.parse(p.fetchedAt)) &&
    Array.isArray(p.elements) &&
    p.elements.length > 0 &&
    p.elements.every(
      (e) => !!e && typeof e === 'object' && typeof e.EPOCH === 'string' && 'NORAD_CAT_ID' in e,
    )
  );
}
