import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { City } from './core/data/cities';
import { CameraFovService } from './core/projection/camera-fov.service';
import { SkyEngineService } from './core/engine/sky-engine.service';
import { LocationService } from './core/sensors/location.service';
import { OrientationService } from './core/sensors/orientation.service';
import { needsMotionPermissionGesture, requestMotionPermission } from './core/sensors/permissions';
import { WakeLockService } from './core/sensors/wake-lock.service';
import { AlignControl } from './features/align-control/align-control';
import { CameraSettings } from './features/camera-settings/camera-settings';
import { CityPicker } from './features/city-picker/city-picker';
import { DebugOverlay } from './features/debug-overlay/debug-overlay';
import { SkyView } from './features/sky-view/sky-view';

/**
 * First-run flow.
 *  - Android / desktop: start sensors on load, no tap.
 *  - iOS: the whole screen is the tap target ("Tap anywhere to begin" in small print) because iOS
 *    refuses motion permission outside a user gesture.
 */
const STUCK_AFTER_MS = 8000;
const RAISE_MESSAGE_MS = 1500;

type Gate = 'needs-tap' | 'starting' | 'running' | 'motion-denied';

@Component({
  selector: 'app-root',
  imports: [SkyView, DebugOverlay, CityPicker, AlignControl, CameraSettings],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
  host: { '(click)': 'onTap()' },
})
export class App {
  private readonly location = inject(LocationService);
  private readonly orientation = inject(OrientationService);
  private readonly engine = inject(SkyEngineService);
  private readonly wakeLock = inject(WakeLockService);
  private readonly cameraFov = inject(CameraFovService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly videoRef = viewChild<ElementRef<HTMLVideoElement>>('cameraVideo');

  protected readonly gate = signal<Gate>(needsMotionPermissionGesture() ? 'needs-tap' : 'starting');
  protected readonly debug = new URLSearchParams(window.location.search).has('debug');
  protected readonly locationStatus = this.location.status;
  protected readonly orientationStatus = this.orientation.status;
  protected readonly compassAccuracy = this.orientation.compassAccuracyDeg;
  protected readonly moonSeen = signal(false);
  protected readonly showCityPicker = signal(false);
  protected readonly cameraOn = this.cameraFov.cameraOn;
  /** iOS reports a relative alpha plus a compass heading that is only trustworthy when held flat. */
  private readonly isIos = needsMotionPermissionGesture();
  protected readonly compassCalibration = this.orientation.compassCalibration;
  /** 'flat' | 'stuck' (still not calibrated after 8 s) | 'raise' (calibrated, shown for 1.5 s) | null */
  protected readonly calibrationBanner = signal<'flat' | 'stuck' | 'raise' | null>(null);
  protected readonly cameraError = signal<string | null>(null);

  protected readonly needsFlat = computed(() => {
    if (!this.isIos || this.gate() !== 'running') return false;
    const s = this.orientationStatus();
    if (s !== 'waiting' && s !== 'active') return false;
    const c = this.compassCalibration();
    return c === 'uncalibrated' || c === 'calibrating';
  });
  protected readonly showStaleHint = computed(
    () => this.isIos && this.gate() === 'running' && this.compassCalibration() === 'stale',
  );

  /** Copy stays until the Moon is first seen, then gets out of the way. */
  protected readonly showIntro = computed(() => !this.moonSeen());
  protected readonly needsLocationFallback = computed(
    () => this.locationStatus() === 'denied' || this.locationStatus() === 'unavailable',
  );
  protected readonly needsDragFallback = computed(() => {
    const s = this.orientationStatus();
    return (s === 'unsupported' || s === 'no-compass') && this.gate() === 'running';
  });
  protected readonly showCompassHint = computed(() => {
    const acc = this.compassAccuracy();
    return acc !== null && acc > 25;
  });

  constructor() {
    if (this.gate() === 'starting') this.start();

    // "Hold flat" -> (8 s) "still calibrating" ; on success "Now raise it to the sky." for 1.5 s.
    let stuckTimer: ReturnType<typeof setTimeout> | null = null;
    let raiseTimer: ReturnType<typeof setTimeout> | null = null;
    effect(() => {
      const flat = this.needsFlat();
      const calibrated = this.compassCalibration() === 'calibrated';
      untracked(() => {
        if (stuckTimer) clearTimeout(stuckTimer);
        stuckTimer = null;
        if (flat) {
          if (raiseTimer) clearTimeout(raiseTimer);
          raiseTimer = null;
          if (this.calibrationBanner() !== 'stuck') this.calibrationBanner.set('flat');
          stuckTimer = setTimeout(() => this.calibrationBanner.set('stuck'), STUCK_AFTER_MS);
        } else if (this.calibrationBanner() !== null && calibrated) {
          this.calibrationBanner.set('raise');
          raiseTimer = setTimeout(() => this.calibrationBanner.set(null), RAISE_MESSAGE_MS);
        } else if (this.calibrationBanner() !== 'raise') {
          this.calibrationBanner.set(null);
        }
      });
    });
    this.destroyRef.onDestroy(() => {
      if (stuckTimer) clearTimeout(stuckTimer);
      if (raiseTimer) clearTimeout(raiseTimer);
    });

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      this.engine.recompute();
      this.wakeLock.reacquireIfWanted();
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.destroyRef.onDestroy(() => document.removeEventListener('visibilitychange', onVisibility));
  }

  protected onTap(): void {
    if (this.gate() !== 'needs-tap') return;
    // Must be the first async-starting call in the gesture handler (iOS requirement).
    const motion = requestMotionPermission();
    this.gate.set('starting');
    this.location.request();
    motion.then((result) => {
      if (result === 'denied') {
        this.gate.set('motion-denied');
        return;
      }
      this.orientation.start();
      void this.wakeLock.enable();
      this.gate.set('running');
    });
  }

  protected onCitySelected(city: City): void {
    this.location.setManual({ latitude: city.latitude, longitude: city.longitude, heightM: 0 });
    this.showCityPicker.set(false);
  }

  protected async toggleCamera(): Promise<void> {
    if (this.cameraOn()) {
      this.stopCamera();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      const video = this.videoRef()?.nativeElement;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = stream;
      await video.play();
      this.onVideoMetadata();
      this.cameraOn.set(true);
      this.cameraError.set(null);
    } catch {
      this.cameraError.set("Couldn't access the camera.");
      setTimeout(() => this.cameraError.set(null), 3000);
    }
  }

  /** Tell the sky view the video's intrinsic size (it changes with rotation / stream restarts). */
  protected onVideoMetadata(): void {
    const v = this.videoRef()?.nativeElement;
    if (v && v.videoWidth > 0 && v.videoHeight > 0) {
      this.cameraFov.videoSize.set({ width: v.videoWidth, height: v.videoHeight });
    }
  }

  private stopCamera(): void {
    const video = this.videoRef()?.nativeElement;
    const stream = video?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (video) video.srcObject = null;
    this.cameraOn.set(false);
    this.cameraFov.videoSize.set(null);
  }

  private start(): void {
    this.location.request();
    this.orientation.start();
    void this.wakeLock.enable();
    this.gate.set('running');
  }
}
