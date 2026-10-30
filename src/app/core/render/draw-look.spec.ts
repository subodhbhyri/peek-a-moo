import type { LookFrame, LookItem } from '../engine/sky-engine.service';
import { directionFromAzAlt } from '../math/vec3';
import { projectDirection } from '../projection/projection';
import { cameraBasisFromAzAlt } from '../sensors/orientation-math';
import { TARGETS, getTarget } from '../targets/catalog';
import type { TargetState } from '../targets/target.types';
import {
  BELOW_HORIZON_ALPHA,
  MIN_TOUCH_PX,
  SUN_LABEL,
  drawLook,
  hitTest,
  markerRadiusFor,
} from './draw-look';
import { recordingContext } from './testing/recording-context';

const VP = { width: 400, height: 800, vFovDeg: 62 };
const basis = cameraBasisFromAzAlt(180, 10);

function item(id: string, az: number, alt: number, magnitude: number | null = 0): LookItem {
  const def = getTarget(id)!;
  const direction = directionFromAzAlt(az, alt);
  const state: TargetState = {
    id,
    computedAt: new Date(0),
    direction,
    azimuthDeg: az,
    altitudeDeg: alt,
    magnitude,
    angularSizeDeg: 0.5,
  };
  return { def, state, projection: projectDirection(direction, basis, VP), aboveHorizon: alt > 0 };
}
const frameOf = (items: LookItem[]): LookFrame => ({ viewport: VP, basis, items });
const texts = (log: string[]) =>
  log
    .filter((l) => l.startsWith('fillText('))
    .map((l) => JSON.parse(`[${l.slice(9, -1)}]`)[0] as string);

describe('drawLook', () => {
  it('draws a horizon line and N/E/S/W letters where they are in front of the camera', () => {
    const { ctx, log } = recordingContext();
    drawLook(ctx, frameOf([]));
    expect(log.filter((l) => l.startsWith('lineTo(')).length).toBeGreaterThan(5);
    // Looking south, with a 62 degree vertical (about 30 horizontal) field: S is on screen.
    expect(texts(log)).toContain('S');
    expect(texts(log)).not.toContain('N');
  });

  it('every cardinal appears when looking toward it', () => {
    for (const [az, letter] of [
      [0, 'N'],
      [90, 'E'],
      [180, 'S'],
      [270, 'W'],
    ] as const) {
      const b = cameraBasisFromAzAlt(az, 10);
      const { ctx, log } = recordingContext();
      drawLook(ctx, { viewport: VP, basis: b, items: [] });
      expect(texts(log), letter).toContain(letter);
    }
  });

  it('draws names only: the short name next to each marker, nothing from the info card', () => {
    const { ctx, log } = recordingContext();
    const result = drawLook(
      ctx,
      frameOf([item('jupiter', 170, 30, -2), item('sirius', 190, 25, -1.46)]),
    );
    const t = texts(log);
    expect(t).toContain('Jupiter');
    expect(t).toContain('Sirius');
    for (const def of TARGETS) {
      expect(t.some((x) => x.includes(def.info.description.slice(0, 20)))).toBe(false);
    }
    expect(result.onScreen.map((o) => o.name).sort()).toEqual(['Jupiter', 'Sirius']);
    // Halo first, then the fill, for readability on a camera feed.
    expect(log.some((l) => l.startsWith('strokeText("Jupiter"'))).toBe(true);
  });

  it('above the horizon: solid, opaque dot; below: 35% opacity and a dashed outline', () => {
    const above = recordingContext();
    drawLook(above.ctx, frameOf([item('jupiter', 180, 30, -2)]));
    expect(above.log).toContain('globalAlpha=1');
    expect(above.log).not.toContain(`globalAlpha=${BELOW_HORIZON_ALPHA}`);
    expect(above.log.some((l) => l.startsWith('setLineDash([3,3])'))).toBe(false);
    expect(above.log.filter((l) => l.startsWith('fill(')).length).toBeGreaterThan(0);

    const below = recordingContext();
    drawLook(below.ctx, frameOf([item('sirius', 180, -5, -1.46)]));
    expect(below.log).toContain(`globalAlpha=${BELOW_HORIZON_ALPHA}`);
    expect(below.log).toContain('setLineDash([3,3])');
    // An outline, not a filled disc, so you can still look through the ground.
    const marker = below.log.slice(below.log.indexOf('setLineDash([3,3])'));
    expect(marker.some((l) => l.startsWith('stroke('))).toBe(true);
    expect(
      marker.slice(0, marker.indexOf('setLineDash([])')).some((l) => l.startsWith('fill(')),
    ).toBe(false);
  });

  it('the Sun gets a warning mark and the label "Sun — don\'t look"', () => {
    const { ctx, log } = recordingContext();
    const out = drawLook(ctx, frameOf([item('sun', 180, 20, -26.7)]));
    expect(texts(log)).toContain('⚠️');
    expect(texts(log)).toContain(SUN_LABEL);
    expect(SUN_LABEL).toBe("Sun — don't look");
    expect(out.onScreen[0].name).toBe('Sun');
  });

  it('deep sky is a small ellipse; stars and planets are dots', () => {
    const e = recordingContext();
    drawLook(e.ctx, frameOf([item('m31', 180, 25, 3.4)]));
    expect(e.log.some((l) => l.startsWith('ellipse('))).toBe(true);
    const s = recordingContext();
    drawLook(s.ctx, frameOf([item('sirius', 180, 25, -1.46)]));
    expect(s.log.some((l) => l.startsWith('ellipse('))).toBe(false);
  });

  it('skips targets that are off screen or behind the camera', () => {
    const { ctx } = recordingContext();
    const out = drawLook(ctx, frameOf([item('jupiter', 0, 30), item('sirius', 180, 25, -1.46)]));
    expect(out.onScreen.map((o) => o.id)).toEqual(['sirius']);
  });

  it('labels never overlap: a crowd keeps its markers and hides what does not fit', () => {
    const crowd = ['jupiter', 'saturn', 'mars', 'venus', 'sirius', 'vega', 'moon'].map((id, i) =>
      item(id, 178 + i * 0.6, 20 + (i % 3) * 0.5, i - 2),
    );
    const { ctx, log } = recordingContext();
    const out = drawLook(ctx, frameOf(crowd));
    expect(out.hits).toHaveLength(7);
    expect(texts(log).length).toBeLessThanOrEqual(7);
  });

  it('brighter targets get larger markers, between 3 and 8 px', () => {
    const star = getTarget('sirius')!;
    expect(markerRadiusFor(star, -1.46)).toBeGreaterThan(markerRadiusFor(star, 2));
    expect(markerRadiusFor(star, 6)).toBe(3);
    expect(markerRadiusFor(star, -9)).toBe(8);
    expect(markerRadiusFor(getTarget('galactic-center')!, null)).toBe(4);
  });
});

describe('hit testing', () => {
  const frame = frameOf([item('jupiter', 170, 30, -2), item('sirius', 195, 20, -1.46)]);
  const { ctx } = recordingContext();
  const { hits } = drawLook(ctx, frame);
  const at = (id: string) => hits.find((h) => h.id === id)!;

  it('markers have at least a 44 x 44 px touch area', () => {
    for (const h of hits) {
      expect(h.marker.w).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
      expect(h.marker.h).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
    }
  });

  it('tapping a marker, a bit off it, or its name hits that target; empty sky hits nothing', () => {
    const j = at('jupiter');
    expect(hitTest(hits, j.cx, j.cy)).toBe('jupiter');
    expect(hitTest(hits, j.cx + 18, j.cy - 18)).toBe('jupiter');
    expect(j.label).not.toBeNull();
    expect(hitTest(hits, j.label!.x + j.label!.w / 2, j.label!.y + j.label!.h / 2)).toBe('jupiter');
    expect(hitTest(hits, 2, 2)).toBeNull();
  });

  it('labels also get at least a 44 px tall touch area', () => {
    for (const h of hits) if (h.label) expect(h.label.h).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
  });

  it('overlapping touch areas go to the nearest marker', () => {
    const near = [
      { id: 'a', marker: { x: 0, y: 0, w: 44, h: 44 }, label: null, cx: 22, cy: 22 },
      { id: 'b', marker: { x: 20, y: 0, w: 44, h: 44 }, label: null, cx: 42, cy: 22 },
    ];
    expect(hitTest(near, 25, 22)).toBe('a');
    expect(hitTest(near, 40, 22)).toBe('b');
  });
});
