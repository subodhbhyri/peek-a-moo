import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Red night mode: a full-viewport layer above every other layer that multiplies everything beneath it
 * (canvas, camera feed, picker, info cards) by a dim red. Multiplying by (r, 0, 0) keeps only the red
 * channel, which does not spoil dark adaptation, and r < 255 dims it. It takes no input (clicks go to
 * whatever is underneath) and is invisible to assistive technology.
 */
@Component({
  selector: 'app-night-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
  host: { 'aria-hidden': 'true' },
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 1000;
      pointer-events: none;
      background: #b30000;
      mix-blend-mode: multiply;
    }
  `,
})
export class NightOverlay {}
