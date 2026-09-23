export interface MoonPhaseStyle {
  lit: string;
  /** The unlit part isn't black: earthshine makes it faintly visible. */
  dark: string;
}

export const DEFAULT_MOON_STYLE: MoonPhaseStyle = {
  lit: '#f2efe6',
  dark: 'rgba(242, 239, 230, 0.07)',
};

/**
 * Draws a geometrically correct phase.
 *
 * In a frame rotated so the lit limb faces +x, the lit region is bounded by
 *   - the right half of the disc (the limb), and
 *   - the terminator: a half-ellipse with semi-axes (r * |1 - 2k|, r), where k = illuminated fraction.
 *     Crescent (k < .5): the ellipse bulges toward the lit side and eats into it.
 *     Gibbous  (k > .5): it bulges away from the lit side and adds to it.
 *
 * @param brightLimbRad screen angle of the lit limb, y UP (from brightLimbScreenAngle)
 */
export function drawMoonPhase(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  illuminatedFraction: number,
  brightLimbRad: number,
  style: MoonPhaseStyle = DEFAULT_MOON_STYLE,
): void {
  const k = Math.min(1, Math.max(0, illuminatedFraction));
  ctx.save();
  ctx.translate(x, y);
  // Canvas y points down, so a y-up angle θ is a canvas rotation of -θ.
  ctx.rotate(-brightLimbRad);

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = style.dark;
  ctx.fill();

  if (k > 0.001) {
    const w = r * Math.abs(1 - 2 * k);
    ctx.beginPath();
    ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false); // top -> right -> bottom
    if (k < 0.5) {
      ctx.ellipse(0, 0, w, r, 0, Math.PI / 2, -Math.PI / 2, true); // bottom -> right -> top
    } else {
      ctx.ellipse(0, 0, w, r, 0, Math.PI / 2, (3 * Math.PI) / 2, false); // bottom -> left -> top
    }
    ctx.closePath();
    ctx.fillStyle = style.lit;
    ctx.fill();
  }
  ctx.restore();
}
