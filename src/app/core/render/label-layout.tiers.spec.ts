import { LABEL_PADDING, LabelRequest, layoutLabels } from './label-layout';

const VP = { width: 400, height: 800 };
const target = (id: string, x: number, y: number): LabelRequest => ({
  id,
  x,
  y,
  markerRadius: 4,
  textWidth: 50,
  textHeight: 13,
  aboveHorizon: true,
  magnitude: 0,
});
const name = (id: string, x: number, y: number, rank: 1 | 2 | 3, above = true): LabelRequest => ({
  id,
  x,
  y,
  markerRadius: 0,
  textWidth: 80,
  textHeight: 11,
  aboveHorizon: above,
  magnitude: null,
  tier: rank,
  centered: true,
});
const boxOf = (r: LabelRequest[], id: string) => layoutLabels(r, VP).find((p) => p.id === id)!;

describe('label layout tiers (constellation names)', () => {
  it('a constellation name is centered on its point', () => {
    const p = boxOf([name('orion', 200, 300, 1)], 'orion');
    expect(p.anchor).toBe('center');
    const w = 80 + 2 * LABEL_PADDING;
    const h = 11 + 2 * LABEL_PADDING;
    expect(p.box).toEqual({ x: 200 - w / 2, y: 300 - h / 2, w, h });
  });

  it('targets are placed first: a name that would cover a target label is hidden, even if it comes first', () => {
    // The target's label would go to the right of its marker, exactly where the name sits.
    const requests = [name('orion', 262, 300, 1), target('jupiter', 200, 300)];
    const out = layoutLabels(requests, VP);
    expect(out[1].box).not.toBeNull(); // Jupiter keeps its label
    expect(out[0].box).toBeNull(); // the name loses
  });

  it('a name never covers a target marker either', () => {
    const out = layoutLabels([name('orion', 200, 300, 1), target('jupiter', 205, 302)], VP);
    expect(out[0].box).toBeNull();
    expect(out[1].box).not.toBeNull();
  });

  it('among names, rank 1 is placed before rank 2 before rank 3, whatever the input order', () => {
    const same = (id: string, rank: 1 | 2 | 3) => name(id, 200, 300, rank);
    for (const order of [
      ['c3', 'c2', 'c1'],
      ['c2', 'c1', 'c3'],
      ['c1', 'c3', 'c2'],
    ]) {
      const ranks = { c1: 1, c2: 2, c3: 3 } as const;
      const requests = order.map((id) => same(id, ranks[id as keyof typeof ranks]));
      const out = layoutLabels(requests, VP);
      const shown = out.filter((p) => p.box).map((p) => p.id);
      expect(shown).toEqual(['c1']);
    }
  });

  it('a lower-tier name above the horizon still beats a higher-tier one below it', () => {
    const out = layoutLabels(
      [name('rank2-up', 200, 300, 2, true), name('rank1-down', 200, 300, 1, false)],
      VP,
    );
    expect(out[1].box).not.toBeNull(); // tier first, then above/below
    expect(out[0].box).toBeNull();
  });

  it('without tiers or centering the layout is exactly as before (the Phase 8 behavior)', () => {
    const out = layoutLabels([target('a', 100, 100), target('b', 300, 400)], VP);
    expect(out.map((p) => p.anchor)).toEqual(['right', 'right']);
  });

  it('a name at the screen edge that would not fit is hidden, not clipped', () => {
    expect(boxOf([name('edge', 10, 300, 1)], 'edge').box).toBeNull();
  });
});
