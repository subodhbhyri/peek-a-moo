import type { Viewport } from '../projection/projection';
import type { SkyField } from '../sky/sky-field';
import type { ConstellationGeo } from '../sky/sky-geometry';
import {
  STAR_ALPHA,
  STAR_COLORS,
  STAR_COLOR_COUNT,
  STAR_RADIUS_PX,
  STAR_SIZE_COUNT,
} from '../sky/star-style';

/** Background stars below the horizon are drawn at this fraction of their opacity. */
export const BELOW_HORIZON_STAR_FACTOR = 0.25;
/** Constellation lines: opacity above the horizon; below it they are half of this, dashed. */
export const LINE_ALPHA = 0.25;
const LINE_COLOR = '233, 230, 220';

const BUCKETS_PER_HALF = STAR_SIZE_COUNT * STAR_COLOR_COUNT;
const BUCKETS = BUCKETS_PER_HALF * 2;

/** Per-frame scratch for batching stars into (above/below, size, color) buckets; grown once, never per frame. */
let order = new Uint32Array(0);
const counts = new Uint32Array(BUCKETS + 1);
const cursor = new Uint32Array(BUCKETS);
let bucketOfStars = new Uint8Array(0);

export interface StarDrawOptions {
  /** Multiplier on every star's opacity (find mode dims the background so the figure stands out). */
  alpha?: number;
}

/**
 * The background stars: one path and one fill per (size, color, above/below-horizon) bucket, so a frame
 * costs a few dozen fills rather than a thousand. Stars off screen or behind the camera are skipped.
 * No allocations in steady state.
 */
export function drawBackgroundStars(
  ctx: CanvasRenderingContext2D,
  field: SkyField,
  viewport: Viewport,
  opts: StarDrawOptions = {},
): void {
  const g = field.geometry;
  const n = g.starCount;
  if (order.length < n) {
    order = new Uint32Array(n);
    bucketOfStars = new Uint8Array(n);
  }
  counts.fill(0);
  const { width, height } = viewport;
  const margin = 4;
  for (let i = 0; i < n; i++) {
    if (field.starInFront[i] === 0) {
      bucketOfStars[i] = 255;
      continue;
    }
    const x = field.starX[i];
    const y = field.starY[i];
    if (x < -margin || x > width + margin || y < -margin || y > height + margin) {
      bucketOfStars[i] = 255;
      continue;
    }
    const below = field.starEnu[i * 3 + 2] > 0 ? 0 : BUCKETS_PER_HALF;
    const b = below + g.starSize[i] * STAR_COLOR_COUNT + g.starColor[i];
    bucketOfStars[i] = b;
    counts[b + 1]++;
  }
  for (let b = 0; b < BUCKETS; b++) counts[b + 1] += counts[b];
  // `counts[b]` is now where bucket b starts; fill using a moving cursor per bucket.
  cursor.set(counts.subarray(0, BUCKETS));
  for (let i = 0; i < n; i++) {
    const b = bucketOfStars[i];
    if (b !== 255) order[cursor[b]++] = i;
  }

  const base = opts.alpha ?? 1;
  ctx.save();
  for (let b = 0; b < BUCKETS; b++) {
    const start = counts[b];
    const end = counts[b + 1];
    if (start === end) continue;
    const half = b >= BUCKETS_PER_HALF ? b - BUCKETS_PER_HALF : b;
    const size = Math.floor(half / STAR_COLOR_COUNT);
    const color = half % STAR_COLOR_COUNT;
    const r = STAR_RADIUS_PX[size];
    ctx.globalAlpha =
      STAR_ALPHA[size] * base * (b >= BUCKETS_PER_HALF ? BELOW_HORIZON_STAR_FACTOR : 1);
    ctx.fillStyle = STAR_COLORS[color];
    ctx.beginPath();
    for (let k = start; k < end; k++) {
      const i = order[k];
      const x = field.starX[i];
      const y = field.starY[i];
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.restore();
}

export interface LineDrawOptions {
  /** Opacity above the horizon. Below it, half of this, dashed. */
  alpha?: number;
  /** CSS px. */
  lineWidth?: number;
  /** Draw only this constellation. Default: all 88. */
  only?: ConstellationGeo;
}

/**
 * Constellation stick figures: a segment is drawn only when both ends are in front of the camera. A segment
 * with both ends above the horizon is solid; any part below it is dashed at half the opacity (you are
 * looking through the ground). Segments wholly off the same side of the screen are skipped.
 */
export function drawConstellationLines(
  ctx: CanvasRenderingContext2D,
  field: SkyField,
  viewport: Viewport,
  opts: LineDrawOptions = {},
): void {
  const alpha = opts.alpha ?? LINE_ALPHA;
  const list = opts.only ? [opts.only] : field.geometry.constellations;
  const { width, height } = viewport;
  ctx.save();
  ctx.lineWidth = opts.lineWidth ?? 1;
  for (const pass of [0, 1] as const) {
    const above = pass === 0;
    ctx.strokeStyle = `rgba(${LINE_COLOR}, ${above ? alpha : alpha / 2})`;
    ctx.setLineDash(above ? [] : [4, 4]);
    ctx.beginPath();
    for (const c of list) {
      const seg = c.segments;
      for (let s = 0; s < seg.length; s += 2) {
        const a = seg[s];
        const b = seg[s + 1];
        if (field.pointInFront[a] === 0 || field.pointInFront[b] === 0) continue;
        const ax = field.pointX[a],
          ay = field.pointY[a],
          bx = field.pointX[b],
          by = field.pointY[b];
        if ((ax < 0 && bx < 0) || (ax > width && bx > width)) continue;
        if ((ay < 0 && by < 0) || (ay > height && by > height)) continue;
        const bothUp = field.pointEnu[a * 3 + 2] > 0 && field.pointEnu[b * 3 + 2] > 0;
        if (bothUp !== above) continue;
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}
