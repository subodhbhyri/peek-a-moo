import type { TargetKind } from './target.types';

/** How often the engine recomputes a target's state, ms. 0 = every frame. */
export function recomputeIntervalMs(kind: TargetKind): number {
  switch (kind) {
    case 'moon':
      return 5_000;
    case 'sun':
    case 'planet':
    case 'fixed':
      return 30_000;
    case 'satellite':
      return 0;
  }
}
