import type { TargetDef } from './target.types';

export const DEFAULT_TARGET_ID = 'moon';

/** Curated catalog. Only the Moon for now; later phases add entries without touching the engine. */
export const TARGETS: readonly TargetDef[] = [
  {
    id: 'moon',
    name: 'Moon',
    kind: 'moon',
    category: 'solar-system',
    blurb: 'Our nearest neighbour, and a bit awkward about it.',
    render: 'moon',
    body: 'Moon',
  },
];

export function getTarget(id: string): TargetDef | undefined {
  return TARGETS.find((t) => t.id === id);
}
