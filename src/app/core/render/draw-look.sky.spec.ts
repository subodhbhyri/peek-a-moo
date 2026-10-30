import type { LookFrame, LookItem, SkyFrame } from '../engine/sky-engine.service';
import { directionFromAzAlt } from '../math/vec3';
import { projectDirection } from '../projection/projection';
import { cameraBasisFromAzAlt } from '../sensors/orientation-math';
import { SkyField } from '../sky/sky-field';
import { STAR_ALPHA, STAR_COLORS } from '../sky/star-style';
import { skyGeometry } from '../sky/testing/sky-fixture';
import { getTarget } from '../targets/catalog';
import { constellationTargetState } from '../targets/providers/constellation';
import type { TargetState } from '../targets/target.types';
import { drawConstellation, FIGURE_ALPHA } from './draw-constellation';
import { drawLook } from './draw-look';
import {
  BELOW_HORIZON_STAR_FACTOR,
  LINE_ALPHA,
  drawBackgroundStars,
  drawConstellationLines,
} from './draw-sky';
import { recordingContext } from './testing/recording-context';

const VP = { width: 400, height: 800, vFovDeg: 62 };
const DENVER = { latitude: 39.6, longitude: -104.7, heightM: 1800 };
const WINTER_EVENING = new Date('2026-12-15T04:00:00Z'); // Orion up in the east
const SUMMER_MIDNIGHT = new Date('2026-06-21T06:00:00Z'); // Orion is down, with the Sun
const geometry = skyGeometry();
const orionDef = getTarget('orion')!;

function fieldAt(date: Date, lookAz: number, lookAlt: number) {
  const field = new SkyField(geometry);
  field.update(date, DENVER);
  const basis = cameraBasisFromAzAlt(lookAz, lookAlt);
  field.project(basis, VP);
  return { field, basis };
}

/** A camera looking at Orion's center at `date`, and the target's state. */
function lookingAtOrion(date: Date) {
  const state = constellationTargetState(orionDef, date, DENVER, geometry);
  return { state, ...fieldAt(date, state.azimuthDeg, state.altitudeDeg) };
}

const frame = (
  basis: LookFrame['basis'],
  field: SkyField,
  constellationsOn: boolean,
  items: LookItem[] = [],
): LookFrame => ({ viewport: VP, basis, items, sky: field, constellationsOn });
const texts = (log: string[]) =>
  log
    .filter((l) => l.startsWith('fillText('))
    .map((l) => JSON.parse(`[${l.slice(9, -1)}]`)[0] as string);
const firstIndex = (log: string[], pred: (l: string) => boolean) => log.findIndex(pred);
const alphas = (log: string[]) =>
  log.filter((l) => l.startsWith('globalAlpha=')).map((l) => Number(l.slice(12)));

describe('background stars', () => {
  it('draws only stars in front of the camera and on screen, batched into a few fills', () => {
    const { field } = lookingAtOrion(WINTER_EVENING);
    const { ctx, log } = recordingContext();
    drawBackgroundStars(ctx, field, VP);
    let expected = 0;
    for (let i = 0; i < geometry.starCount; i++) {
      if (
        field.starInFront[i] === 1 &&
        field.starX[i] >= -4 &&
        field.starX[i] <= VP.width + 4 &&
        field.starY[i] >= -4 &&
        field.starY[i] <= VP.height + 4
      ) {
        expected++;
      }
    }
    expect(expected).toBeGreaterThan(30);
    expect(log.filter((l) => l.startsWith('arc(')).length).toBe(expected);
    // One fill per non-empty (size, color, above/below) bucket: far fewer than one per star.
    const fills = log.filter((l) => l === 'fill()').length;
    expect(fills).toBeGreaterThan(0);
    expect(fills).toBeLessThan(expected);
    expect(fills).toBeLessThanOrEqual(2 * STAR_COLORS.length * STAR_ALPHA.length);
  });

  it('draws stars below the horizon at 25% of their opacity, and above it at full', () => {
    // Looking along the horizon: stars on both sides of it are on screen.
    const { field } = fieldAt(WINTER_EVENING, 120, 0);
    const { ctx, log } = recordingContext();
    drawBackgroundStars(ctx, field, VP);
    const used = new Set(alphas(log).map((a) => Number(a.toFixed(6))));
    const above = STAR_ALPHA.map((a) => Number(a.toFixed(6)));
    const below = STAR_ALPHA.map((a) => Number((a * BELOW_HORIZON_STAR_FACTOR).toFixed(6)));
    expect(BELOW_HORIZON_STAR_FACTOR).toBe(0.25);
    expect([...used].some((a) => above.includes(a))).toBe(true);
    expect([...used].some((a) => below.includes(a))).toBe(true);
    for (const a of used) {
      if (a === 1) continue; // ctx.restore resets
      expect(above.includes(a) || below.includes(a), `unexpected alpha ${a}`).toBe(true);
    }
  });

  it('colors come from the B-V table: blue-white and orange stars are drawn in different colors', () => {
    const { field } = lookingAtOrion(WINTER_EVENING);
    const { ctx, log } = recordingContext();
    drawBackgroundStars(ctx, field, VP);
    const colors = new Set(
      log.filter((l) => l.startsWith('fillStyle=')).map((l) => JSON.parse(l.slice(10)) as string),
    );
    expect(colors.size).toBeGreaterThan(2);
    for (const c of colors) expect(STAR_COLORS).toContain(c);
  });

  it('dims with the alpha option (find mode)', () => {
    const { field } = lookingAtOrion(WINTER_EVENING);
    const { ctx, log } = recordingContext();
    drawBackgroundStars(ctx, field, VP, { alpha: 0.5 });
    const max = Math.max(...alphas(log).filter((a) => a < 1));
    expect(max).toBeLessThanOrEqual(STAR_ALPHA[0] * 0.5 + 1e-9);
  });
});

describe('constellation lines', () => {
  it('draws a segment only when both of its ends are in front of the camera', () => {
    const orion = geometry.byId.get('orion')!;
    // Looking straight away from Orion: every vertex is behind the camera, so nothing is drawn.
    const state = constellationTargetState(orionDef, WINTER_EVENING, DENVER, geometry);
    const { field } = fieldAt(WINTER_EVENING, state.azimuthDeg + 180, -state.altitudeDeg);
    for (let p = orion.vertexStart; p < orion.vertexEnd; p++) {
      expect(field.pointInFront[p]).toBe(0);
    }
    const away = recordingContext();
    drawConstellationLines(away.ctx, field, VP, { only: orion });
    expect(away.log.filter((l) => l.startsWith('moveTo(') || l.startsWith('lineTo('))).toEqual([]);

    // Looking at it: segments appear, all with finite coordinates.
    const { field: near } = lookingAtOrion(WINTER_EVENING);
    const at = recordingContext();
    drawConstellationLines(at.ctx, near, VP, { only: orion });
    const lines = at.log.filter((l) => l.startsWith('lineTo('));
    expect(lines.length).toBeGreaterThan(5);
    for (const l of lines) {
      const [x, y] = JSON.parse(`[${l.slice(7, -1)}]`) as number[];
      expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
    }
  });

  it('is thin (1 px) and faint (~0.25) above the horizon; below it the lines are dashed at half that', () => {
    expect(LINE_ALPHA).toBe(0.25);
    const up = lookingAtOrion(WINTER_EVENING);
    const a = recordingContext();
    drawConstellationLines(a.ctx, up.field, VP);
    expect(a.log).toContain('lineWidth=1');
    expect(a.log).toContain('strokeStyle="rgba(233, 230, 220, 0.25)"');

    const down = lookingAtOrion(SUMMER_MIDNIGHT);
    expect(down.state.altitudeDeg).toBeLessThan(0); // Orion is below the horizon
    const b = recordingContext();
    drawConstellationLines(b.ctx, down.field, VP, { only: geometry.byId.get('orion')! });
    const dash = firstIndex(b.log, (l) => l === 'setLineDash([4,4])');
    const half = firstIndex(b.log, (l) => l === 'strokeStyle="rgba(233, 230, 220, 0.125)"');
    expect(dash).toBeGreaterThan(-1);
    expect(half).toBeGreaterThan(-1);
    // The dashed pass strokes real segments.
    expect(b.log.slice(dash).some((l) => l.startsWith('lineTo('))).toBe(true);
    // And the solid pass has none: all of Orion is below the horizon.
    const solid = b.log.slice(0, dash);
    expect(solid.some((l) => l.startsWith('lineTo('))).toBe(false);
  });

  it('the figure drawn for a target uses the stronger alpha', () => {
    expect(FIGURE_ALPHA).toBe(0.8);
  });
});

describe('Look Around with the star map', () => {
  const jupiterAt = (basis: LookFrame['basis'], az: number, alt: number): LookItem => {
    const def = getTarget('jupiter')!;
    const direction = directionFromAzAlt(az, alt);
    const state: TargetState = {
      id: 'jupiter',
      computedAt: new Date(0),
      direction,
      azimuthDeg: az,
      altitudeDeg: alt,
      magnitude: -2,
      angularSizeDeg: 0.01,
    };
    return { def, state, projection: projectDirection(direction, basis, VP), aboveHorizon: true };
  };

  it('draws in order: horizon, constellation lines, background stars, target markers, then the names', () => {
    const { state, field, basis } = lookingAtOrion(WINTER_EVENING);
    // A planet a few degrees from the center, so its marker and label are on screen.
    const jup = jupiterAt(basis, state.azimuthDeg + 4, state.altitudeDeg + 8);
    const { ctx, log } = recordingContext();
    const result = drawLook(ctx, frame(basis, field, true, [jup]));

    const horizon = firstIndex(log, (l) => l === 'strokeStyle="rgba(233, 230, 220, 0.28)"');
    const lines = firstIndex(log, (l) => l === 'strokeStyle="rgba(233, 230, 220, 0.25)"');
    const stars = firstIndex(
      log,
      (l) => l.startsWith('fillStyle="') && STAR_COLORS.some((c) => l === `fillStyle="${c}"`),
    );
    const marker = firstIndex(
      log,
      (l) => l === `fillStyle="${getTarget('jupiter')!.planet!.color}"`,
    );
    const targetLabel = firstIndex(log, (l) => l.startsWith('fillText("Jupiter"'));
    const names = firstIndex(log, (l) => l.startsWith('fillText("ORION"'));
    expect(horizon).toBeGreaterThan(-1);
    expect(lines).toBeGreaterThan(horizon);
    expect(stars).toBeGreaterThan(lines);
    expect(marker).toBeGreaterThan(stars);
    expect(targetLabel).toBeGreaterThan(marker);
    expect(names).toBeGreaterThan(targetLabel);
    expect(result.constellations).toContain('Orion');
  });

  it('constellation names are letter-spaced capitals, dimmer than the target labels', () => {
    const { field, basis } = lookingAtOrion(WINTER_EVENING);
    const rec = recordingContext();
    const log = rec.log;
    // A real canvas has letterSpacing; the recording proxy needs to say so.
    const ctx = new Proxy(rec.ctx, { has: () => true });
    drawLook(ctx, frame(basis, field, true));
    const caps = texts(log).filter((t) => /^[A-Z][A-Z ]+$/.test(t) && t.length > 3);
    expect(caps).toContain('ORION');
    expect(log).toContain('font="600 10px system-ui, sans-serif"');
    expect(log).toContain('letterSpacing="2px"');
    // Dimmer than the targets' near-white ink.
    expect(log).toContain('fillStyle="rgba(233, 230, 220, 0.6)"');
    // Letter spacing is reset so it cannot leak into other text.
    expect(log).toContain('letterSpacing="0px"');
  });

  it('with constellations off: no lines, no names, no names for screen readers, but the stars stay', () => {
    const { field, basis } = lookingAtOrion(WINTER_EVENING);
    const { ctx, log } = recordingContext();
    const result = drawLook(ctx, frame(basis, field, false));
    expect(log).not.toContain('strokeStyle="rgba(233, 230, 220, 0.25)"');
    expect(texts(log).filter((t) => /^[A-Z][A-Z ]+$/.test(t) && t.length > 3)).toEqual([]);
    expect(result.constellations).toEqual([]);
    expect(log.filter((l) => l.startsWith('arc(')).length).toBeGreaterThan(30);
  });

  it('without a loaded star map, Look Around draws exactly as before (no stars, lines or names)', () => {
    const { ctx, log } = recordingContext();
    const result = drawLook(ctx, {
      viewport: VP,
      basis: cameraBasisFromAzAlt(180, 10),
      items: [],
    });
    expect(log.filter((l) => l.startsWith('arc('))).toEqual([]);
    expect(result.constellations).toEqual([]);
  });

  it('lists the constellation names that are on screen for screen readers (Latin, proper case)', () => {
    const { field, basis } = lookingAtOrion(WINTER_EVENING);
    const { ctx } = recordingContext();
    const result = drawLook(ctx, frame(basis, field, true));
    expect(result.constellations).toContain('Orion');
    for (const name of result.constellations) expect(name).not.toBe(name.toUpperCase());
  });
});

describe('constellation as the target (find mode)', () => {
  function skyFrame(
    field: SkyField | undefined,
    state: TargetState,
    basis: LookFrame['basis'],
  ): SkyFrame {
    return {
      def: orionDef,
      target: state,
      viewport: VP,
      projection: projectDirection(state.direction, basis, VP, 200),
      radiusPx: 200,
      brightLimbRad: null,
      skyNorthRad: 0,
      phase: 'searching',
      searchElapsedMs: 0,
      findCount: 0,
      lastFindDurationMs: null,
      ...(field && { sky: field }),
    };
  }

  it('draws its own figure bright (0.8), a dot on every star of it, its name, and dimmed background stars', () => {
    const { state, field, basis } = lookingAtOrion(WINTER_EVENING);
    const { ctx, log } = recordingContext();
    drawConstellation(ctx, skyFrame(field, state, basis));
    expect(log).toContain('strokeStyle="rgba(233, 230, 220, 0.8)"');
    expect(texts(log)).toContain('Orion');
    const orion = geometry.byId.get('orion')!;
    let verts = 0;
    for (let p = orion.vertexStart; p < orion.vertexEnd; p++)
      if (field.pointInFront[p] === 1) verts++;
    // Figure dots have radius 3; the background stars are all smaller.
    const dots = log.filter((l) => /^arc\([^,]+,[^,]+,3,/.test(l)).length;
    expect(dots).toBe(verts);
    // Background stars are dimmer than the figure.
    const bg = alphas(log).filter((a) => a < 0.6 && a > 0);
    expect(bg.length).toBeGreaterThan(0);
  });

  it('draws nothing until the star map is there', () => {
    const { state, basis } = lookingAtOrion(WINTER_EVENING);
    const { ctx, log } = recordingContext();
    drawConstellation(ctx, skyFrame(undefined, state, basis));
    expect(log).toEqual([]);
  });
});
