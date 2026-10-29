import { StoredAlignment } from '../calibration/alignment';
import { DebugReportInput, buildDebugReport } from './debug-report';

const alignment: StoredAlignment = {
  yawDeg: 12.3456,
  setAt: Date.parse('2026-01-01T10:00:00Z'),
  lat: 40.7128,
  lon: -74.006,
  source: 'absolute',
};

const input: DebugReportInput = {
  now: new Date('2026-01-01T10:30:00Z'),
  userAgent: 'test-agent',
  screen: { w: 390, h: 844, dpr: 3, angle: 0 },
  status: 'active',
  headingSource: 'ios-compass',
  compassCalibration: 'calibrated',
  lastCompassSampleAgeMs: 1234.6,
  iosOffsetDeg: 37.123456,
  iosOffsetSpread: 0.00123456,
  compassAccuracyDeg: 10,
  declinationDeg: -12.345,
  location: { lat: 40.71284, lon: -74.00601 },
  locationSource: 'gps',
  alignment,
  cameraOn: false,
  vFovDegInUse: 62,
  longSideFovDeg: 69,
  raw: { alpha: 10.123, beta: 90, gamma: 0, webkitCompassHeading: 123.456 },
  pointing: { az: 350, alt: 10, roll: 1 },
  targetId: 'moon',
  target: { id: 'moon', az: 5, alt: 12 },
  appVersion: 'abc1234',
};

describe('buildDebugReport', () => {
  it('rounds location to one decimal and never emits full-precision coordinates', () => {
    const r = buildDebugReport(input);
    expect(r['location']).toEqual({ lat: 40.7, lon: -74 });
    expect(JSON.stringify(r)).not.toContain('40.71');
    expect(JSON.stringify(r)).not.toContain('74.006');
  });

  it('computes the az delta with wrap180 and the alt delta', () => {
    expect(buildDebugReport(input)['delta']).toEqual({ az: 15, alt: 2 });
  });

  it('includes alignment yaw and age in minutes, or null', () => {
    expect(buildDebugReport(input)['alignment']).toEqual({ yawDeg: 12.35, ageMin: 30 });
    expect(buildDebugReport({ ...input, alignment: null })['alignment']).toBeNull();
  });

  it('satellite targets add NORAD id, element age, sunlit and range; other targets add nothing', () => {
    expect(Object.keys(buildDebugReport(input))).not.toContain('satellite');
    const r = buildDebugReport({
      ...input,
      satellite: { noradId: 25544, ageDays: 0.7234, sunlit: false, rangeKm: 1234.56 },
    });
    expect(r['satellite']).toEqual({
      noradId: 25544,
      elementAgeDays: 0.72,
      sunlit: false,
      rangeKm: 1234.6,
    });
  });

  it('survives missing sensor data and round-trips through JSON', () => {
    const r = buildDebugReport({
      ...input,
      raw: null,
      pointing: null,
      target: null,
      location: null,
    });
    expect(r['delta']).toBeNull();
    expect(r['location']).toBeNull();
    expect(JSON.parse(JSON.stringify(r))['appVersion']).toBe('abc1234');
  });

  it('contains every field the phase spec asks for', () => {
    const keys = Object.keys(buildDebugReport(input));
    for (const k of [
      'timestamp',
      'userAgent',
      'screen',
      'status',
      'headingSource',
      'compassCalibration',
      'lastCompassSampleAgeMs',
      'iosOffsetDeg',
      'iosOffsetSpread',
      'compassAccuracyDeg',
      'declinationDeg',
      'location',
      'locationSource',
      'alignment',
      'cameraOn',
      'vFovDegInUse',
      'longSideFovDeg',
      'raw',
      'pointing',
      'targetId',
      'target',
      'delta',
      'appVersion',
    ]) {
      expect(keys).toContain(k);
    }
  });
});
