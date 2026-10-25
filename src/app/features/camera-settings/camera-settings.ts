import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MAX_LONG_SIDE_FOV_DEG, MIN_LONG_SIDE_FOV_DEG } from '../../core/projection/camera-fov';
import { CameraFovService } from '../../core/projection/camera-fov.service';

/** Camera mode only: a gear that opens an FOV slider so the overlay can be matched to the video. */
@Component({
  selector: 'app-camera-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (fov.cameraOn()) {
      <button
        type="button"
        class="gear"
        aria-label="Camera field of view"
        [attr.aria-expanded]="open()"
        (click)="open.set(!open())"
      >
        ⚙
      </button>
      @if (open()) {
        <div class="popover">
          <label for="fov">FOV {{ fov.longSideFovDeg().toFixed(1) }}°</label>
          <input
            id="fov"
            type="range"
            [min]="min"
            [max]="max"
            step="0.5"
            [value]="fov.longSideFovDeg()"
            (input)="onInput($event)"
          />
          <small
            >Match the overlay to the video: point at a far landmark and compare the edges.</small
          >
        </div>
      }
    }
  `,
  styles: `
    :host {
      position: absolute;
      top: max(3.8rem, calc(env(safe-area-inset-top) + 2.8rem));
      right: max(1rem, env(safe-area-inset-right));
      display: grid;
      justify-items: end;
      gap: 0.5rem;
      pointer-events: none;
    }
    .gear {
      pointer-events: auto;
      width: 2.4rem;
      height: 2.4rem;
      border-radius: 50%;
      border: 1px solid rgba(233, 230, 220, 0.15);
      background: rgba(20, 18, 14, 0.5);
      color: #e9e6dc;
      font-size: 1.1rem;
      line-height: 1;
      cursor: pointer;
    }
    .popover {
      pointer-events: auto;
      display: grid;
      gap: 0.4rem;
      width: min(14rem, calc(100vw - 2rem));
      padding: 0.7rem 0.8rem;
      background: rgba(20, 18, 14, 0.8);
      border: 1px solid rgba(233, 230, 220, 0.15);
      border-radius: 0.8rem;
      font-family: system-ui, sans-serif;
      font-size: 0.8rem;
      color: #e9e6dc;
    }
    small {
      opacity: 0.55;
      font-size: 0.7rem;
    }
  `,
})
export class CameraSettings {
  protected readonly fov = inject(CameraFovService);
  protected readonly open = signal(false);
  protected readonly min = MIN_LONG_SIDE_FOV_DEG;
  protected readonly max = MAX_LONG_SIDE_FOV_DEG;

  protected onInput(e: Event): void {
    this.fov.setLongSideFov(Number((e.target as HTMLInputElement).value));
  }
}
