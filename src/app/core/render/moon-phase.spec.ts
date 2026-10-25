import { drawMoonPhase } from './moon-phase';

/**
 * jsdom has no canvas, so "pixel identity" is checked as call identity: a recording context logs every
 * method call (with arguments) and every style assignment, and the log for the Moon must equal the one
 * captured from the pre-Phase-3 implementation. Same calls with the same arguments draw the same pixels.
 */
export function recordingContext(): { ctx: CanvasRenderingContext2D; log: string[] } {
  const log: string[] = [];
  const num = (v: unknown) => (typeof v === 'number' ? Number(v.toFixed(9)) : v);
  const ctx = new Proxy(
    {},
    {
      get(_t, prop: string) {
        return (...args: unknown[]) => {
          log.push(`${prop}(${args.map((a) => JSON.stringify(num(a))).join(',')})`);
        };
      },
      set(_t, prop: string, value: unknown) {
        log.push(`${prop}=${JSON.stringify(value)}`);
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, log };
}

const CASES: [string, number, number, number, number, number][] = [
  ['crescent', 120.5, 340.25, 43.69, 0.0785, -2.077],
  ['quarter', 200, 400, 50, 0.5, 0.4],
  ['gibbous', 90, 300, 61.2, 0.7134, 1.9],
  ['full', 310, 120, 44, 0.998, -0.2],
  ['new', 50, 60, 40, 0, 3],
];

/** Snapshot of the log from the pre-Phase-3 implementation. Do not edit. */
const GOLDEN: Record<string, string[]> = {
  crescent: [
    'save()',
    'translate(120.5,340.25)',
    'rotate(2.077)',
    'beginPath()',
    'arc(0,0,43.69,0,6.283185307)',
    'fillStyle="rgba(242, 239, 230, 0.07)"',
    'fill()',
    'beginPath()',
    'arc(0,0,43.69,-1.570796327,1.570796327,false)',
    'ellipse(0,0,36.83067,43.69,0,1.570796327,-1.570796327,true)',
    'closePath()',
    'fillStyle="#f2efe6"',
    'fill()',
    'restore()',
  ],
  quarter: [
    'save()',
    'translate(200,400)',
    'rotate(-0.4)',
    'beginPath()',
    'arc(0,0,50,0,6.283185307)',
    'fillStyle="rgba(242, 239, 230, 0.07)"',
    'fill()',
    'beginPath()',
    'arc(0,0,50,-1.570796327,1.570796327,false)',
    'ellipse(0,0,0,50,0,1.570796327,4.71238898,false)',
    'closePath()',
    'fillStyle="#f2efe6"',
    'fill()',
    'restore()',
  ],
  gibbous: [
    'save()',
    'translate(90,300)',
    'rotate(-1.9)',
    'beginPath()',
    'arc(0,0,61.2,0,6.283185307)',
    'fillStyle="rgba(242, 239, 230, 0.07)"',
    'fill()',
    'beginPath()',
    'arc(0,0,61.2,-1.570796327,1.570796327,false)',
    'ellipse(0,0,26.12016,61.2,0,1.570796327,4.71238898,false)',
    'closePath()',
    'fillStyle="#f2efe6"',
    'fill()',
    'restore()',
  ],
  full: [
    'save()',
    'translate(310,120)',
    'rotate(0.2)',
    'beginPath()',
    'arc(0,0,44,0,6.283185307)',
    'fillStyle="rgba(242, 239, 230, 0.07)"',
    'fill()',
    'beginPath()',
    'arc(0,0,44,-1.570796327,1.570796327,false)',
    'ellipse(0,0,43.824,44,0,1.570796327,4.71238898,false)',
    'closePath()',
    'fillStyle="#f2efe6"',
    'fill()',
    'restore()',
  ],
  new: [
    'save()',
    'translate(50,60)',
    'rotate(-3)',
    'beginPath()',
    'arc(0,0,40,0,6.283185307)',
    'fillStyle="rgba(242, 239, 230, 0.07)"',
    'fill()',
    'restore()',
  ],
};

describe('drawMoonPhase draw-call identity (Moon must not change)', () => {
  for (const [name, x, y, r, k, limb] of CASES) {
    it(name, () => {
      const { ctx, log } = recordingContext();
      drawMoonPhase(ctx, x, y, r, k, limb);
      expect(log).toEqual(GOLDEN[name]);
    });
  }
});
