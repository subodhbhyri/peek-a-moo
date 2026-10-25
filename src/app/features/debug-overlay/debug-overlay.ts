import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { OrientationService } from '../../core/sensors/orientation.service';
import { LocationService } from '../../core/sensors/location.service';
import { SkyEngineService } from '../../core/engine/sky-engine.service';
import { AlignmentService } from '../../core/calibration/alignment.service';
import { buildDebugReport } from '../../core/debug/debug-report';
import { TARGETS } from '../../core/targets/catalog';
import { TargetSelectionService } from '../../core/targets/target-selection.service';
import { wrap180 } from '../../core/math/vec3';
import { CameraFovService } from '../../core/projection/camera-fov.service';

/**
 * Visit /?debug. The numbers that matter for verifying the pipeline on a real phone:
 *  - "pointing" should match the direction your phone's back faces (check with a compass app,
 *    which shows MAGNETIC heading: pointing az ≈ compass app + declination).
 *  - "Δ to target" should hit ~0/0 when you look at the real target.
 *  - iOS: "offset spread" should stay near 0; "calib" should read calibrated after ~1 s flat.
 *  - "Copy report" puts a JSON snapshot on the clipboard for pasting back into a planning chat.
 */
@Component({
  selector: 'app-debug-overlay',
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pre>
loc     {{ loc.status() }} {{ loc.position()?.latitude | number: '1.2-2' }}, {{
        loc.position()?.longitude | number: '1.2-2'
      }}
orient  {{ ori.status() }} / {{ d()?.source }}  screen {{ d()?.screenAngle }}°
raw     α {{ d()?.alpha | number: '1.0-0' }}  β {{ d()?.beta | number: '1.0-0' }}  γ {{
        d()?.gamma | number: '1.0-0'
      }}
compass {{ d()?.compassHeading | number: '1.0-0' }}  acc {{
        d()?.compassAccuracy | number: '1.0-0'
      }}
ios off {{ d()?.iosOffset | number: '1.1-1' }}  spread {{ d()?.iosOffsetSpread | number: '1.3-3' }}
calib   {{ d()?.compassCalibration }}  last sample {{ sampleAgeS() | number: '1.0-0' }}s ago
decl    {{ d()?.declination | number: '1.1-1' }}°
align   {{ alignmentText() }}
camera  {{ fov.cameraOn() ? 'on' : 'off' }}  vFOV {{
        fov.vFovInUseDeg() | number: '1.1-1'
      }}°  long-side {{ fov.longSideFovDeg() | number: '1.1-1' }}°
pointing az {{ d()?.pointingAz | number: '1.1-1' }}  alt {{
        d()?.pointingAlt | number: '1.1-1'
      }}  roll {{ d()?.roll | number: '1.0-0' }}
target   {{ target()?.id }} az {{ target()?.azimuthDeg | number: '1.1-1' }}  alt {{
        target()?.altitudeDeg | number: '1.1-1'
      }}  {{ target()?.phase?.name }} {{
        (target()?.phase?.illuminatedFraction ?? 0) * 100 | number: '1.0-0'
      }}%
         mag {{ target()?.magnitude | number: '1.1-1' }}  size {{
        (target()?.angularSizeDeg ?? 0) * 60 | number: '1.1-1'
      }}′
Δ to target az {{ delta()?.az | number: '1.1-1' }}  alt {{ delta()?.alt | number: '1.1-1' }}</pre>
    <select aria-label="Target" [value]="selection.selectedId()" (change)="pick($event)">
      @for (t of targets; track t.id) {
        <option [value]="t.id" [selected]="t.id === selection.selectedId()">{{ t.name }}</option>
      }
    </select>
    <button type="button" (click)="copyReport()">{{ copied() ? 'Copied!' : 'Copy report' }}</button>
    @if (fallbackText(); as text) {
      <textarea readonly rows="8" (focus)="select($event)" [value]="text"></textarea>
    }
  `,
  styles: `
    :host {
      position: absolute;
      left: 0;
      bottom: 0;
      pointer-events: none;
    }
    select {
      pointer-events: auto;
      position: absolute;
      right: 90px;
      top: 4px;
      font: inherit;
      font-size: 11px;
      color: #7cffb2;
      background: rgba(0, 0, 0, 0.7);
      border: 1px solid #7cffb2;
      border-radius: 4px;
      padding: 3px 4px;
    }
    button {
      pointer-events: auto;
      position: absolute;
      right: 0;
      top: 4px;
      font: inherit;
      font-size: 11px;
      color: #7cffb2;
      background: rgba(0, 0, 0, 0.7);
      border: 1px solid #7cffb2;
      border-radius: 4px;
      padding: 4px 8px;
    }
    textarea {
      pointer-events: auto;
      position: fixed;
      left: 8px;
      right: 8px;
      top: 8px;
      font-size: 11px;
      color: #7cffb2;
      background: rgba(0, 0, 0, 0.9);
      border: 1px solid #7cffb2;
      user-select: text;
      -webkit-user-select: text;
    }
    pre {
      margin: 0;
      padding: 8px 10px calc(8px + env(safe-area-inset-bottom));
      font-size: 11px;
      line-height: 1.35;
      color: #7cffb2;
      background: rgba(0, 0, 0, 0.55);
    }
  `,
})
export class DebugOverlay {
  protected readonly ori = inject(OrientationService);
  protected readonly loc = inject(LocationService);
  protected readonly target = inject(SkyEngineService).target;
  protected readonly d = this.ori.debug;
  protected readonly fov = inject(CameraFovService);
  private readonly alignment = inject(AlignmentService);
  protected readonly selection = inject(TargetSelectionService);
  protected readonly targets = TARGETS;
  protected readonly copied = signal(false);
  protected readonly fallbackText = signal<string | null>(null);
  /** Loaded up front: clipboard writes must happen synchronously inside the tap (Safari). */
  private appVersion = 'dev';

  constructor() {
    // public/version.json is written at build time by scripts/stamp-version.mjs; absent in dev.
    fetch('version.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { version?: string } | null) => {
        if (j?.version) this.appVersion = j.version;
      })
      .catch(() => undefined);
  }

  protected readonly sampleAgeS = computed(() => {
    const ms = this.d()?.lastCompassSampleAgeMs;
    return ms == null ? null : ms / 1000;
  });
  protected readonly alignmentText = computed(() => {
    const a = this.alignment.stored();
    if (!a) return 'none';
    return `${a.yawDeg.toFixed(1)}° (${Math.round((Date.now() - a.setAt) / 60_000)} min ago)`;
  });

  protected copyReport(): void {
    const d = this.d();
    const pos = this.loc.position();
    const m = this.target();
    const report = buildDebugReport({
      now: new Date(),
      userAgent: navigator.userAgent,
      screen: {
        w: window.innerWidth,
        h: window.innerHeight,
        dpr: window.devicePixelRatio,
        angle: d?.screenAngle ?? 0,
      },
      status: this.ori.status(),
      headingSource: this.ori.headingSource() ?? d?.source ?? null,
      compassCalibration: this.ori.compassCalibration(),
      lastCompassSampleAgeMs: this.ori.lastCompassSampleAgeMs(),
      iosOffsetDeg: d?.iosOffset ?? null,
      iosOffsetSpread: d?.iosOffsetSpread ?? 0,
      compassAccuracyDeg: this.ori.compassAccuracyDeg(),
      declinationDeg: d?.declination ?? 0,
      location: pos ? { lat: pos.latitude, lon: pos.longitude } : null,
      locationSource: this.loc.status() === 'manual' ? 'manual' : 'gps',
      alignment: this.alignment.stored(),
      cameraOn: this.fov.cameraOn(),
      vFovDegInUse: this.fov.vFovInUseDeg(),
      longSideFovDeg: this.fov.longSideFovDeg(),
      raw: d && {
        alpha: d.alpha,
        beta: d.beta,
        gamma: d.gamma,
        webkitCompassHeading: d.compassHeading,
      },
      pointing: d && { az: d.pointingAz, alt: d.pointingAlt, roll: d.roll },
      targetId: m?.id ?? this.selection.selectedId(),
      target: m && { id: m.id, az: m.azimuthDeg, alt: m.altitudeDeg },
      appVersion: this.appVersion,
    });
    const text = JSON.stringify(report, null, 2);
    const done = () => {
      this.fallbackText.set(null);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done, () => this.fallbackText.set(text));
    } else {
      this.fallbackText.set(text);
    }
  }

  protected pick(e: Event): void {
    this.selection.select((e.target as HTMLSelectElement).value);
  }

  protected select(e: Event): void {
    (e.target as HTMLTextAreaElement).select();
  }

  protected readonly delta = computed(() => {
    const d = this.d(),
      m = this.target();
    if (!d || !m) return null;
    return { az: wrap180(m.azimuthDeg - d.pointingAz), alt: m.altitudeDeg - d.pointingAlt };
  });
}
