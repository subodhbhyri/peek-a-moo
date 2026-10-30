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
import { formatCoordinates } from './core/data/coordinates';
import type { PickedLocation } from './features/city-picker/city-picker';
import { TargetInfo } from './features/target-info/target-info';
import { TargetInfoService } from './features/target-info/target-info.service';
import type { TargetDef } from './core/targets/target.types';
import { AnalyticsService, SensorMode } from './core/analytics/analytics.service';
import { GpService } from './core/gp/gp.service';
import { SUN_CAMERA_NOTE, SUN_SAFETY_BANNER } from './core/personality/target-lines';
import { AvailabilityService } from './core/targets/availability.service';
import { introNote } from './core/targets/availability-format';
import { TargetSelectionService } from './core/targets/target-selection.service';
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
import { TargetPicker } from './features/target-picker/target-picker';
import { targetGlyph } from './features/target-picker/target-glyph';

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
  imports: [
    SkyView,
    DebugOverlay,
    CityPicker,
    AlignControl,
    CameraSettings,
    TargetPicker,
    TargetInfo,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
  host: { '(click)': 'onTap()' },
})
export class App {
  private readonly location = inject(LocationService);
  private readonly orientation = inject(OrientationService);
  protected readonly engine = inject(SkyEngineService);
  private readonly wakeLock = inject(WakeLockService);
  private readonly cameraFov = inject(CameraFovService);
  private readonly selection = inject(TargetSelectionService);
  private readonly availability = inject(AvailabilityService);
  private readonly gp = inject(GpService);
  private readonly analytics = inject(AnalyticsService);
  private readonly info = inject(TargetInfoService);
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
  /** Sun safety: banner on, camera off, alignment off. */
  protected readonly lookMode = computed(() => this.engine.mode() === 'look');
  protected readonly isSun = computed(
    () => !this.lookMode() && this.selection.selected().kind === 'sun',
  );
  /** Sun safety banner: the Sun is the target, or (Look Around) the Sun is near the middle of the screen. */
  protected readonly showSunBanner = computed(
    () => this.isSun() || (this.lookMode() && this.engine.lookSunNearCenter()),
  );
  protected readonly selectedDef = this.selection.selected;
  protected readonly glyph = targetGlyph;
  protected readonly pickerOpen = signal(false);
  /** One honest sentence when the target is not simply visible right now (null otherwise). */
  protected readonly introNoteText = computed(() => {
    const def = this.selection.selected();
    const a = this.availability.byId()[def.id];
    return a ? introNote(a, def, new Date(), navigator.language || 'en-US') : null;
  });
  /** A satellite is selected but there is no usable orbit data (yet): say so instead of showing nothing. */
  protected readonly orbitStatus = computed<'loading' | 'unavailable' | null>(() => {
    if (this.lookMode() || this.selection.selected().kind !== 'satellite') return null;
    if (this.gp.status() === 'unavailable' || this.engine.targetError() === 'propagation-failed') {
      return 'unavailable';
    }
    return this.engine.target() === null && this.gp.status() === 'loading' ? 'loading' : null;
  });
  protected readonly sunBanner = SUN_SAFETY_BANNER;
  protected readonly sunCameraNote = SUN_CAMERA_NOTE;
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
  protected readonly showIntro = computed(() => !this.moonSeen() && !this.lookMode());
  /**
   * The location chip: "Set location" only when there is no position at all (denied, and no time-zone area
   * or saved city to fall back on); otherwise it says where we think you are, with a way to change it.
   * Nothing for GPS. Never a blocking screen.
   */
  protected readonly locationChip = computed<string | null>(() => {
    if (this.gate() !== 'running') return null;
    const pos = this.location.position();
    const source = this.location.source();
    if (!pos) {
      const s = this.locationStatus();
      return s === 'denied' || s === 'unavailable' ? 'Set location' : null;
    }
    if (source === 'timezone') {
      return `Using ${this.location.label()} area (from your time zone) · Change`;
    }
    if (source === 'manual') {
      return `${this.location.label() ?? formatCoordinates(pos)} · Change`;
    }
    return null;
  });
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

    // A new target (or a shared link) gets its own intro, with its availability computed up front.
    effect(() => {
      const def = this.selection.selected();
      this.location.position();
      untracked(() => {
        this.moonSeen.set(false);
        this.availability.ensure(def);
      });
    });
    // How the target was chosen, for the very first one: a shared link, or the default.
    this.analytics.targetSelected(this.selection.selectedId(), this.selection.initialSource);
    // Look Around at startup (a ?mode=look link or a remembered choice).
    if (this.engine.initialLookSource)
      this.analytics.lookAroundOpened(this.engine.initialLookSource);

    // Which sensor path this device ended up on, once per session.
    effect(() => {
      const mode = this.sensorMode(this.orientationStatus(), this.orientation.headingSource());
      if (mode) untracked(() => this.analytics.sensorMode(mode));
    });

    // A satellite's availability needs its orbit data: compute it when that arrives.
    effect(() => {
      this.gp.stamp();
      const def = this.selection.selected();
      untracked(() => {
        if (def.kind === 'satellite') this.availability.ensure(def);
      });
    });

    // Desktop / drag mode: "t" opens the picker.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 't' || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      const s = this.orientationStatus();
      if (
        this.pickerOpen() ||
        !(s === 'unsupported' || s === 'no-compass' || s === 'manual' || s === 'idle')
      ) {
        return;
      }
      this.pickerOpen.set(true);
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    this.destroyRef.onDestroy(() => window.removeEventListener('keydown', onKey));

    // Selecting the Sun while the camera is on turns the camera off.
    effect(() => {
      if (this.isSun() && this.cameraOn()) this.stopCamera();
    });

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

  private sensorMode(
    status: ReturnType<typeof this.orientation.status>,
    source: ReturnType<typeof this.orientation.headingSource>,
  ): SensorMode | null {
    switch (status) {
      case 'active':
        return source === 'ios-compass' ? 'ios' : source === 'absolute' ? 'absolute' : null;
      case 'no-compass':
        return 'no-compass';
      case 'unsupported':
      case 'manual':
        return 'drag';
      default:
        return null;
    }
  }

  /** "Find it" on the info card: select the target, go back to find mode, close the card and the picker. */
  protected findFromInfo(def: TargetDef): void {
    this.selection.select(def.id);
    this.engine.setMode('find');
    this.analytics.targetSelected(def.id, 'info');
    this.info.close();
    this.pickerOpen.set(false);
  }

  protected openPicker(): void {
    this.pickerOpen.set(true);
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

  protected onLocationChosen(place: PickedLocation): void {
    this.location.chooseManual(
      { latitude: place.latitude, longitude: place.longitude, heightM: 0 },
      place.label,
    );
    this.showCityPicker.set(false);
  }

  protected onUseTimeZone(): void {
    this.location.useTimeZone();
    this.showCityPicker.set(false);
  }

  protected async toggleCamera(): Promise<void> {
    if (this.isSun()) return;
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
