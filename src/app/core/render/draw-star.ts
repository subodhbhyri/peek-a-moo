import type { SkyFrame } from '../engine/sky-engine.service';
import { clamp } from '../math/vec3';
import { drawGlow } from './draw-planet';

/** Relative brightness: 1 at magnitude 1, clamped so the faintest and brightest stars stay drawable. */
export function starBrightness(mag: number): number {
  return clamp(Math.pow(10, -0.4 * (mag - 1)), 0.15, 4);
}

/** Core radius in CSS px. */
export function starCoreRadiusPx(mag: number): number {
  return 2.5 + 2 * Math.sqrt(starBrightness(mag));
}

/** Glow radius in CSS px (~6x the core). Also the star's visible extent. */
export function starGlowRadiusPx(mag: number): number {
  return 6 * starCoreRadiusPx(mag);
}

const BV_TABLE: readonly (readonly [number, number, number, number])[] = [
  [-0.3, 0x9b, 0xb0, 0xff],
  [0.0, 0xca, 0xd7, 0xff],
  [0.6, 0xff, 0xf4, 0xea],
  [1.2, 0xff, 0xd2, 0xa1],
  [1.85, 0xff, 0xb3, 0x6b],
];

/** Star color from B-V: piecewise-linear through the table, clamped at both ends. */
export function bvToColor(bv: number): string {
  const first = BV_TABLE[0];
  const last = BV_TABLE[BV_TABLE.length - 1];
  const c = clamp(bv, first[0], last[0]);
  let lo = first;
  let hi = last;
  for (let i = 0; i < BV_TABLE.length - 1; i++) {
    if (c >= BV_TABLE[i][0] && c <= BV_TABLE[i + 1][0]) {
      lo = BV_TABLE[i];
      hi = BV_TABLE[i + 1];
      break;
    }
  }
  const t = hi[0] === lo[0] ? 0 : (c - lo[0]) / (hi[0] - lo[0]);
  const ch = (k: 1 | 2 | 3) => Math.round(lo[k] + (hi[k] - lo[k]) * t);
  return '#' + [ch(1), ch(2), ch(3)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

const TWINKLE_HZ = 1.5;
const TWINKLE_DEPTH = 0.08;

let reducedMotionCache: boolean | null = null;
function prefersReducedMotion(): boolean {
  reducedMotionCache ??=
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  return reducedMotionCache;
}

/** Alpha multiplier for the twinkle at `timeMs`: 1 ± 8% at ~1.5 Hz, or exactly 1 for reduced motion. */
export function twinkleFactor(timeMs: number, reducedMotion: boolean): number {
  if (reducedMotion) return 1;
  return 1 + TWINKLE_DEPTH * Math.sin(2 * Math.PI * TWINKLE_HZ * (timeMs / 1000));
}

export interface StarDrawOptions {
  timeMs?: number;
  reducedMotion?: boolean;
}

/** A point of light with a soft glow, sized by magnitude and tinted by B-V. */
export function drawStar(
  ctx: CanvasRenderingContext2D,
  frame: SkyFrame,
  opts: StarDrawOptions = {},
): void {
  const f = frame.def.fixed;
  if (!f) throw new Error(`Target "${frame.def.id}" has no fixed-sky data.`);
  const mag = f.magnitude ?? 6;
  const { x, y } = frame.projection;
  const color = bvToColor(f.bv ?? 0.6);
  const twinkle = twinkleFactor(
    opts.timeMs ?? performance.now(),
    opts.reducedMotion ?? prefersReducedMotion(),
  );
  const core = starCoreRadiusPx(mag);

  ctx.save();
  ctx.globalAlpha = Math.min(1, twinkle);
  drawGlow(ctx, x, y, core, color, 6, 0.4 * twinkle);
  ctx.beginPath();
  ctx.arc(x, y, core, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}
