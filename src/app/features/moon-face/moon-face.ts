import { ChangeDetectionStrategy, Component, ElementRef, inject, signal } from '@angular/core';

const SPEECH_DURATION_MS = 3400;

/**
 * A tiny face + speech bubble that sits on top of the Moon while it's "found". Position and
 * visibility are pushed in every frame via `update()` (direct style writes, no Angular binding,
 * so a 60fps loop doesn't trigger change detection). The speech text changes rarely, so that part
 * is a normal signal.
 */
@Component({
  selector: 'app-moon-face',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="-50 -50 100 100" class="face">
      <circle cx="-16" cy="-6" r="5" fill="#241f16" />
      <circle cx="16" cy="-6" r="5" fill="#241f16" />
      <ellipse cx="0" cy="16" rx="6" ry="8" fill="#241f16" />
    </svg>
    @if (speech(); as text) {
      <div class="bubble">{{ text }}</div>
    }
  `,
  styles: `
    :host {
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
      will-change: transform, opacity;
      opacity: 0;
    }
    :host.reduced-motion {
      transition: none !important;
    }
    .face {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }
    .bubble {
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      margin-bottom: 0.75em;
      padding: 0.4em 0.75em;
      border-radius: 999px;
      background: rgba(20, 18, 14, 0.85);
      color: #f2efe6;
      font-size: 0.85rem;
      white-space: nowrap;
      animation: fade-bubble 3.4s ease forwards;
    }
    :host.reduced-motion .bubble {
      animation: none;
    }
    @keyframes fade-bubble {
      0% {
        opacity: 0;
        transform: translateX(-50%) translateY(4px);
      }
      10%,
      75% {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
      100% {
        opacity: 0;
        transform: translateX(-50%) translateY(-4px);
      }
    }
  `,
})
export class MoonFace {
  private readonly el = inject(ElementRef<HTMLElement>).nativeElement;
  private speechTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly speech = signal<string | null>(null);

  /** Called every animation frame. Cheap: just a transform + opacity write. */
  update(x: number, y: number, radiusPx: number, visible: boolean): void {
    const size = radiusPx * 1.7;
    this.el.style.width = `${size}px`;
    this.el.style.height = `${size}px`;
    this.el.style.transform = `translate(${x - size / 2}px, ${y - size / 2}px)`;
    this.el.style.opacity = visible ? '1' : '0';
  }

  say(text: string): void {
    this.speech.set(text);
    if (this.speechTimer) clearTimeout(this.speechTimer);
    this.speechTimer = setTimeout(() => this.speech.set(null), SPEECH_DURATION_MS);
  }

  clearSpeech(): void {
    this.speech.set(null);
    if (this.speechTimer) clearTimeout(this.speechTimer);
  }

  setReducedMotion(reduced: boolean): void {
    this.el.classList.toggle('reduced-motion', reduced);
  }
}
