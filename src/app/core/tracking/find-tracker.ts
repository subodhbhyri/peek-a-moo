/**
 * Pure state machine deciding when the Moon counts as "found" and when it's "lost" again.
 *
 *   searching --(on screen)--> visible --(centered for dwellMs)--> found
 *   visible  --(off screen)--> searching
 *   found    --(off screen continuously for lostMs)--> searching   (emits 'lost')
 *
 * The hysteresis stops hand-shake from spamming "found" reactions: brief exits don't count,
 * and a reaction only fires after the user actually settles on the Moon.
 */
export type FindPhase = 'searching' | 'visible' | 'found';

export interface FindTrackerConfig {
  /** How long the Moon must stay near the center before it counts as found. */
  dwellMs: number;
  /** How long it must stay off-screen before a found Moon counts as lost. */
  lostMs: number;
}

export const DEFAULT_TRACKER_CONFIG: FindTrackerConfig = { dwellMs: 400, lostMs: 1000 };

export interface FindTrackerState {
  phase: FindPhase;
  /** When the current search began (session start, or the moment the Moon was lost). */
  searchStartedAt: number;
  centeredSince: number | null;
  offscreenSince: number | null;
  /** Finds in this session. Lifetime stats belong in the stats store. */
  findCount: number;
  lastFindDurationMs: number | null;
}

export type FindEvent = { type: 'found'; durationMs: number; findIndex: number } | { type: 'lost' };

export interface FindTrackerInput {
  now: number;
  onScreen: boolean;
  centered: boolean;
}

export function initialTrackerState(now: number): FindTrackerState {
  return {
    phase: 'searching',
    searchStartedAt: now,
    centeredSince: null,
    offscreenSince: null,
    findCount: 0,
    lastFindDurationMs: null,
  };
}

export function stepTracker(
  s: FindTrackerState,
  input: FindTrackerInput,
  cfg: FindTrackerConfig = DEFAULT_TRACKER_CONFIG,
): { state: FindTrackerState; event: FindEvent | null } {
  const { now, onScreen, centered } = input;

  switch (s.phase) {
    case 'searching':
      if (!onScreen) return { state: s, event: null };
      return stepTracker({ ...s, phase: 'visible', centeredSince: null }, input, cfg);

    case 'visible': {
      if (!onScreen)
        return { state: { ...s, phase: 'searching', centeredSince: null }, event: null };
      if (!centered)
        return { state: s.centeredSince === null ? s : { ...s, centeredSince: null }, event: null };
      const since = s.centeredSince ?? now;
      if (now - since >= cfg.dwellMs) {
        const durationMs = now - s.searchStartedAt;
        const findCount = s.findCount + 1;
        return {
          state: {
            ...s,
            phase: 'found',
            centeredSince: null,
            offscreenSince: null,
            findCount,
            lastFindDurationMs: durationMs,
          },
          event: { type: 'found', durationMs, findIndex: findCount },
        };
      }
      return { state: s.centeredSince === since ? s : { ...s, centeredSince: since }, event: null };
    }

    case 'found': {
      if (onScreen)
        return {
          state: s.offscreenSince === null ? s : { ...s, offscreenSince: null },
          event: null,
        };
      const since = s.offscreenSince ?? now;
      if (now - since >= cfg.lostMs) {
        return {
          state: {
            ...s,
            phase: 'searching',
            searchStartedAt: now,
            offscreenSince: null,
            centeredSince: null,
          },
          event: { type: 'lost' },
        };
      }
      return {
        state: s.offscreenSince === since ? s : { ...s, offscreenSince: since },
        event: null,
      };
    }
  }
}
