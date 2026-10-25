import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AlignmentService } from '../calibration/alignment.service';
import { wrap180, wrap360 } from '../math/vec3';
import { LocationService } from './location.service';
import { OrientationService } from './orientation.service';
import { describeBasis } from './orientation-math';

const w = window as unknown as Record<string, unknown>;

function fire(type: string, props: Record<string, unknown>): void {
  const ev = new Event(type);
  Object.assign(ev, props);
  window.dispatchEvent(ev);
}

describe('OrientationService: iOS flat-only calibration', () => {
  let t = 0;
  beforeEach(() => {
    t = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => t);
    localStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  /** iOS: raw alpha is arbitrary; webkitCompassHeading is the magnetic heading of the top edge when flat. */
  const iosEvent = (magAlpha: number, rawOffset: number, beta: number, compass: number) =>
    fire('deviceorientation', {
      alpha: wrap360(magAlpha - rawOffset),
      beta,
      gamma: 0,
      absolute: false,
      webkitCompassHeading: compass,
      webkitCompassAccuracy: 10,
    });

  it('publishes nothing until flat samples calibrate it, then points correctly when upright', () => {
    const svc = TestBed.inject(OrientationService);
    svc.setDeclination(0);
    svc.start();

    // Upright from the start: the compass is not trusted, so there is no basis.
    for (let i = 0; i < 30; i++) {
      t += 16.7;
      iosEvent(240, 55, 90, 120);
    }
    expect(svc.compassCalibration()).toBe('uncalibrated');
    expect(svc.basis()).toBeNull();
    expect(svc.status()).toBe('waiting');

    // Lie flat for ~0.4 s: calibrating, still hidden.
    for (let i = 0; i < 24; i++) {
      t += 16.7;
      iosEvent(240, 55, 0, wrap360(360 - 240));
    }
    expect(svc.compassCalibration()).toBe('calibrating');
    expect(svc.basis()).toBeNull();

    // ...and ~1 s total: calibrated, basis appears.
    for (let i = 0; i < 48; i++) {
      t += 16.7;
      iosEvent(240, 55, 0, wrap360(360 - 240));
    }
    expect(svc.compassCalibration()).toBe('calibrated');
    expect(svc.basis()).not.toBeNull();
    expect(svc.status()).toBe('active');

    // Raise the phone, facing azimuth 120° (magnetic alpha 240), with a garbage compass value.
    for (let i = 0; i < 200; i++) {
      t += 16.7;
      iosEvent(240, 55, 90, 33);
    }
    const p = describeBasis(svc.basis()!);
    expect(Math.abs(wrap180(p.azimuthDeg - 120))).toBeLessThan(1);
    expect(Math.abs(p.altitudeDeg)).toBeLessThan(1);

    // 11 minutes with no flat sample: stale, but still pointing.
    t += 11 * 60_000;
    iosEvent(240, 55, 90, 33);
    expect(svc.compassCalibration()).toBe('stale');
    expect(svc.basis()).not.toBeNull();
    expect(svc.lastCompassSampleAgeMs()).toBeGreaterThan(10 * 60_000);
    svc.stop();
  });
});

describe('OrientationService: sight alignment', () => {
  beforeEach(() => {
    localStorage.clear();
    w['ondeviceorientationabsolute'] = null;
  });
  afterEach(() => {
    delete w['ondeviceorientationabsolute'];
    localStorage.clear();
  });

  const absEvent = (alpha: number) =>
    fire('deviceorientationabsolute', { alpha, beta: 90, gamma: 0, absolute: true });

  it('applies a valid correction after smoothing, keeps the uncorrected basis, and ignores it when invalid', () => {
    const svc = TestBed.inject(OrientationService);
    TestBed.inject(LocationService).setManual({ latitude: 40, longitude: -75 });
    const align = TestBed.inject(AlignmentService);
    svc.setDeclination(0);
    svc.start();

    absEvent(0); // facing north
    expect(describeBasis(svc.basis()!).azimuthDeg).toBeCloseTo(0, 6);

    expect(align.set(12, 'absolute')).toBe(true);
    absEvent(0);
    expect(wrap180(describeBasis(svc.basis()!).azimuthDeg - 12)).toBeCloseTo(0, 6);
    expect(describeBasis(svc.uncorrectedBasis()!).azimuthDeg).toBeCloseTo(0, 6);

    // A different heading source invalidates and clears it.
    expect(align.yawFor('ios-compass')).toBeNull();
    expect(align.stored()).toBeNull();
    absEvent(0);
    expect(describeBasis(svc.basis()!).azimuthDeg).toBeCloseTo(0, 6);

    // Not applied in manual drag mode.
    align.set(12, 'absolute');
    svc.setManualPose(100, 20);
    const m = describeBasis(svc.basis()!);
    expect(m.azimuthDeg).toBeCloseTo(100, 6);
    svc.stop();
  });

  it('persists to localStorage and is rejected when too old or too far', () => {
    const align = TestBed.inject(AlignmentService);
    TestBed.inject(LocationService).setManual({ latitude: 40, longitude: -75 });
    const now = 1_700_000_000_000;
    align.set(5, 'absolute', now);
    expect(JSON.parse(localStorage.getItem('find-the-moon.alignment.v1')!).yawDeg).toBe(5);
    expect(align.yawFor('absolute', now + 3_600_000)).toBe(5);
    expect(align.yawFor('absolute', now + 7 * 3_600_000)).toBeNull();
    expect(localStorage.getItem('find-the-moon.alignment.v1')).toBeNull();

    align.set(5, 'absolute', now);
    TestBed.inject(LocationService).setManual({ latitude: 41, longitude: -75 }); // ~111 km
    expect(align.yawFor('absolute', now + 1000)).toBeNull();
  });
});
