import type { SkyFrame } from '../engine/sky-engine.service';
import { drawGlow } from './draw-planet';

/** Bright disc with a wide soft glow. No face, ever. */
export function drawSun(ctx: CanvasRenderingContext2D, frame: SkyFrame): void {
  const { x, y } = frame.projection;
  const r = frame.radiusPx;
  const color = frame.def.planet?.color ?? '#fff4d6';
  drawGlow(ctx, x, y, r, '#ffe9a8', 5, 0.55);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}
