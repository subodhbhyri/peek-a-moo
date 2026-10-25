import { Injectable, computed, signal } from '@angular/core';
import { DEFAULT_TARGET_ID, getTarget } from './catalog';
import type { TargetDef } from './target.types';

const STORAGE_KEY = 'ptm.target';
const URL_PARAM = 'target';

/**
 * Which target the user is looking for. Initial value, in priority order:
 * `?target=<id>` (if known) -> localStorage (if known) -> the default (the Moon).
 */
@Injectable({ providedIn: 'root' })
export class TargetSelectionService {
  readonly selectedId = signal<string>(initialId());
  readonly selected = computed<TargetDef>(
    () => getTarget(this.selectedId()) ?? getTarget(DEFAULT_TARGET_ID)!,
  );

  /** Ignores unknown ids. Persists, and mirrors the choice into the URL (other params are kept). */
  select(id: string): void {
    if (!getTarget(id)) return;
    this.selectedId.set(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Storage unavailable — the choice still applies this session.
    }
    try {
      const url = new URL(window.location.href);
      url.searchParams.set(URL_PARAM, id);
      history.replaceState(history.state, '', url);
    } catch {
      // No usable history API — not worth failing for.
    }
  }
}

function initialId(): string {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get(URL_PARAM);
    if (fromUrl && getTarget(fromUrl)) return fromUrl;
  } catch {
    // fall through
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && getTarget(stored)) return stored;
  } catch {
    // fall through
  }
  return DEFAULT_TARGET_ID;
}
