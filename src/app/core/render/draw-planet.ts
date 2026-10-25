import type { SkyFrame } from '../engine/sky-engine.service';
import { DEG } from '../math/vec3';
import { drawPhasedDisc } from './phased-disc';

/** Saturn's outer ring edge, in globe radii. */
export const RING_OUTER = 2.25;
const RING_INNER = 1.55;
const MIN_RING_RATIO = 0.08;
/** Cosmetic: the ring plane is turned a little off the east-west line. */
const RING_TWIST_DEG = 6;

/** "#rrggbb" -> "rgba(r,g,b,a)". */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Soft halo behind a disc: fades from `alpha` at the limb to nothing at `reach` radii. */
export function drawGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  reach: number,
  alpha: number,
): void {
  const g = ctx.createRadialGradient(x, y, r * 0.9, x, y, r * reach);
  g.addColorStop(0, withAlpha(color, alpha));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * reach, 0, Math.PI * 2);
  ctx.fill();
}

/** Half of the ring annulus: back = far side (above the globe's center line), front = near side. */
function ringHalf(
  ctx: CanvasRenderingContext2D,
  r: number,
  ratio: number,
  half: 'back' | 'front',
  color: string,
): void {
  const [a0, a1] = half === 'back' ? [Math.PI, Math.PI * 2] : [0, Math.PI];
  ctx.beginPath();
  ctx.ellipse(0, 0, r * RING_OUTER, r * RING_OUTER * ratio, 0, a0, a1, false);
  ctx.ellipse(0, 0, r * RING_INNER, r * RING_INNER * ratio, 0, a1, a0, true);
  ctx.closePath();
  ctx.fillStyle = withAlpha(color, half === 'back' ? 0.45 : 0.7);
  ctx.fill();
}

/**
 * Planet disc with a soft glow. Mercury/Venus get a phase, Jupiter gets faint bands, Saturn gets rings.
 * Bands and rings are oriented from celestial north on screen (cosmetic, not ephemeris-accurate).
 */
export function drawPlanet(ctx: CanvasRenderingContext2D, frame: SkyFrame): void {
  const style = frame.def.planet;
  if (!style) throw new Error(`Target "${frame.def.id}" has no planet style.`);
  const { x, y } = frame.projection;
  const r = frame.radiusPx;

  drawGlow(ctx, x, y, r, style.color, 2.2, 0.35);

  // Direction (y up, radians) of the east-west line through the planet; canvas rotation is its negative.
  const ewRad = frame.skyNorthRad + Math.PI / 2;
  const rings = style.rings ? frame.target.rings : undefined;
  const ringRatio = rings ? Math.max(Math.sin(Math.abs(rings.tiltDeg) * DEG), MIN_RING_RATIO) : 0;

  if (rings) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-(ewRad + RING_TWIST_DEG * DEG));
    ringHalf(ctx, r, ringRatio, 'back', style.color);
    ctx.restore();
  }

  if (style.phased && frame.target.phase && frame.brightLimbRad !== null) {
    drawPhasedDisc(ctx, x, y, r, frame.target.phase.illuminatedFraction, frame.brightLimbRad, {
      lit: style.color,
      dark: 'rgba(255, 255, 255, 0.07)',
    });
  } else {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = style.color;
    ctx.fill();
  }

  if (style.bands) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-ewRad);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(120, 80, 50, 0.22)';
    for (const [offset, height] of [
      [-0.55, 0.16],
      [-0.12, 0.2],
      [0.3, 0.14],
      [0.62, 0.12],
    ]) {
      ctx.fillRect(-r, offset * r - (height * r) / 2, 2 * r, height * r);
    }
    ctx.restore();
  }

  if (rings) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-(ewRad + RING_TWIST_DEG * DEG));
    ringHalf(ctx, r, ringRatio, 'front', style.color);
    ctx.restore();
  }
}
