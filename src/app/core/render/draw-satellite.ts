import type { SkyFrame } from '../engine/sky-engine.service';
import { drawGlow, withAlpha } from './draw-planet';

/** Fixed core radius, CSS px. No size exaggeration beyond this. */
export const SATELLITE_CORE_PX = 6;
const COLOR = '#f4f1e6';
const ARROW_GAP_PX = 6;
const ARROW_LEN_PX = 9;

/**
 * A satellite: a bright dot when sunlit, a dim hollow dot in Earth's shadow, a fading trail through
 * the projected trail points (newest first), a small arrow along the direction of travel, and its name.
 */
export function drawSatellite(ctx: CanvasRenderingContext2D, frame: SkyFrame): void {
  const { x, y } = frame.projection;
  const sunlit = frame.target.satellite?.sunlit ?? true;
  const r = SATELLITE_CORE_PX;
  const trail = frame.trail ?? [];

  // Trail: segments fade with age. Stops at the first point that cannot be drawn (behind the camera).
  let px = x;
  let py = y;
  for (let i = 0; i < trail.length; i++) {
    const p = trail[i];
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) break;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(p.x, p.y);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = withAlpha(COLOR, (sunlit ? 0.7 : 0.3) * (1 - i / trail.length));
    ctx.stroke();
    px = p.x;
    py = p.y;
  }

  if (sunlit) {
    drawGlow(ctx, x, y, r, '#fff6d8', 3.5, 0.5);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = COLOR;
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = withAlpha(COLOR, 0.45);
    ctx.stroke();
  }

  // Direction of travel: from the newest trail point toward the current position, on screen.
  const first = trail[0];
  if (first && Number.isFinite(first.x) && Number.isFinite(first.y)) {
    const dx = x - first.x;
    const dy = y - first.y;
    const len = Math.hypot(dx, dy);
    if (len > 1e-6) {
      const ux = dx / len;
      const uy = dy / len;
      const tipX = x + ux * (r + ARROW_GAP_PX + ARROW_LEN_PX);
      const tipY = y + uy * (r + ARROW_GAP_PX + ARROW_LEN_PX);
      const baseX = x + ux * (r + ARROW_GAP_PX);
      const baseY = y + uy * (r + ARROW_GAP_PX);
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(baseX - uy * 4, baseY + ux * 4);
      ctx.lineTo(baseX + uy * 4, baseY - ux * 4);
      ctx.closePath();
      ctx.fillStyle = withAlpha(COLOR, sunlit ? 0.8 : 0.4);
      ctx.fill();
    }
  }

  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = withAlpha(COLOR, sunlit ? 0.85 : 0.45);
  ctx.fillText(frame.def.shortName, x + r + 8, y - r - 6);
}
