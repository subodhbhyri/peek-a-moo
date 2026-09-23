import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { City } from './core/data/cities';
import { SkyEngineService } from './core/engine/sky-engine.service';
import { LocationService } from './core/sensors/location.service';
import { OrientationService } from './core/sensors/orientation.service';
import { needsMotionPermissionGesture, requestMotionPermission } from './core/sensors/permissions';
import { WakeLockService } from './core/sensors/wake-lock.service';
import { CityPicker } from './features/city-picker/city-picker';
import { DebugOverlay } from './features/debug-overlay/debug-overlay';
import { SkyView } from './features/sky-view/sky-view';

/**
 * First-run flow.
 *  - Android / desktop: start sensors on load, no tap.
 *  - iOS: the whole screen is the tap target ("Tap anywhere to begin" in small print) because iOS
 *    refuses motion permission outside a user gesture.
 */
type Gate = 'needs-tap' | 'starting' | 'running' | 'motion-denied';

@Component({
  selector: 'app-root',
  imports: [SkyView, DebugOverlay, CityPicker],
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
  private readonly destroyRef = inject(DestroyRef);
  private readonly videoRef = viewChild<ElementRef<HTMLVideoElement>>('cameraVideo');

  protected readonly gate = signal<Gate>(needsMotionPermissionGesture() ? 'needs-tap' : 'starting');
  protected readonly debug = new URLSearchParams(window.location.search).has('debug');
  protected readonly locationStatus = this.location.status;
  protected readonly orientationStatus = this.orientation.status;
  protected readonly compassAccuracy = this.orientation.compassAccuracyDeg;
  protected readonly moonSeen = signal(false);
  protected readonly showCityPicker = signal(false);
  protected readonly cameraOn = signal(false);
  protected readonly cameraError = signal<string | null>(null);

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

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      this.engine.recomputeMoon();
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
      this.cameraOn.set(true);
      this.cameraError.set(null);
    } catch {
      this.cameraError.set("Couldn't access the camera.");
      setTimeout(() => this.cameraError.set(null), 3000);
    }
  }

  private stopCamera(): void {
    const video = this.videoRef()?.nativeElement;
    const stream = video?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (video) video.srcObject = null;
    this.cameraOn.set(false);
  }

  private start(): void {
    this.location.request();
    this.orientation.start();
    void this.wakeLock.enable();
    this.gate.set('running');
  }
}
