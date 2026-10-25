import type { SkyFrame } from '../engine/sky-engine.service';
import { drawExtended } from './draw-extended';
import { drawPlanet } from './draw-planet';
import { drawStar } from './draw-star';
import { drawSun } from './draw-sun';
import { drawMoonPhase } from './moon-phase';

/** Draws the frame's target at its projected position, dispatching on the catalog's render style. */
export function drawTarget(ctx: CanvasRenderingContext2D, frame: SkyFrame): void {
  const { x, y } = frame.projection;
  switch (frame.def.render) {
    case 'moon':
      drawMoonPhase(
        ctx,
        x,
        y,
        frame.radiusPx,
        frame.target.phase?.illuminatedFraction ?? 1,
        frame.brightLimbRad ?? 0,
      );
      return;
    case 'planet':
      drawPlanet(ctx, frame);
      return;
    case 'sun':
      drawSun(ctx, frame);
      return;
    case 'star':
      drawStar(ctx, frame);
      return;
    case 'extended':
      drawExtended(ctx, frame);
      return;
    default:
      throw new Error(`Render style "${frame.def.render}" is not implemented yet.`);
  }
}
