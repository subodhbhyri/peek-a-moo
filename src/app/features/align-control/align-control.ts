import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { AnalyticsService } from '../../core/analytics/analytics.service';
import { computeYawCorrection } from '../../core/calibration/alignment';
import { AlignmentService } from '../../core/calibration/alignment.service';
import { SkyEngineService } from '../../core/engine/sky-engine.service';
import { CameraFovService } from '../../core/projection/camera-fov.service';
import { TargetSelectionService } from '../../core/targets/target-selection.service';
import { OrientationService } from '../../core/sensors/orientation.service';

const BIG_CORRECTION_DEG = 45;
const TOAST_MS = 3000;

/**
 * Sight alignment: the user centers the real Moon, taps Lock, and we store the yaw difference between
 * where the phone claims to point and where the Moon really is. Fixes magnetometer bias the code can't see.
 * Also draws the center crosshair (strong while aligning, faint in camera mode).
 */
@Component({
  selector: 'app-align-control',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (mode() === 'idle' && cameraOn()) {
      <div class="crosshair faint" aria-hidden="true"></div>
    }

    @if (mode() !== 'idle') {
      <div class="crosshair" aria-hidden="true"></div>
      <div class="panel" role="dialog" [attr.aria-label]="'Align with the real ' + name()">
        @if (mode() === 'confirming') {
          <p>That's a big correction ({{ pendingText() }}°). Sure that's the {{ name() }}?</p>
          <div class="row">
            <button type="button" class="chip" (click)="commit()">Yes, lock it</button>
            <button type="button" class="chip" (click)="cancel()">Cancel</button>
          </div>
        } @else {
          <p>Point the center at the real {{ name() }}, then tap Lock.</p>
          <div class="row">
            <button type="button" class="chip primary" (click)="lock()">Lock</button>
            <button type="button" class="chip" (click)="cancel()">Cancel</button>
          </div>
        }
      </div>
    } @else {
      @if (canAlign()) {
        <button
          type="button"
          class="align-button"
          [attr.aria-label]="'Align with the real ' + name()"
          (click)="start()"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.5" />
            <path
              d="M12 2v6M12 16v6M2 12h6M16 12h6"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
        </button>
      }
      @if (alignment.stored()) {
        @if (confirmingReset()) {
          <button type="button" class="chip aligned" (click)="reset()">Reset alignment</button>
        } @else {
          <button type="button" class="chip aligned" (click)="confirmingReset.set(true)">
            Aligned ✓
          </button>
        }
      }
    }

    @if (toast(); as t) {
      <p class="toast" role="status">{{ t }}</p>
    }
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    button {
      pointer-events: auto;
      font: inherit;
      cursor: pointer;
    }
    .align-button {
      position: absolute;
      top: max(1rem, env(safe-area-inset-top));
      left: max(1rem, env(safe-area-inset-left));
      width: 2.4rem;
      height: 2.4rem;
      border-radius: 50%;
      border: 1px solid rgba(233, 230, 220, 0.15);
      background: rgba(20, 18, 14, 0.5);
      color: #e9e6dc;
      display: grid;
      place-items: center;
    }
    .aligned {
      position: absolute;
      top: max(1.3rem, calc(env(safe-area-inset-top) + 0.3rem));
      left: max(4rem, calc(env(safe-area-inset-left) + 3rem));
    }
    .chip {
      font-size: 0.78rem;
      color: #e9e6dc;
      background: rgba(20, 18, 14, 0.6);
      border: 1px solid rgba(233, 230, 220, 0.15);
      border-radius: 999px;
      padding: 0.5em 0.9em;
    }
    .chip.primary {
      border-color: rgba(233, 230, 220, 0.5);
    }
    .crosshair {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 44px;
      height: 44px;
      margin: -22px 0 0 -22px;
      background:
        linear-gradient(rgba(233, 230, 220, 0.85), rgba(233, 230, 220, 0.85)) center / 1px 100%
          no-repeat,
        linear-gradient(rgba(233, 230, 220, 0.85), rgba(233, 230, 220, 0.85)) center / 100% 1px
          no-repeat;
    }
    .crosshair.faint {
      opacity: 0.3;
    }
    .panel {
      position: absolute;
      left: 50%;
      bottom: max(1.5rem, env(safe-area-inset-bottom));
      transform: translateX(-50%);
      width: min(22rem, calc(100% - 2rem));
      text-align: center;
      background: rgba(20, 18, 14, 0.75);
      border: 1px solid rgba(233, 230, 220, 0.15);
      border-radius: 1rem;
      padding: 0.9rem 1rem;
      pointer-events: auto;
    }
    p {
      font-family: system-ui, sans-serif;
      font-size: 0.85rem;
      margin: 0 0 0.7rem;
      color: #e9e6dc;
    }
    .row {
      display: flex;
      gap: 0.6rem;
      justify-content: center;
    }
    .toast {
      position: absolute;
      top: max(4rem, calc(env(safe-area-inset-top) + 3.5rem));
      left: 50%;
      transform: translateX(-50%);
      margin: 0;
      opacity: 0.85;
    }
  `,
})
export class AlignControl {
  private readonly orientation = inject(OrientationService);
  private readonly engine = inject(SkyEngineService);
  private readonly selection = inject(TargetSelectionService);
  private readonly cameraFov = inject(CameraFovService);
  protected readonly alignment = inject(AlignmentService);

  protected readonly mode = signal<'idle' | 'aligning' | 'confirming'>('idle');
  protected readonly toast = signal<string | null>(null);
  protected readonly confirmingReset = signal(false);
  protected readonly cameraOn = this.cameraFov.cameraOn;
  private readonly pending = signal<number | null>(null);
  protected readonly pendingText = computed(() => Math.round(Math.abs(this.pending() ?? 0)));
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly name = computed(() => this.selection.selected().name);

  /** Sensors are driving the view and the target is actually up there to be aligned with. */
  private readonly analytics = inject(AnalyticsService);

  protected readonly canAlign = computed(() => {
    const target = this.engine.target();
    // Never for the Sun: aligning would mean looking at it.
    const kind = this.selection.selected().kind;
    if (kind === 'sun') return false;
    // Nor for satellites: they move too fast to line up against.
    if (kind === 'satellite') return false;
    // Nor in Look Around: nothing is being looked for.
    if (this.engine.mode() === 'look') return false;
    return this.orientation.status() === 'active' && target !== null && target.altitudeDeg > 0;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.engine.setTrackerPaused(false));
  }

  protected start(): void {
    this.confirmingReset.set(false);
    this.engine.setTrackerPaused(true);
    this.mode.set('aligning');
  }

  protected cancel(): void {
    this.engine.setTrackerPaused(false);
    this.pending.set(null);
    this.mode.set('idle');
  }

  protected lock(): void {
    const basis = this.orientation.uncorrectedBasis();
    const target = this.engine.target();
    if (!basis || !target) return this.cancel();
    const yaw = computeYawCorrection(basis, target.direction);
    this.pending.set(yaw);
    if (Math.abs(yaw) > BIG_CORRECTION_DEG) this.mode.set('confirming');
    else this.commit();
  }

  protected commit(): void {
    const yaw = this.pending();
    const source = this.orientation.headingSource();
    this.mode.set('idle');
    this.pending.set(null);
    this.engine.setTrackerPaused(false);
    if (yaw === null || source === null) return;
    const ok = this.alignment.set(yaw, source);
    if (ok) this.analytics.alignmentLocked(yaw);
    this.showToast(
      ok
        ? `Aligned (corrected ${Math.round(Math.abs(yaw))}°)`
        : "Couldn't align without a location.",
    );
  }

  protected reset(): void {
    this.alignment.clear();
    this.confirmingReset.set(false);
    this.showToast('Alignment reset');
  }

  private showToast(text: string): void {
    this.toast.set(text);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), TOAST_MS);
  }
}
