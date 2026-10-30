import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AnalyticsService } from '../../core/analytics/analytics.service';
import { getTarget } from '../../core/targets/catalog';
import { TargetInfoService } from '../target-info/target-info.service';
import { shareMessage, shareUrl } from '../../core/targets/share';

const VISIBLE_MS = 5000;
const COPIED_FLASH_MS = 1500;

export interface FindStat {
  durationMs: number;
  emoji: string;
  /** Full toast text for non-Moon targets; when absent the v1 Moon wording is used. */
  text?: string;
  /** Small extra line under the toast. */
  note?: string;
  /** Which target was found, so the shared link opens straight into it. */
  targetId?: string;
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
      <div class="row">
        @if (aboutName(p); as name) {
          <button
            type="button"
            class="about"
            [class.visible]="visible()"
            [attr.aria-label]="'About ' + name"
            (click)="about(p)"
          >
            <span aria-hidden="true">ⓘ</span>
          </button>
        }
        <button type="button" class="pill" [class.visible]="visible()" (click)="share(p)">
          {{ copied() ? 'Copied!' : label(p) }}
        </button>
      </div>
      @if (p.note) {
        <p class="note" [class.visible]="visible()">{{ p.note }}</p>
      }
    }
  `,
  styles: `
    :host {
      position: absolute;
      right: max(1rem, env(safe-area-inset-right));
      bottom: max(1rem, env(safe-area-inset-bottom));
    }
    .note {
      margin: 0.35rem 0 0;
      max-width: 15rem;
      text-align: right;
      font-family: system-ui, sans-serif;
      font-size: 0.7rem;
      color: #e9e6dc;
      opacity: 0;
      transition: opacity 0.3s ease;
      pointer-events: none;
    }
    .note.visible {
      opacity: 0.6;
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 0.4rem;
    }
    .about {
      width: 44px;
      height: 44px;
      font: inherit;
      font-size: 1.1rem;
      color: #e9e6dc;
      background: rgba(20, 18, 14, 0.6);
      border: 1px solid rgba(233, 230, 220, 0.15);
      border-radius: 50%;
      opacity: 0;
      transition: opacity 0.3s ease;
      pointer-events: none;
      cursor: pointer;
    }
    .about.visible {
      opacity: 1;
      pointer-events: auto;
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
  private readonly analytics = inject(AnalyticsService);
  private readonly info = inject(TargetInfoService);
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

  /** The target's name for the (i) button's label; null when the toast has no known target. */
  protected aboutName(p: FindStat): string | null {
    return (p.targetId && getTarget(p.targetId)?.name) || null;
  }

  protected about(p: FindStat): void {
    const def = p.targetId ? getTarget(p.targetId) : undefined;
    if (def) this.info.open(def, 'found');
  }

  protected label(p: FindStat): string {
    if (p.text) return p.text;
    return `Found the moon in ${(p.durationMs / 1000).toFixed(1)}s ${p.emoji}`;
  }

  protected async share(p: FindStat): Promise<void> {
    const text = this.label(p);
    const url =
      typeof location !== 'undefined' && p.targetId ? shareUrl(p.targetId, location) : undefined;
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    try {
      if (nav.share) {
        await nav.share({ text, url });
        if (p.targetId) this.analytics.share(p.targetId, 'native');
        return;
      }
    } catch {
      // user cancelled the share sheet, or it's unsupported — fall through to clipboard
    }
    try {
      await navigator.clipboard.writeText(url ? shareMessage(text, url) : text);
      if (p.targetId) this.analytics.share(p.targetId, 'clipboard');
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), COPIED_FLASH_MS);
    } catch {
      // clipboard unavailable too — nothing more we can do silently
    }
  }
}
