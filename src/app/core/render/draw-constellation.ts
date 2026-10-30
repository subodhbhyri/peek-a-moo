import type { SkyFrame } from '../engine/sky-engine.service';
import { drawBackgroundStars, drawConstellationLines } from './draw-sky';
import { STAR_COLORS } from '../sky/star-style';

/** The target's own figure is drawn at this opacity; the background stars are dimmed to make it stand out. */
export const FIGURE_ALPHA = 0.8;
const BACKGROUND_DIM = 0.6;
const FIGURE_STAR_RADIUS_PX = 3;
const NAME_FONT = '600 13px system-ui, sans-serif';

/**
 * Find mode for a constellation: faint background stars for context, then its figure bright (lines at
 * about 0.8, a larger dot on every star of it) and its name. Nothing is drawn until the star map has
 * loaded. Parts of the figure below the horizon are dashed and dimmer, as in Look Around.
 */
export function drawConstellation(ctx: CanvasRenderingContext2D, frame: SkyFrame): void {
  const sky = frame.sky;
  const geo = sky?.geometry.byId.get(frame.def.id);
  if (!sky || !geo) return;

  drawBackgroundStars(ctx, sky, frame.viewport, { alpha: BACKGROUND_DIM });
  drawConstellationLines(ctx, sky, frame.viewport, {
    alpha: FIGURE_ALPHA,
    lineWidth: 1.5,
    only: geo,
  });

  // The figure's own stars, brighter than the background.
  ctx.save();
  ctx.fillStyle = STAR_COLORS[2];
  for (let p = geo.vertexStart; p < geo.vertexEnd; p++) {
    if (sky.pointInFront[p] === 0) continue;
    const up = sky.pointEnu[p * 3 + 2] > 0;
    ctx.globalAlpha = up ? 0.95 : 0.4;
    ctx.beginPath();
    ctx.arc(sky.pointX[p], sky.pointY[p], FIGURE_STAR_RADIUS_PX, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Its name, at the label point when that is in front of the camera.
  const l = geo.labelIndex;
  if (sky.pointInFront[l] === 1) {
    ctx.save();
    ctx.font = NAME_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillStyle = '#f2efe6';
    ctx.strokeText(frame.def.name, sky.pointX[l], sky.pointY[l]);
    ctx.fillText(frame.def.name, sky.pointX[l], sky.pointY[l]);
    ctx.restore();
  }
}
