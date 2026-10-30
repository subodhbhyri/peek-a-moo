import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { GpService } from '../../core/gp/gp.service';
import { SUN_SAFETY_BANNER } from '../../core/personality/target-lines';
import { LocationService } from '../../core/sensors/location.service';
import { computeTargetState } from '../../core/targets/compute';
import { LiveStat, liveStats } from '../../core/targets/live-stats';
import { SatelliteDataError } from '../../core/targets/providers/satellite';
import type { TargetDef } from '../../core/targets/target.types';
import { targetGlyph } from '../target-picker/target-glyph';
import { TargetInfoService } from './target-info.service';

/** Live numbers refresh this often while the card is open; satellites move, so they refresh each second. */
const REFRESH_MS = 5000;
const SATELLITE_REFRESH_MS = 1000;
const SWIPE_CLOSE_PX = 90;

const FOCUSABLE =
  'button:not([disabled]), input, select, textarea, [href], [tabindex]:not([tabindex="-1"])';

/**
 * The info card: one bottom sheet for every target, opened through TargetInfoService from a picker row,
 * the found toast or a Look Around label. Same sheet behavior as the picker: a modal dialog with a focus
 * trap, Escape / backdrop / swipe-down close, focus returns to whatever opened it, and reduced motion
 * fades instead of sliding.
 */
@Component({
  selector: 'app-target-info',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (current(); as c) {
      <button
        type="button"
        class="backdrop"
        tabindex="-1"
        aria-label="Close"
        (click)="close()"
      ></button>
      <div
        #sheet
        class="sheet"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="'About ' + c.def.name"
        tabindex="-1"
        [style.transform]="dragOffset() > 0 ? 'translateY(' + dragOffset() + 'px)' : null"
        (keydown)="onKeydown($event)"
      >
        <div
          class="grab"
          (pointerdown)="dragStart($event)"
          (pointermove)="dragMove($event)"
          (pointerup)="dragEnd()"
          (pointercancel)="dragEnd()"
        >
          <span class="handle"></span>
        </div>

        <div class="scroll">
          <header>
            <span class="glyph" aria-hidden="true" [style.color]="c.def.planet?.color ?? null">{{
              glyph(c.def)
            }}</span>
            <div>
              <h2>{{ c.def.name }}</h2>
              <p class="type">{{ c.def.info.type }}</p>
            </div>
          </header>

          @if (c.def.kind === 'sun') {
            <p class="sun-warning" role="alert">{{ sunWarning }}</p>
          }

          <p class="desc">{{ c.def.info.description }}</p>
          <ul class="facts">
            @for (fact of c.def.info.facts; track fact) {
              <li>{{ fact }}</li>
            }
          </ul>

          <dl class="stats">
            @for (s of stats(); track s.label) {
              <div class="stat">
                <dt>{{ s.label }}</dt>
                <dd>{{ s.value }}</dd>
              </div>
            }
          </dl>
        </div>

        <div class="actions">
          <button type="button" class="pill primary" (click)="find(c.def)">Find it</button>
          <button type="button" class="pill" (click)="close()">Close</button>
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      display: contents;
    }
    .backdrop {
      border: 0;
      padding: 0;
      cursor: default;
      position: fixed;
      inset: 0;
      z-index: 30;
      background: rgba(0, 0, 0, 0.5);
      animation: fade 0.2s ease;
    }
    .sheet {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 31;
      max-height: 85%;
      display: flex;
      flex-direction: column;
      background: rgba(18, 17, 14, 0.97);
      color: #e9e6dc;
      border-radius: 1.2rem 1.2rem 0 0;
      border-top: 1px solid rgba(233, 230, 220, 0.12);
      padding-bottom: env(safe-area-inset-bottom, 0px);
      padding-left: env(safe-area-inset-left, 0px);
      padding-right: env(safe-area-inset-right, 0px);
      font-family: system-ui, sans-serif;
      animation: slide 0.25s ease;
      outline: none;
      touch-action: pan-y;
    }
    @keyframes slide {
      from {
        transform: translateY(100%);
      }
    }
    @keyframes fade {
      from {
        opacity: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .sheet {
        animation: fade 0.15s linear;
      }
    }
    .grab {
      flex: none;
      display: grid;
      place-items: center;
      height: 1.6rem;
      cursor: grab;
      touch-action: none;
    }
    .handle {
      width: 2.5rem;
      height: 0.25rem;
      border-radius: 999px;
      background: rgba(233, 230, 220, 0.3);
    }
    .scroll {
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 0 1.1rem 0.6rem;
    }
    header {
      display: flex;
      align-items: center;
      gap: 0.8rem;
    }
    .glyph {
      font-size: 1.8rem;
      width: 2.2rem;
      text-align: center;
    }
    h2 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 600;
    }
    .type {
      margin: 0.1rem 0 0;
      font-size: 0.8rem;
      opacity: 0.6;
    }
    .sun-warning {
      margin: 0.8rem 0 0;
      padding: 0.6rem 0.8rem;
      border-radius: 0.6rem;
      text-align: center;
      font-size: 0.85rem;
      font-weight: 600;
      color: #1a1100;
      background: #ffcf4d;
    }
    .desc {
      margin: 0.9rem 0 0.5rem;
      font-size: 0.95rem;
      line-height: 1.45;
    }
    .facts {
      margin: 0;
      padding-left: 1.1rem;
      font-size: 0.9rem;
      line-height: 1.45;
    }
    .facts li {
      margin: 0.25rem 0;
    }
    .stats {
      margin: 0.9rem 0 0;
      border-top: 1px solid rgba(233, 230, 220, 0.12);
    }
    .stat {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.5rem 0;
      border-bottom: 1px solid rgba(233, 230, 220, 0.07);
      font-size: 0.85rem;
    }
    dt {
      opacity: 0.6;
    }
    dd {
      margin: 0;
      text-align: right;
    }
    .actions {
      flex: none;
      display: flex;
      gap: 0.7rem;
      justify-content: center;
      padding: 0.6rem 1rem 0.9rem;
    }
    .pill {
      min-height: 48px;
      padding: 0 1.4rem;
      font: inherit;
      color: inherit;
      background: rgba(233, 230, 220, 0.1);
      border: 1px solid rgba(233, 230, 220, 0.25);
      border-radius: 999px;
      cursor: pointer;
    }
    .pill.primary {
      background: #e9e6dc;
      color: #14120e;
      border-color: #e9e6dc;
    }
    .pill:focus-visible {
      outline: 2px solid #e9e6dc;
      outline-offset: 2px;
    }
  `,
})
export class TargetInfo {
  private readonly info = inject(TargetInfoService);
  private readonly location = inject(LocationService);
  private readonly gp = inject(GpService);
  private readonly sheetRef = viewChild<ElementRef<HTMLElement>>('sheet');

  /** "Find it": the parent selects the target, leaves Look Around and closes everything. */
  readonly findIt = output<TargetDef>();

  protected readonly current = this.info.current;
  protected readonly dragOffset = signal(0);
  protected readonly sunWarning = SUN_SAFETY_BANNER;
  protected readonly glyph = targetGlyph;

  /** Bumped on a timer while the card is open, so the live numbers follow the clock. */
  private readonly clock = signal(new Date());
  private dragStartY: number | null = null;
  private returnFocusTo: Element | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  protected readonly stats = computed<LiveStat[]>(() => {
    const c = this.current();
    const now = this.clock();
    const pos = this.location.position();
    if (!c || !pos) return [];
    try {
      const elements = this.gp.elements() ?? undefined;
      const state = computeTargetState(c.def, now, pos, elements);
      return liveStats(c.def, state, now, { elements });
    } catch (e) {
      // A satellite whose orbit data is not here (yet): show nothing rather than guess.
      if (e instanceof SatelliteDataError) return [];
      throw e;
    }
  });

  constructor() {
    effect(() => {
      const c = this.current();
      untracked(() => {
        this.stopTimer();
        if (c) {
          this.returnFocusTo ??= document.activeElement;
          this.clock.set(new Date());
          // A user action (they asked about a satellite), so loading its orbit data is allowed.
          if (c.def.kind === 'satellite') void this.gp.get();
          const every = c.def.kind === 'satellite' ? SATELLITE_REFRESH_MS : REFRESH_MS;
          this.timer = setInterval(() => this.clock.set(new Date()), every);
          setTimeout(() => this.sheetRef()?.nativeElement.focus(), 0);
        } else {
          const prev = this.returnFocusTo;
          this.returnFocusTo = null;
          this.dragOffset.set(0);
          if (prev instanceof HTMLElement && prev.isConnected) prev.focus();
        }
      });
    });
    inject(DestroyRef).onDestroy(() => this.stopTimer());
  }

  protected close(): void {
    this.info.close();
  }

  protected find(def: TargetDef): void {
    this.findIt.emit(def);
  }

  /** Keeps Tab inside the dialog; Escape closes only the card (not a picker underneath it). */
  protected onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.close();
      return;
    }
    if (e.key !== 'Tab') return;
    const root = this.sheetRef()?.nativeElement;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === root)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  protected dragStart(e: PointerEvent): void {
    this.dragStartY = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  protected dragMove(e: PointerEvent): void {
    if (this.dragStartY === null) return;
    this.dragOffset.set(Math.max(0, e.clientY - this.dragStartY));
  }

  protected dragEnd(): void {
    if (this.dragStartY === null) return;
    const dy = this.dragOffset();
    this.dragStartY = null;
    if (dy > SWIPE_CLOSE_PX) this.close();
    else this.dragOffset.set(0);
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
