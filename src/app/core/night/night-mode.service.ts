import { Injectable, effect, signal } from '@angular/core';

export const NIGHT_STORAGE_KEY = 'ptm.night';
/** theme-color while red night mode is on (pure black, so the browser chrome does not glow), and off. */
export const NIGHT_THEME_COLOR = '#000000';

/**
 * Red night mode: keeps your eyes dark-adapted. The state is persisted; the red filter itself is a CSS
 * overlay in the app shell. While it is on the page's theme-color is pure black, and it goes back to
 * whatever it was when night mode turns off.
 */
@Injectable({ providedIn: 'root' })
export class NightModeService {
  readonly on = signal(readStored());

  constructor() {
    let original: string | null = null;
    effect(() => {
      const on = this.on();
      const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      if (!meta) return;
      original ??= meta.getAttribute('content');
      if (on) meta.setAttribute('content', NIGHT_THEME_COLOR);
      else if (original !== null) meta.setAttribute('content', original);
    });
  }

  /** Returns the new state. */
  toggle(): boolean {
    const next = !this.on();
    this.on.set(next);
    try {
      localStorage.setItem(NIGHT_STORAGE_KEY, next ? 'on' : 'off');
    } catch {
      // storage unavailable: it still applies this session
    }
    return next;
  }
}

function readStored(): boolean {
  try {
    return localStorage.getItem(NIGHT_STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}
