import { directionFromAzAlt } from '../math/vec3';
import { cameraBasisFromAzAlt } from '../sensors/orientation-math';
import {
  Viewport,
  brightLimbScreenAngle,
  displayRadiusPx,
  edgeGlowPoint,
  projectDirection,
} from './projection';

const VP: Viewport = { width: 400, height: 800, vFovDeg: 60 };
const lookNorth = cameraBasisFromAzAlt(0, 0);

describe('projectDirection', () => {
  it('straight ahead lands dead center', () => {
    const p = projectDirection(directionFromAzAlt(0, 0), lookNorth, VP);
    expect(p.x).toBeCloseTo(200, 9);
    expect(p.y).toBeCloseTo(400, 9);
    expect(p.onScreen).toBe(true);
    expect(p.centerDistance).toBeCloseTo(0, 9);
  });

  it('a target up and to the right lands up and to the right', () => {
    const p = projectDirection(directionFromAzAlt(10, 10), lookNorth, VP);
    expect(p.x).toBeGreaterThan(200);
    expect(p.y).toBeLessThan(400);
  });

  it('half the vertical FOV above center maps exactly to the top edge', () => {
    const p = projectDirection(directionFromAzAlt(0, 30), lookNorth, VP);
    expect(p.y).toBeCloseTo(0, 6);
  });

  it('a target just off the right edge is off-screen but its disc can overlap', () => {
    // Horizontal half-FOV for 400x800 @ 60° vertical = atan(tan(30°)/2) ≈ 16.1°
    const target = directionFromAzAlt(17, 0);
    expect(projectDirection(target, lookNorth, VP).onScreen).toBe(false);
    expect(projectDirection(target, lookNorth, VP, 40).onScreen).toBe(true);
    expect(projectDirection(target, lookNorth, VP).edgeAngleRad).toBeCloseTo(0, 6); // enters from the right
  });

  it('behind the user: not in front, but the edge hint still points the right way', () => {
    const p = projectDirection(directionFromAzAlt(170, 0), lookNorth, VP);
    expect(p.inFront).toBe(false);
    expect(p.onScreen).toBe(false);
    expect(p.angularDistanceDeg).toBeCloseTo(170, 6);
    expect(Math.cos(p.edgeAngleRad)).toBeGreaterThan(0); // turn right (east) to reach az 170
  });

  it('works when looking straight up (no gimbal lock)', () => {
    const cam = cameraBasisFromAzAlt(0, 90);
    const p = projectDirection(directionFromAzAlt(0, 85), cam, VP);
    expect(p.inFront).toBe(true);
    expect(p.onScreen).toBe(true);
  });
});

describe('brightLimbScreenAngle', () => {
  it('Sun to the east of a southern moon: lit limb faces left on screen', () => {
    const cam = cameraBasisFromAzAlt(180, 20); // looking south, east is on the left
    const a = brightLimbScreenAngle(directionFromAzAlt(180, 20), directionFromAzAlt(90, -10), cam);
    expect(Math.cos(a)).toBeLessThan(-0.5);
  });

  it('Sun directly below the moon: lit limb faces down', () => {
    const a = brightLimbScreenAngle(
      directionFromAzAlt(0, 30),
      directionFromAzAlt(0, -30),
      lookNorth,
    );
    expect(a).toBeCloseTo(-Math.PI / 2, 6);
  });
});

describe('displayRadiusPx', () => {
  it('scales with apparent size (supermoons are bigger)', () => {
    expect(displayRadiusPx(VP, 0.56)).toBeGreaterThan(displayRadiusPx(VP, 0.49));
  });
});

describe('edgeGlowPoint', () => {
  it('places the glow at the right edge, vertical center, for angle 0', () => {
    const p = edgeGlowPoint(VP, 0, 10);
    expect(p.x).toBeCloseTo(VP.width - 10, 6);
    expect(p.y).toBeCloseTo(VP.height / 2, 6);
  });

  it('places the glow at the top edge for angle +90deg (y-up)', () => {
    const p = edgeGlowPoint(VP, Math.PI / 2, 0);
    expect(p.x).toBeCloseTo(VP.width / 2, 6);
    expect(p.y).toBeCloseTo(0, 6);
  });

  it('always lands exactly on the inset border, for an arbitrary angle', () => {
    const p = edgeGlowPoint(VP, 0.7, 5);
    const onVerticalEdge = Math.abs(p.x - 5) < 1e-6 || Math.abs(p.x - (VP.width - 5)) < 1e-6;
    const onHorizontalEdge = Math.abs(p.y - 5) < 1e-6 || Math.abs(p.y - (VP.height - 5)) < 1e-6;
    expect(onVerticalEdge || onHorizontalEdge).toBe(true);
  });
});
