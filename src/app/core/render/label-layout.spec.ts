import { LABEL_PADDING, LabelRequest, layoutLabels, rectsOverlap } from './label-layout';

const VP = { width: 400, height: 800 };
const req = (id: string, x: number, y: number, over: Partial<LabelRequest> = {}): LabelRequest => ({
  id,
  x,
  y,
  markerRadius: 5,
  textWidth: 50,
  textHeight: 13,
  aboveHorizon: true,
  magnitude: 1,
  ...over,
});

/** A deterministic pseudo-random scatter. */
function scatter(n: number, seed = 7): LabelRequest[] {
  let s = seed;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  return Array.from({ length: n }, (_, i) =>
    req(`t${i}`, 20 + rnd() * 360, 20 + rnd() * 760, {
      magnitude: rnd() < 0.2 ? null : rnd() * 6 - 2,
      aboveHorizon: rnd() < 0.7,
      textWidth: 30 + Math.floor(rnd() * 70),
    }),
  );
}

describe('layoutLabels', () => {
  it('puts a lone label to the right of its marker, padded', () => {
    const [p] = layoutLabels([req('a', 100, 100)], VP);
    expect(p.anchor).toBe('right');
    expect(p.box).toEqual({
      x: 100 + 5 + 3,
      y: 100 - (13 + 2 * LABEL_PADDING) / 2,
      w: 50 + 2 * LABEL_PADDING,
      h: 13 + 2 * LABEL_PADDING,
    });
  });

  it('no placed label overlaps another label or another marker, and all are fully on screen', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const requests = scatter(60, seed);
      const out = layoutLabels(requests, VP);
      const boxes = out.filter((p) => p.box).map((p) => p.box!);
      for (const b of boxes) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(VP.width);
        expect(b.y + b.h).toBeLessThanOrEqual(VP.height);
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          expect(rectsOverlap(boxes[i], boxes[j]), `labels ${i}/${j} seed ${seed}`).toBe(false);
        }
      }
      out.forEach((p, i) => {
        if (!p.box) return;
        requests.forEach((r, j) => {
          if (i === j) return;
          const m = {
            x: r.x - r.markerRadius,
            y: r.y - r.markerRadius,
            w: 2 * r.markerRadius,
            h: 2 * r.markerRadius,
          };
          expect(rectsOverlap(p.box!, m), `label ${i} over marker ${j}`).toBe(false);
        });
      });
    }
  });

  it('is deterministic: the same input gives the same output', () => {
    const requests = scatter(40);
    expect(layoutLabels(requests, VP)).toEqual(layoutLabels(requests, VP));
  });

  it('returns placements in input order', () => {
    const requests = scatter(10);
    expect(layoutLabels(requests, VP).map((p) => p.id)).toEqual(requests.map((r) => r.id));
  });

  it('falls back to another side when the right side is blocked by another marker', () => {
    const main = req('main', 200, 400, { magnitude: -5 });
    const wall = req('wall', 215, 400, {
      markerRadius: 20,
      textWidth: 1,
      textHeight: 1,
      magnitude: 9,
    });
    const [m] = layoutLabels([main, wall], VP);
    expect(m.anchor).not.toBe('right');
    expect(m.box).not.toBeNull();
  });

  it('near a screen edge the label flips to the side that stays on screen', () => {
    const [right] = layoutLabels([req('r', 385, 400)], VP);
    expect(right.anchor).toBe('left');
    const [top] = layoutLabels([req('t', 100, 2)], VP);
    expect(top.box!.y).toBeGreaterThanOrEqual(0);
    const [corner] = layoutLabels([req('c', 395, 795)], VP);
    expect(corner.anchor).toBe('above-left');
  });

  it('priority: above the horizon beats below, then brighter beats fainter, null magnitude last, ties by input order', () => {
    // Two markers 3 px apart in a short screen where every candidate box of one collides with the
    // other's label: whichever is handled first takes the spot and the other is hidden.
    const wide = { textWidth: 200, markerRadius: 2 };
    const winner = (a: Partial<LabelRequest>, b: Partial<LabelRequest>) => {
      const out = layoutLabels(
        [req('a', 100, 33, { ...wide, ...a }), req('b', 100, 36, { ...wide, ...b })],
        { width: 330, height: 66 },
      );
      return out.filter((p) => p.box).map((p) => p.id);
    };

    expect(
      winner({ aboveHorizon: false, magnitude: -9 }, { aboveHorizon: true, magnitude: 5 }),
    ).toEqual(['b']);
    expect(winner({ magnitude: 3 }, { magnitude: -1 })).toEqual(['b']);
    expect(winner({ magnitude: null }, { magnitude: 8 })).toEqual(['b']);
    expect(winner({ magnitude: 2 }, { magnitude: 2 })).toEqual(['a']);
  });

  it('when nothing fits the label is hidden but the marker is still reported', () => {
    const out = layoutLabels([req('a', 20, 20, { textWidth: 300 })], { width: 100, height: 100 });
    expect(out).toEqual([{ id: 'a', box: null, anchor: null }]);
    const tight = Array.from({ length: 30 }, (_, i) =>
      req(`c${i}`, 100 + (i % 6) * 8, 100 + Math.floor(i / 6) * 8, {
        markerRadius: 4,
        magnitude: i,
      }),
    );
    const placed = layoutLabels(tight, { width: 200, height: 200 });
    expect(placed).toHaveLength(30);
    expect(placed.some((p) => p.box === null)).toBe(true);
    // The brightest is handled first and keeps its label.
    expect(placed[0].box).not.toBeNull();
  });
});
