import type { SkyFrame } from '../engine/sky-engine.service';
import { positionAngleToScreen } from '../projection/sky-orientation';
import { withAlpha } from './draw-planet';

export const MARKER_LABEL = 'Galactic Center (hidden behind dust)';
const GALAXY_MAX_ALPHA = 0.35;

/** Small deterministic PRNG, so procedural detail is the same every frame. */
export function seededRandom(seedText: string): () => number {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Alpha multiplier that keeps a huge object (the LMC in a narrow field of view) from washing out the
 * screen: 1 until its semi-major axis passes 60% of the short side, then shrinking in proportion.
 */
export function washoutScale(semiMajorPx: number, shortSidePx: number): number {
  const limit = 0.6 * shortSidePx;
  return semiMajorPx <= limit ? 1 : limit / semiMajorPx;
}

/** Screen angle (y up) of the object's major axis: celestial north on screen plus the position angle. */
export function majorAxisScreenAngle(frame: SkyFrame): number {
  return positionAngleToScreen(frame.skyNorthRad, frame.def.fixed?.positionAngleDeg ?? 0);
}

/** Random point inside the unit disc, uniform by area. */
function inDisc(rnd: () => number): [number, number] {
  const r = Math.sqrt(rnd());
  const t = rnd() * Math.PI * 2;
  return [r * Math.cos(t), r * Math.sin(t)];
}

function blob(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  rgb: string,
  alpha: number,
): void {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, `rgba(${rgb},${alpha})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Procedural deep-sky objects at their true angular size (frame.radiusPx is the semi-major axis, already
 * clamped to the minimum sprite), rotated so the major axis lies along the sky position angle.
 */
export function drawExtended(ctx: CanvasRenderingContext2D, frame: SkyFrame): void {
  const f = frame.def.fixed;
  if (!f?.style) throw new Error(`Target "${frame.def.id}" has no extended style.`);
  const { x, y } = frame.projection;
  const a = frame.radiusPx;
  const [major, minor] = f.sizeDeg ?? [1, 1];
  const ratio = minor / major;
  const k = washoutScale(a, Math.min(frame.viewport.width, frame.viewport.height));
  const rnd = seededRandom(frame.def.id);

  if (f.style === 'marker') {
    drawMarker(ctx, x, y, a);
    return;
  }

  ctx.save();
  ctx.translate(x, y);
  // Canvas y points down, so a y-up screen angle is a canvas rotation of its negative.
  ctx.rotate(-majorAxisScreenAngle(frame));
  ctx.scale(1, ratio);

  if (f.style === 'galaxy') {
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, a);
    halo.addColorStop(0, `rgba(255,240,215,${GALAXY_MAX_ALPHA * k})`);
    halo.addColorStop(0.2, `rgba(235,230,235,${0.22 * k})`);
    halo.addColorStop(0.6, `rgba(200,210,255,${0.09 * k})`);
    halo.addColorStop(1, 'rgba(200,210,255,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, a, 0, Math.PI * 2);
    ctx.fill();
    blob(ctx, 0, 0, a * 0.16, '255,244,225', GALAXY_MAX_ALPHA * k);
  } else if (f.style === 'nebula') {
    const palette = ['255,120,180', '90,200,200', '255,150,200', '110,190,210', '230,120,170'];
    const count = 3 + Math.floor(rnd() * 3); // 3-5 blobs
    for (let i = 0; i < count; i++) {
      const [bx, by] = inDisc(rnd);
      blob(ctx, bx * a * 0.55, by * a * 0.55, a * (0.35 + rnd() * 0.25), palette[i], 0.26 * k);
    }
  } else {
    // cluster
    blob(ctx, 0, 0, a, '150,175,255', 0.1 * k);
    const count = 7 + Math.floor(rnd() * 4); // 7-10 stars
    for (let i = 0; i < count; i++) {
      const [sx, sy] = inDisc(rnd);
      const rr = 0.9 + rnd() * 1.1;
      ctx.fillStyle = withAlpha('#cfdcff', (0.75 + rnd() * 0.25) * k);
      ctx.beginPath();
      ctx.arc(sx * a * 0.85, sy * a * 0.85, rr, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawMarker(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(233, 230, 220, 0.8)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  const t = Math.max(6, r * 0.35);
  ctx.beginPath();
  ctx.moveTo(x - t, y);
  ctx.lineTo(x + t, y);
  ctx.moveTo(x, y - t);
  ctx.lineTo(x, y + t);
  ctx.stroke();
  ctx.fillStyle = 'rgba(233, 230, 220, 0.85)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(MARKER_LABEL, x, y + r + 16);
  ctx.restore();
}
