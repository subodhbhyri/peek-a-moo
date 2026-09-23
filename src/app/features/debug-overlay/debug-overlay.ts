import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { OrientationService } from '../../core/sensors/orientation.service';
import { LocationService } from '../../core/sensors/location.service';
import { SkyEngineService } from '../../core/engine/sky-engine.service';
import { wrap180 } from '../../core/math/vec3';

/**
 * Visit /?debug. The numbers that matter for verifying the pipeline on a real phone:
 *  - "pointing" should match the direction your phone's back faces (check with a compass app,
 *    which shows MAGNETIC heading: pointing az ≈ compass app + declination).
 *  - "Δ to moon" should hit ~0/0 when you look at the real Moon.
 *  - iOS: "offset spread" should stay near 0 while you tilt between flat and upright.
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
decl    {{ d()?.declination | number: '1.1-1' }}°
pointing az {{ d()?.pointingAz | number: '1.1-1' }}  alt {{
        d()?.pointingAlt | number: '1.1-1'
      }}  roll {{ d()?.roll | number: '1.0-0' }}
moon     az {{ moon()?.azimuthDeg | number: '1.1-1' }}  alt {{
        moon()?.altitudeDeg | number: '1.1-1'
      }}  {{ moon()?.phaseName }} {{ (moon()?.illuminatedFraction ?? 0) * 100 | number: '1.0-0' }}%
Δ to moon az {{ delta()?.az | number: '1.1-1' }}  alt {{ delta()?.alt | number: '1.1-1' }}</pre>
  `,
  styles: `
    :host {
      position: absolute;
      left: 0;
      bottom: 0;
      pointer-events: none;
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
  protected readonly moon = inject(SkyEngineService).moon;
  protected readonly d = this.ori.debug;
  protected readonly delta = computed(() => {
    const d = this.d(),
      m = this.moon();
    if (!d || !m) return null;
    return { az: wrap180(m.azimuthDeg - d.pointingAz), alt: m.altitudeDeg - d.pointingAlt };
  });
}
