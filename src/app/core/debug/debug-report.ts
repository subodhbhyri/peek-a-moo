import type { StoredAlignment } from '../calibration/alignment';
import { wrap180 } from '../math/vec3';
import type { CompassCalibration } from '../sensors/orientation-math';
import type { HeadingSource, OrientationStatus } from '../sensors/orientation.service';

export interface DebugReportInput {
  now: Date;
  userAgent: string;
  screen: { w: number; h: number; dpr: number; angle: number };
  status: OrientationStatus;
  headingSource: HeadingSource | 'relative' | null;
  compassCalibration: CompassCalibration;
  lastCompassSampleAgeMs: number | null;
  iosOffsetDeg: number | null;
  iosOffsetSpread: number;
  compassAccuracyDeg: number | null;
  declinationDeg: number;
  location: { lat: number; lon: number } | null;
  locationSource: 'gps' | 'manual';
  alignment: StoredAlignment | null;
  cameraOn: boolean;
  vFovDegInUse: number;
  longSideFovDeg: number;
  raw: { alpha: number; beta: number; gamma: number; webkitCompassHeading: number | null } | null;
  pointing: { az: number; alt: number; roll: number } | null;
  moon: { az: number; alt: number } | null;
  appVersion: string;
}

const round = (v: number | null | undefined, places: number): number | null => {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const f = 10 ** places;
  return Math.round(v * f) / f;
};

/** Plain JSON-able snapshot for pasting back from a field test. Location is deliberately coarse (0.1°). */
export function buildDebugReport(i: DebugReportInput): Record<string, unknown> {
  const p = i.pointing;
  const m = i.moon;
  return {
    timestamp: i.now.toISOString(),
    userAgent: i.userAgent,
    screen: i.screen,
    status: i.status,
    headingSource: i.headingSource,
    compassCalibration: i.compassCalibration,
    lastCompassSampleAgeMs: round(i.lastCompassSampleAgeMs, 0),
    iosOffsetDeg: round(i.iosOffsetDeg, 2),
    iosOffsetSpread: round(i.iosOffsetSpread, 4),
    compassAccuracyDeg: round(i.compassAccuracyDeg, 1),
    declinationDeg: round(i.declinationDeg, 2),
    location: i.location ? { lat: round(i.location.lat, 1), lon: round(i.location.lon, 1) } : null,
    locationSource: i.locationSource,
    alignment: i.alignment
      ? {
          yawDeg: round(i.alignment.yawDeg, 2),
          ageMin: round((i.now.getTime() - i.alignment.setAt) / 60_000, 1),
        }
      : null,
    cameraOn: i.cameraOn,
    vFovDegInUse: round(i.vFovDegInUse, 2),
    longSideFovDeg: round(i.longSideFovDeg, 1),
    raw: i.raw && {
      alpha: round(i.raw.alpha, 2),
      beta: round(i.raw.beta, 2),
      gamma: round(i.raw.gamma, 2),
      webkitCompassHeading: round(i.raw.webkitCompassHeading, 2),
    },
    pointing: p && { az: round(p.az, 2), alt: round(p.alt, 2), roll: round(p.roll, 2) },
    moon: m && { az: round(m.az, 2), alt: round(m.alt, 2) },
    delta: p && m && { az: round(wrap180(m.az - p.az), 2), alt: round(m.alt - p.alt, 2) },
    appVersion: i.appVersion,
  };
}
