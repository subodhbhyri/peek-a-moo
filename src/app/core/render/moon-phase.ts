import { PhasedDiscStyle, drawPhasedDisc } from './phased-disc';

export type MoonPhaseStyle = PhasedDiscStyle;

export const DEFAULT_MOON_STYLE: MoonPhaseStyle = {
  lit: '#f2efe6',
  dark: 'rgba(242, 239, 230, 0.07)',
};

/**
 * Draws the Moon's phase: the shared phased-disc renderer with the Moon's colors.
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
  drawPhasedDisc(ctx, x, y, r, illuminatedFraction, brightLimbRad, style);
}
