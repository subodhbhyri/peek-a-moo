/** An axis-aligned box, CSS px. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type LabelAnchor =
  | 'right'
  | 'left'
  | 'above'
  | 'below'
  | 'above-right'
  | 'above-left'
  | 'below-right'
  | 'below-left';

/** One target's marker and the size of its label text. */
export interface LabelRequest {
  id: string;
  /** Marker center and radius. */
  x: number;
  y: number;
  markerRadius: number;
  /** Measured text size, before padding. */
  textWidth: number;
  textHeight: number;
  /** Above the horizon wins over below it. */
  aboveHorizon: boolean;
  /** Brighter (smaller) first; null (not meaningful) last. */
  magnitude: number | null;
}

export interface LabelPlacement {
  id: string;
  /** The label box including padding, or null when no position fit and the label is hidden. */
  box: Rect | null;
  anchor: LabelAnchor | null;
}

/** Padding around the text inside a label box, each side. */
export const LABEL_PADDING = 4;
/** Space between a marker and its label. */
const GAP = 3;

/** Candidate order: right, left, above, below, then the four diagonals. */
const ANCHORS: readonly LabelAnchor[] = [
  'right',
  'left',
  'above',
  'below',
  'above-right',
  'above-left',
  'below-right',
  'below-left',
];

function candidate(r: LabelRequest, anchor: LabelAnchor, w: number, h: number): Rect {
  const d = r.markerRadius * Math.SQRT1_2 + GAP;
  const off = r.markerRadius + GAP;
  switch (anchor) {
    case 'right':
      return { x: r.x + off, y: r.y - h / 2, w, h };
    case 'left':
      return { x: r.x - off - w, y: r.y - h / 2, w, h };
    case 'above':
      return { x: r.x - w / 2, y: r.y - off - h, w, h };
    case 'below':
      return { x: r.x - w / 2, y: r.y + off, w, h };
    case 'above-right':
      return { x: r.x + d, y: r.y - d - h, w, h };
    case 'above-left':
      return { x: r.x - d - w, y: r.y - d - h, w, h };
    case 'below-right':
      return { x: r.x + d, y: r.y + d, w, h };
    case 'below-left':
      return { x: r.x - d - w, y: r.y + d, w, h };
  }
}

/** Boxes that merely touch do not overlap. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

const inside = (b: Rect, vw: number, vh: number) =>
  b.x >= 0 && b.y >= 0 && b.x + b.w <= vw && b.y + b.h <= vh;

/** Higher priority sorts first: above the horizon, then brightest, null magnitude last, then input order. */
function byPriority(a: { r: LabelRequest; i: number }, b: { r: LabelRequest; i: number }): number {
  if (a.r.aboveHorizon !== b.r.aboveHorizon) return a.r.aboveHorizon ? -1 : 1;
  const ma = a.r.magnitude ?? Infinity;
  const mb = b.r.magnitude ?? Infinity;
  if (ma !== mb) return ma < mb ? -1 : 1;
  return a.i - b.i;
}

/**
 * Places a name next to each marker without covering anything.
 *
 * Targets are handled in priority order. For each, the candidate positions (right, left, above, below,
 * then the four diagonals) are tried in turn, and the first whose box (the measured text plus 4 px of
 * padding) overlaps no label already placed and no other marker, and lies fully on screen, is taken. If
 * none fits, the label is hidden (`box: null`) and the marker stays. Deterministic: the same input gives
 * the same output, and results come back in input order.
 */
export function layoutLabels(
  requests: readonly LabelRequest[],
  viewport: { width: number; height: number },
): LabelPlacement[] {
  const markers: Rect[] = requests.map((r) => ({
    x: r.x - r.markerRadius,
    y: r.y - r.markerRadius,
    w: r.markerRadius * 2,
    h: r.markerRadius * 2,
  }));
  const placed: Rect[] = [];
  const result: LabelPlacement[] = requests.map((r) => ({ id: r.id, box: null, anchor: null }));

  const order = requests.map((r, i) => ({ r, i })).sort(byPriority);
  for (const { r, i } of order) {
    const w = r.textWidth + 2 * LABEL_PADDING;
    const h = r.textHeight + 2 * LABEL_PADDING;
    for (const anchor of ANCHORS) {
      const box = candidate(r, anchor, w, h);
      if (!inside(box, viewport.width, viewport.height)) continue;
      if (placed.some((p) => rectsOverlap(box, p))) continue;
      if (markers.some((m, j) => j !== i && rectsOverlap(box, m))) continue;
      placed.push(box);
      result[i] = { id: r.id, box, anchor };
      break;
    }
  }
  return result;
}
