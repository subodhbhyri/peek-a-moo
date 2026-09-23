import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

const VISIBLE_MS = 5000;
const COPIED_FLASH_MS = 1500;

export interface FindStat {
  durationMs: number;
  emoji: string;
}

/**
 * "Found the moon in 4.2s 🌕" — appears in the corner after a find, fades on its own, and shares
 * on tap (Web Share where available, clipboard otherwise).
 */
@Component({
  selector: 'app-corner-stat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (payload(); as p) {
      <button type="button" class="pill" [class.visible]="visible()" (click)="share(p)">
        {{ copied() ? 'Copied!' : label(p) }}
      </button>
    }
  `,
  styles: `
    :host {
      position: absolute;
      right: max(1rem, env(safe-area-inset-right));
      bottom: max(1rem, env(safe-area-inset-bottom));
    }
    .pill {
      font: inherit;
      font-size: 0.8rem;
      color: #e9e6dc;
      background: rgba(20, 18, 14, 0.6);
      border: 1px solid rgba(233, 230, 220, 0.15);
      border-radius: 999px;
      padding: 0.5em 0.9em;
      opacity: 0;
      transform: translateY(6px);
      transition:
        opacity 0.3s ease,
        transform 0.3s ease;
      pointer-events: none;
      cursor: pointer;
    }
    .pill.visible {
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }
    :host.reduced-motion .pill {
      transition: opacity 0.15s linear;
      transform: none;
    }
  `,
})
export class CornerStat {
  protected readonly payload = signal<FindStat | null>(null);
  protected readonly visible = signal(false);
  protected readonly copied = signal(false);
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  show(stat: FindStat): void {
    this.copied.set(false);
    this.payload.set(stat);
    this.visible.set(true);
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.visible.set(false), VISIBLE_MS);
  }

  protected label(p: FindStat): string {
    return `Found the moon in ${(p.durationMs / 1000).toFixed(1)}s ${p.emoji}`;
  }

  protected async share(p: FindStat): Promise<void> {
    const text = this.label(p);
    const url = typeof location !== 'undefined' ? location.href : undefined;
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    try {
      if (nav.share) {
        await nav.share({ text, url });
        return;
      }
    } catch {
      // user cancelled the share sheet, or it's unsupported — fall through to clipboard
    }
    try {
      await navigator.clipboard.writeText(url ? `${text} ${url}` : text);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), COPIED_FLASH_MS);
    } catch {
      // clipboard unavailable too — nothing more we can do silently
    }
  }
}
