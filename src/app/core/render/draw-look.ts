import type { LookFrame } from '../engine/sky-engine.service';
import { clamp, directionFromAzAlt } from '../math/vec3';
import { projectDirection } from '../projection/projection';
import { CONSTELLATION_TARGETS } from '../targets/constellation-targets';
import type { TargetDef } from '../targets/target.types';
import { drawBackgroundStars, drawConstellationLines } from './draw-sky';
import { bvToColor } from './draw-star';
import { LABEL_PADDING, LabelRequest, Rect, layoutLabels } from './label-layout';

const LABEL_FONT = '13px system-ui, sans-serif';
const CARDINAL_FONT = '600 14px system-ui, sans-serif';
const HALO = 'rgba(0, 0, 0, 0.75)';
const INK = '#f2efe6';
/** Below-horizon targets are drawn at this opacity, dashed. */
export const BELOW_HORIZON_ALPHA = 0.35;
/** Horizon sampling step, degrees of azimuth. */
const HORIZON_STEP_DEG = 3;
/** Minimum touch target, CSS px. */
export const MIN_TOUCH_PX = 44;
export const SUN_LABEL = "Sun — don't look";

const CARDINALS: readonly [string, number][] = [
  ['N', 0],
  ['E', 90],
  ['S', 180],
  ['W', 270],
];

/** What a tap can hit: the marker (grown to a comfortable touch size) and its label, if shown. */
export interface LookHit {
  id: string;
  marker: Rect;
  label: Rect | null;
  /** Marker center, for picking the nearest of several hits. */
  cx: number;
  cy: number;
}

export interface LookOnScreen {
  id: string;
  name: string;
  aboveHorizon: boolean;
}

export interface LookDrawResult {
  hits: LookHit[];
  onScreen: LookOnScreen[];
  /** Latin names of the constellations whose name point is on screen (empty when they are switched off). */
  constellations: string[];
}

const CONSTELLATION_FONT = '600 10px system-ui, sans-serif';
const CONSTELLATION_SPACING_PX = 2;
const CONSTELLATION_INK = 'rgba(233, 230, 220, 0.6)';
const CONSTELLATION_LATIN = new Map(CONSTELLATION_TARGETS.map((t) => [t.id, t.name]));

type SpacedContext = CanvasRenderingContext2D & { letterSpacing?: string };

/** Letter-spaced capitals, where the canvas supports letterSpacing (all current browsers); plain otherwise. */
function setConstellationFont(ctx: CanvasRenderingContext2D): void {
  ctx.font = CONSTELLATION_FONT;
  if ('letterSpacing' in ctx)
    (ctx as SpacedContext).letterSpacing = `${CONSTELLATION_SPACING_PX}px`;
}

function resetLetterSpacing(ctx: CanvasRenderingContext2D): void {
  if ('letterSpacing' in ctx) (ctx as SpacedContext).letterSpacing = '0px';
}

const constellationWidthCache = new Map<string, number>();

function constellationTextWidth(ctx: CanvasRenderingContext2D, text: string): number {
  const cached = constellationWidthCache.get(text);
  if (cached !== undefined) return cached;
  setConstellationFont(ctx);
  const w = ctx.measureText(text).width;
  resetLetterSpacing(ctx);
  const width = typeof w === 'number' && Number.isFinite(w) ? w : text.length * 8;
  constellationWidthCache.set(text, width);
  return width;
}

const widthCache = new Map<string, number>();

/** Text width in CSS px at the label font; cached, since the same few names repeat every frame. */
function textWidth(ctx: CanvasRenderingContext2D, text: string): number {
  const cached = widthCache.get(text);
  if (cached !== undefined) return cached;
  ctx.font = LABEL_FONT;
  const w = ctx.measureText(text).width;
  // A canvas that cannot measure (tests) falls back to a rough estimate.
  const width = typeof w === 'number' && Number.isFinite(w) ? w : text.length * 7;
  widthCache.set(text, width);
  return width;
}

/** Marker radius by brightness: brighter is larger, between 3 and 8 px; unknown magnitude is 4. */
export function markerRadiusFor(def: TargetDef, magnitude: number | null): number {
  if (def.kind === 'moon') return 7;
  if (def.kind === 'sun') return 8;
  if (def.kind === 'satellite') return 4;
  if (magnitude === null) return 4;
  return clamp(3 + (2 - magnitude) * 0.5, 3, 8);
}

function labelFor(def: TargetDef): string {
  return def.kind === 'sun' ? SUN_LABEL : def.shortName;
}

/** Extended objects are drawn as a small ellipse, wider than tall. */
const isExtended = (def: TargetDef) => def.render === 'extended';

function drawMarker(
  ctx: CanvasRenderingContext2D,
  def: TargetDef,
  x: number,
  y: number,
  r: number,
  above: boolean,
): void {
  ctx.globalAlpha = above ? 1 : BELOW_HORIZON_ALPHA;
  ctx.setLineDash(above ? [] : [3, 3]);
  ctx.lineWidth = 1.5;
  const color =
    def.render === 'planet'
      ? (def.planet?.color ?? INK)
      : def.render === 'star'
        ? bvToColor(def.fixed?.bv ?? 0.4)
        : def.render === 'sun'
          ? '#ffd24d'
          : def.render === 'extended'
            ? '#b9c6ff'
            : INK;
  ctx.beginPath();
  if (isExtended(def)) ctx.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2);
  else ctx.arc(x, y, r, 0, Math.PI * 2);
  if (above) {
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    // "Look through the ground": a dashed outline instead of a solid dot.
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

/** The horizon (altitude 0 every 3 degrees of azimuth, in-front segments only) and N, E, S, W on it. */
function drawHorizon(ctx: CanvasRenderingContext2D, frame: LookFrame): void {
  const { basis, viewport } = frame;
  const diag = Math.hypot(viewport.width, viewport.height);
  const pts: { x: number; y: number; ok: boolean }[] = [];
  for (let az = 0; az < 360; az += HORIZON_STEP_DEG) {
    const p = projectDirection(directionFromAzAlt(az, 0), basis, viewport);
    pts.push({ x: p.x, y: p.y, ok: p.inFront });
  }
  ctx.strokeStyle = 'rgba(233, 230, 220, 0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    // Skip segments that are behind the camera or that would streak across the screen near the edge-on limit.
    if (!a.ok || !b.ok || Math.hypot(a.x - b.x, a.y - b.y) > diag) continue;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();

  ctx.font = CARDINAL_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  for (const [letter, az] of CARDINALS) {
    const p = projectDirection(directionFromAzAlt(az, 0), basis, viewport);
    if (!p.inFront || p.x < 0 || p.x > viewport.width || p.y < 0 || p.y > viewport.height) continue;
    ctx.lineWidth = 3;
    ctx.strokeStyle = HALO;
    ctx.strokeText(letter, p.x, p.y - 3);
    ctx.fillStyle = INK;
    ctx.fillText(letter, p.x, p.y - 3);
  }
}

/**
 * Look Around: the horizon, N/E/S/W, and every target with its name. Names only, laid out so none covers
 * another label or marker (see label-layout). Returns what a tap can hit and which names are on screen.
 */
export function drawLook(ctx: CanvasRenderingContext2D, frame: LookFrame): LookDrawResult {
  const { viewport } = frame;
  drawHorizon(ctx, frame);
  const sky = frame.sky;
  const showFigures = !!sky && frame.constellationsOn === true;
  // Draw order: horizon, constellation lines, background stars, then the targets and all the names.
  if (sky && showFigures) drawConstellationLines(ctx, sky, viewport);
  if (sky) drawBackgroundStars(ctx, sky, viewport);

  const visible = frame.items.filter(
    (it) =>
      it.projection.inFront &&
      it.projection.x >= 0 &&
      it.projection.x <= viewport.width &&
      it.projection.y >= 0 &&
      it.projection.y <= viewport.height,
  );

  const requests: LabelRequest[] = visible.map((it) => {
    const text = labelFor(it.def);
    const r = markerRadiusFor(it.def, it.state.magnitude);
    return {
      id: it.def.id,
      x: it.projection.x,
      y: it.projection.y,
      markerRadius: r,
      textWidth: textWidth(ctx, text),
      textHeight: 13,
      aboveHorizon: it.aboveHorizon,
      magnitude: it.state.magnitude,
    };
  });
  // Constellation names go last in the layout (tiers 1-3 by rank) so they only take space targets left.
  const named: { id: string; text: string; index: number }[] = [];
  if (sky && showFigures) {
    for (const c of sky.geometry.constellations) {
      const p = c.labelIndex;
      if (sky.pointInFront[p] === 0) continue;
      const x = sky.pointX[p];
      const y = sky.pointY[p];
      if (x < 0 || x > viewport.width || y < 0 || y > viewport.height) continue;
      const text = (CONSTELLATION_LATIN.get(c.id) ?? c.id).toUpperCase();
      named.push({ id: c.id, text, index: requests.length });
      requests.push({
        id: c.id,
        x,
        y,
        markerRadius: 0,
        textWidth: constellationTextWidth(ctx, text),
        textHeight: 11,
        aboveHorizon: sky.pointEnu[p * 3 + 2] > 0,
        magnitude: null,
        tier: c.rank,
        centered: true,
      });
    }
  }
  const placements = layoutLabels(requests, viewport);

  ctx.font = LABEL_FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const hits: LookHit[] = [];
  visible.forEach((it, i) => {
    const { x, y } = it.projection;
    const r = requests[i].markerRadius;
    drawMarker(ctx, it.def, x, y, r, it.aboveHorizon);
    if (it.def.kind === 'sun') {
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚠️', x, y - r - 9);
      ctx.textAlign = 'left';
    }
    const box = placements[i].box;
    if (box) {
      ctx.globalAlpha = it.aboveHorizon ? 1 : BELOW_HORIZON_ALPHA + 0.25;
      ctx.lineWidth = 3;
      ctx.strokeStyle = HALO;
      ctx.strokeText(labelFor(it.def), box.x + LABEL_PADDING, box.y + box.h / 2);
      ctx.fillStyle = INK;
      ctx.fillText(labelFor(it.def), box.x + LABEL_PADDING, box.y + box.h / 2);
      ctx.globalAlpha = 1;
    }
    const half = Math.max(r, MIN_TOUCH_PX / 2);
    hits.push({
      id: it.def.id,
      marker: { x: x - half, y: y - half, w: half * 2, h: half * 2 },
      label: box ? growToTouch(box) : null,
      cx: x,
      cy: y,
    });
  });

  // Names last, dimmer than the targets' and never over them.
  if (named.length > 0) {
    setConstellationFont(ctx);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    for (const n of named) {
      const box = placements[n.index].box;
      if (!box) continue;
      const above = requests[n.index].aboveHorizon;
      ctx.globalAlpha = above ? 1 : 0.6;
      ctx.strokeStyle = HALO;
      ctx.strokeText(n.text, box.x + box.w / 2, box.y + box.h / 2);
      ctx.fillStyle = CONSTELLATION_INK;
      ctx.fillText(n.text, box.x + box.w / 2, box.y + box.h / 2);
    }
    ctx.globalAlpha = 1;
    resetLetterSpacing(ctx);
  }

  return {
    hits,
    onScreen: visible.map((it) => ({
      id: it.def.id,
      name: it.def.kind === 'sun' ? 'Sun' : it.def.shortName,
      aboveHorizon: it.aboveHorizon,
    })),
    constellations: named.map((n) => CONSTELLATION_LATIN.get(n.id) ?? n.id),
  };
}

/** A label box grown (about its center) to at least the minimum touch size. */
function growToTouch(b: Rect): Rect {
  const w = Math.max(b.w, MIN_TOUCH_PX);
  const h = Math.max(b.h, MIN_TOUCH_PX);
  return { x: b.x - (w - b.w) / 2, y: b.y - (h - b.h) / 2, w, h };
}

const contains = (r: Rect, x: number, y: number) =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** The id of the target whose marker or label was tapped (nearest marker center on ties), or null. */
export function hitTest(hits: readonly LookHit[], x: number, y: number): string | null {
  let best: { id: string; d: number } | null = null;
  for (const h of hits) {
    if (!contains(h.marker, x, y) && !(h.label && contains(h.label, x, y))) continue;
    const d = Math.hypot(h.cx - x, h.cy - y);
    if (!best || d < best.d) best = { id: h.id, d };
  }
  return best?.id ?? null;
}
