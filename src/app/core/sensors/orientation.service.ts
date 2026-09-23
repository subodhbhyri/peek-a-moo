import { Injectable, OnDestroy, signal } from '@angular/core';
import { Quat, mat3FromQuat, quatFromMat3, slerp } from '../math/vec3';
import {
  CameraBasis,
  HeadingOffsetCalibrator,
  cameraBasisFromAzAlt,
  cameraBasisFromRotation,
  describeBasis,
  rotationFromEuler,
} from './orientation-math';

/**
 * - idle: not started
 * - waiting: listening, no usable reading yet (iOS: waiting for first compass fix)
 * - active: producing a north-referenced camera basis
 * - no-compass: orientation works but nothing tells us where north is (rare; e.g. some Firefox builds)
 * - unsupported: no orientation events at all (desktop, or permission silently blocked)
 * - manual: basis is driven by setManualPose() (desktop drag mode)
 */
export type OrientationStatus =
  'idle' | 'waiting' | 'active' | 'no-compass' | 'unsupported' | 'manual';
export type HeadingSource = 'absolute' | 'ios-compass';

export interface OrientationDebug {
  alpha: number;
  beta: number;
  gamma: number;
  source: HeadingSource | 'relative';
  compassHeading: number | null;
  compassAccuracy: number | null;
  iosOffset: number | null;
  iosOffsetSpread: number;
  declination: number;
  screenAngle: number;
  pointingAz: number;
  pointingAlt: number;
  roll: number;
}

interface IOSOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
}

/** Smoothing time constant for the orientation quaternion. Lower = snappier, higher = steadier. */
const SMOOTHING_TAU_MS = 70;
/** If no usable event arrives in this window after start(), we assume there are no sensors. */
const NO_SENSOR_TIMEOUT_MS = 2500;
const DEBUG_THROTTLE_MS = 100;

@Injectable({ providedIn: 'root' })
export class OrientationService implements OnDestroy {
  readonly status = signal<OrientationStatus>('idle');
  readonly headingSource = signal<HeadingSource | null>(null);
  /** Smoothed camera basis referenced to TRUE north. null until the first usable reading. */
  readonly basis = signal<CameraBasis | null>(null);
  /** iOS only: compass accuracy in degrees (lower is better). >25 is worth a "wave in a figure-8" hint. */
  readonly compassAccuracyDeg = signal<number | null>(null);
  readonly debug = signal<OrientationDebug | null>(null);

  private declinationDeg = 0;
  private smoothed: Quat | null = null;
  private lastEventTime = 0;
  private lastDebugTime = 0;
  private readonly calibrator = new HeadingOffsetCalibrator();
  private listening: 'deviceorientationabsolute' | 'deviceorientation' | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  private readonly onEvent = (e: Event) => this.handle(e as IOSOrientationEvent);

  /** Magnetic declination at the user's location (east positive). Set once location is known. */
  setDeclination(deg: number): void {
    this.declinationDeg = deg;
  }

  /**
   * Begin listening. On iOS, only call after requestMotionPermission() resolved 'granted'.
   * Android Chrome exposes a north-referenced `deviceorientationabsolute` event; iOS gives relative
   * alpha plus `webkitCompassHeading` on the normal event.
   */
  start(): void {
    if (this.listening || typeof window === 'undefined') return;
    this.listening =
      'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    window.addEventListener(this.listening, this.onEvent);
    this.status.set('waiting');
    this.timeoutId = setTimeout(() => {
      if (this.status() === 'waiting' && this.lastEventTime === 0) this.status.set('unsupported');
    }, NO_SENSOR_TIMEOUT_MS);
  }

  stop(): void {
    if (this.listening) window.removeEventListener(this.listening, this.onEvent);
    this.listening = null;
    if (this.timeoutId) clearTimeout(this.timeoutId);
    this.smoothed = null;
    this.calibrator.reset();
  }

  /** Desktop / no-sensor fallback: point the virtual camera by azimuth & altitude (true north). */
  setManualPose(azimuthDeg: number, altitudeDeg: number): void {
    this.stop();
    this.status.set('manual');
    this.basis.set(cameraBasisFromAzAlt(azimuthDeg, altitudeDeg));
  }

  ngOnDestroy(): void {
    this.stop();
  }

  private handle(e: IOSOrientationEvent): void {
    if (e.alpha == null || e.beta == null || e.gamma == null) return; // desktop Chrome fires one all-null event
    const now = performance.now();
    const dt = this.lastEventTime ? now - this.lastEventTime : 16;
    this.lastEventTime = now;

    const { alpha, beta, gamma } = e;
    const iosHeading = typeof e.webkitCompassHeading === 'number' ? e.webkitCompassHeading : null;
    const iosAccuracy =
      typeof e.webkitCompassAccuracy === 'number' ? e.webkitCompassAccuracy : null;

    // 1. Get alpha referenced to MAGNETIC north.
    let alphaMagnetic: number | null = null;
    let source: HeadingSource | 'relative';
    if (iosHeading !== null) {
      source = 'ios-compass';
      const offset = this.calibrator.update(alpha, beta, gamma, iosHeading, dt);
      if (offset !== null) alphaMagnetic = alpha + offset;
      this.compassAccuracyDeg.set(iosAccuracy !== null && iosAccuracy >= 0 ? iosAccuracy : null);
    } else if (this.listening === 'deviceorientationabsolute' || e.absolute) {
      source = 'absolute';
      alphaMagnetic = alpha;
    } else {
      source = 'relative';
    }

    if (source === 'relative') {
      this.status.set('no-compass');
      this.publishDebug(now, e, source, iosHeading, iosAccuracy, 0);
      return;
    }
    this.headingSource.set(source);
    if (alphaMagnetic === null) return; // iOS: waiting for first valid compass heading

    // 2. Magnetic -> true north. trueAz = magAz + D, and azimuth = -alpha, so alphaTrue = alphaMag - D.
    const alphaTrue = alphaMagnetic - this.declinationDeg;

    // 3. Rotation -> quaternion -> smooth (slerp avoids Euler-angle jumps when the phone is upright).
    const target = quatFromMat3(rotationFromEuler(alphaTrue, beta, gamma));
    const k = 1 - Math.exp(-dt / SMOOTHING_TAU_MS);
    this.smoothed = this.smoothed ? slerp(this.smoothed, target, k) : target;

    // 4. Camera basis with the current screen rotation applied.
    const screenAngle = currentScreenAngle();
    this.basis.set(cameraBasisFromRotation(mat3FromQuat(this.smoothed), screenAngle));
    if (this.status() !== 'active') this.status.set('active');

    this.publishDebug(now, e, source, iosHeading, iosAccuracy, screenAngle);
  }

  private publishDebug(
    now: number,
    e: DeviceOrientationEvent,
    source: HeadingSource | 'relative',
    compassHeading: number | null,
    compassAccuracy: number | null,
    screenAngle: number,
  ): void {
    if (now - this.lastDebugTime < DEBUG_THROTTLE_MS) return;
    this.lastDebugTime = now;
    const b = this.basis();
    const d = b ? describeBasis(b) : { azimuthDeg: NaN, altitudeDeg: NaN, rollDeg: NaN };
    this.debug.set({
      alpha: e.alpha ?? NaN,
      beta: e.beta ?? NaN,
      gamma: e.gamma ?? NaN,
      source,
      compassHeading,
      compassAccuracy,
      iosOffset: this.calibrator.offset(),
      iosOffsetSpread: this.calibrator.spread(),
      declination: this.declinationDeg,
      screenAngle,
      pointingAz: d.azimuthDeg,
      pointingAlt: d.altitudeDeg,
      roll: d.rollDeg,
    });
  }
}

function currentScreenAngle(): number {
  const so = typeof screen !== 'undefined' ? screen.orientation : undefined;
  if (so && typeof so.angle === 'number') return so.angle;
  const legacy = (window as unknown as { orientation?: number }).orientation;
  return typeof legacy === 'number' ? legacy : 0;
}
