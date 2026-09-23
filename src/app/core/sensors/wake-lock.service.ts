import { Injectable } from '@angular/core';

interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener(type: 'release', cb: () => void): void;
}
interface WakeLockLike {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

/**
 * Keeps the screen on while searching, since dimming mid-hunt is exactly wrong for this app.
 * Unsupported on iOS Safari < 16.4 and in some private-browsing modes — fails silently there.
 */
@Injectable({ providedIn: 'root' })
export class WakeLockService {
  private sentinel: WakeLockSentinelLike | null = null;
  private wanted = false;

  async enable(): Promise<void> {
    this.wanted = true;
    const wakeLock = (navigator as unknown as { wakeLock?: WakeLockLike }).wakeLock;
    if (!wakeLock || this.sentinel) return;
    try {
      this.sentinel = await wakeLock.request('screen');
      this.sentinel.addEventListener('release', () => {
        this.sentinel = null;
      });
    } catch {
      this.sentinel = null; // e.g. document not visible yet, or unsupported — just skip it
    }
  }

  disable(): void {
    this.wanted = false;
    this.sentinel?.release().catch(() => undefined);
    this.sentinel = null;
  }

  /** Call on visibilitychange -> visible to re-acquire a lock the OS dropped when backgrounded. */
  reacquireIfWanted(): void {
    if (this.wanted && !this.sentinel) void this.enable();
  }
}
