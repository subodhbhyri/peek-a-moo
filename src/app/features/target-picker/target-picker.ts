import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { AnalyticsService, SelectionSource } from '../../core/analytics/analytics.service';
import { GpService } from '../../core/gp/gp.service';
import { StatsService } from '../../core/personality/stats.service';
import { AvailabilityService } from '../../core/targets/availability.service';
import { formatAvailability } from '../../core/targets/availability-format';
import { TARGETS } from '../../core/targets/catalog';
import { TargetSelectionService } from '../../core/targets/target-selection.service';
import type { TargetCategory, TargetDef } from '../../core/targets/target.types';
import { SUN_SAFETY_BANNER } from '../../core/personality/target-lines';
import { targetGlyph } from './target-glyph';

/** Section order and titles. Adding the Satellites section in Phase 6 is a data change: it is listed already. */
const SECTIONS: readonly { category: TargetCategory; title: string }[] = [
  { category: 'solar-system', title: 'Solar system' },
  { category: 'stars', title: 'Stars' },
  { category: 'deep-sky', title: 'Deep sky' },
  { category: 'satellites', title: 'Satellites' },
];

const BEST_MAX = 3;
const SWIPE_CLOSE_PX = 90;

/** Lowercase, accent-free text for matching. */
export function normalizeSearch(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

const FOCUSABLE =
  'button:not([disabled]), input, select, textarea, [href], [tabindex]:not([tabindex="-1"])';

/**
 * The "drop box": a bottom sheet listing everything findable with a live status label per target.
 * Controlled by the parent through `open`; emits `closed` for every way out (backdrop, swipe, Escape,
 * choosing a row).
 */
@Component({
  selector: 'app-target-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'onEscape()' },
  template: `
    @if (open()) {
      <button
        type="button"
        class="backdrop"
        tabindex="-1"
        aria-label="Close picker"
        (click)="close()"
      ></button>
      <div
        #sheet
        class="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Pick something to find"
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

        @if (pendingSun()) {
          <div class="confirm">
            <p>{{ sunWarning }} Continue?</p>
            <div class="row-buttons">
              <button type="button" class="pill" (click)="pendingSun.set(false)">Cancel</button>
              <button type="button" class="pill primary" (click)="confirmSun()">
                I understand
              </button>
            </div>
          </div>
        } @else {
          <input
            class="search"
            type="search"
            placeholder="Search the sky"
            aria-label="Search the sky"
            autocomplete="off"
            [value]="query()"
            (input)="query.set($any($event.target).value)"
          />

          <div class="scroll">
            @if (best().length > 0 && !searching()) {
              <section>
                <h3>Best right now</h3>
                <div class="chips">
                  @for (def of best(); track def.id) {
                    <button type="button" class="chip" (click)="choose(def, 'best-now')">
                      <span class="glyph" aria-hidden="true">{{ glyph(def) }}</span>
                      {{ def.shortName }}
                    </button>
                  }
                </div>
              </section>
            }

            @for (section of sections(); track section.category) {
              <section>
                <h3>{{ section.title }}</h3>
                <ul>
                  @for (row of section.rows; track row.def.id) {
                    <li>
                      <button
                        type="button"
                        class="row"
                        [attr.aria-current]="row.selected ? 'true' : null"
                        (click)="choose(row.def)"
                      >
                        <span class="glyph" aria-hidden="true" [style.color]="row.color">{{
                          glyph(row.def)
                        }}</span>
                        <span class="text">
                          <span class="name">
                            {{ row.def.name }}
                            @if (row.warn) {
                              <span
                                class="warn"
                                role="img"
                                aria-label="Warning: never look at the Sun"
                                >⚠️</span
                              >
                            }
                            @if (row.finds > 0) {
                              <span class="badge">found {{ row.finds }}×</span>
                            }
                          </span>
                          @if (row.status) {
                            <span class="status" [class]="'status ' + row.status.tone">{{
                              row.status.label
                            }}</span>
                          } @else {
                            <span class="skeleton" aria-hidden="true"></span>
                          }
                        </span>
                        @if (row.selected) {
                          <span class="check" role="img" aria-label="Selected">✓</span>
                        }
                      </button>
                    </li>
                  }
                </ul>
              </section>
            } @empty {
              <p class="none">Nothing in the sky matches that.</p>
            }
          </div>
        }
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
      z-index: 20;
      background: rgba(0, 0, 0, 0.5);
      animation: fade 0.2s ease;
    }
    .sheet {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 21;
      max-height: 80%;
      display: flex;
      flex-direction: column;
      background: rgba(18, 17, 14, 0.96);
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
    .search {
      flex: none;
      margin: 0 1rem 0.6rem;
      padding: 0.7rem 0.9rem;
      min-height: 48px;
      box-sizing: border-box;
      font: inherit;
      font-size: 1rem;
      color: inherit;
      background: rgba(233, 230, 220, 0.08);
      border: 1px solid rgba(233, 230, 220, 0.15);
      border-radius: 0.8rem;
    }
    .scroll {
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 0 1rem 1rem;
    }
    h3 {
      margin: 0.9rem 0 0.4rem;
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      opacity: 0.55;
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .chips {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .chip {
      min-height: 48px;
      padding: 0 1rem;
      font: inherit;
      color: inherit;
      background: rgba(233, 230, 220, 0.1);
      border: 1px solid rgba(233, 230, 220, 0.2);
      border-radius: 999px;
      cursor: pointer;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 0.8rem;
      width: 100%;
      min-height: 52px;
      padding: 0.4rem 0.2rem;
      font: inherit;
      color: inherit;
      text-align: left;
      background: none;
      border: 0;
      border-bottom: 1px solid rgba(233, 230, 220, 0.07);
      cursor: pointer;
    }
    .row:focus-visible,
    .chip:focus-visible,
    .pill:focus-visible {
      outline: 2px solid #e9e6dc;
      outline-offset: 2px;
    }
    .glyph {
      flex: none;
      width: 1.6rem;
      text-align: center;
      font-size: 1.2rem;
    }
    .text {
      flex: 1;
      display: grid;
      gap: 0.1rem;
      min-width: 0;
    }
    .name {
      font-size: 1rem;
    }
    .badge {
      margin-left: 0.5rem;
      font-size: 0.7rem;
      opacity: 0.45;
    }
    .status {
      font-size: 0.82rem;
    }
    .status.good {
      color: #9fd8a8;
    }
    .status.meh {
      color: #e0c98a;
    }
    .status.off {
      color: #9a968c;
    }
    .skeleton {
      display: block;
      width: 7rem;
      height: 0.7rem;
      border-radius: 0.35rem;
      background: rgba(233, 230, 220, 0.1);
    }
    .check {
      flex: none;
      font-size: 1.1rem;
    }
    .none {
      opacity: 0.6;
      text-align: center;
      padding: 1.5rem 0;
    }
    .confirm {
      padding: 1rem 1.2rem 1.4rem;
      text-align: center;
    }
    .confirm p {
      margin: 0 0 1rem;
      font-size: 1rem;
    }
    .row-buttons {
      display: flex;
      gap: 0.7rem;
      justify-content: center;
    }
    .pill {
      min-height: 48px;
      padding: 0 1.2rem;
      font: inherit;
      color: inherit;
      background: rgba(233, 230, 220, 0.1);
      border: 1px solid rgba(233, 230, 220, 0.25);
      border-radius: 999px;
      cursor: pointer;
    }
    .pill.primary {
      background: #ffcf4d;
      color: #1a1100;
      border-color: #ffcf4d;
    }
  `,
})
export class TargetPicker {
  readonly open = input.required<boolean>();
  readonly closed = output<void>();

  private readonly selection = inject(TargetSelectionService);
  private readonly availability = inject(AvailabilityService);
  private readonly stats = inject(StatsService);
  private readonly gp = inject(GpService);
  private readonly analytics = inject(AnalyticsService);
  private readonly sheetRef = viewChild<ElementRef<HTMLElement>>('sheet');

  protected readonly query = signal('');
  protected readonly pendingSun = signal(false);
  protected readonly dragOffset = signal(0);
  protected readonly sunWarning = SUN_SAFETY_BANNER;
  protected readonly glyph = targetGlyph;

  private dragStartY: number | null = null;
  private returnFocusTo: Element | null = null;
  private readonly locale = typeof navigator !== 'undefined' ? navigator.language : 'en-US';
  private now = signal(new Date());

  protected readonly searching = computed(() => normalizeSearch(this.query()).length > 0);

  /** Up to three visible-now targets, brightest first, never the Sun. */
  protected readonly best = computed<TargetDef[]>(() => {
    const byId = this.availability.byId();
    return TARGETS.filter((t) => t.kind !== 'sun' && byId[t.id]?.visibility === 'up-visible')
      .sort((a, b) => (byId[a.id].magnitude ?? Infinity) - (byId[b.id].magnitude ?? Infinity))
      .slice(0, BEST_MAX);
  });

  protected readonly sections = computed(() => {
    const q = normalizeSearch(this.query());
    const byId = this.availability.byId();
    const perTarget = this.stats.stats().perTarget;
    const selectedId = this.selection.selectedId();
    const now = this.now();
    return SECTIONS.map((s) => ({
      category: s.category,
      title: s.title,
      rows: TARGETS.filter((t) => t.category === s.category)
        .filter(
          (t) =>
            !q || [t.name, t.shortName, t.id].some((field) => normalizeSearch(field).includes(q)),
        )
        .map((def) => {
          const a = byId[def.id];
          const status = a ? formatAvailability(a, now, this.locale, { def }) : null;
          return {
            def,
            status,
            warn: status?.warn ?? def.kind === 'sun',
            finds: perTarget[def.id]?.finds ?? 0,
            selected: def.id === selectedId,
            color: def.planet?.color ?? null,
          };
        }),
    })).filter((s) => s.rows.length > 0);
  });

  /** True while the Satellites section is on screen (open, and not filtered out by the search). */
  private readonly satellitesShown = computed(
    () => this.open() && this.sections().some((s) => s.category === 'satellites'),
  );

  constructor() {
    // The first time the Satellites section renders, ask for orbit data (never earlier).
    effect(() => {
      if (this.satellitesShown()) untracked(() => void this.gp.get());
    });
    // Orbit data arriving (or failing) while the sheet is open: fill in the satellite rows.
    effect(() => {
      this.gp.stamp();
      if (this.open()) untracked(() => void this.availability.refreshAll());
    });
    // On open: remember what had focus, compute availability (instantly showing skeletons), focus the
    // sheet. On close: give focus back.
    effect(() => {
      if (this.open()) {
        untracked(() => {
          this.returnFocusTo = document.activeElement;
          this.now.set(new Date());
          this.pendingSun.set(false);
          void this.availability.refreshAll();
          setTimeout(() => this.sheetRef()?.nativeElement.focus(), 0);
        });
      } else {
        untracked(() => {
          const prev = this.returnFocusTo;
          this.returnFocusTo = null;
          this.dragOffset.set(0);
          if (prev instanceof HTMLElement && prev.isConnected) prev.focus();
          else document.querySelector<HTMLElement>('.target-chip')?.focus();
        });
      }
    });
    inject(DestroyRef).onDestroy(() => (this.returnFocusTo = null));
  }

  protected choose(def: TargetDef, from: SelectionSource = 'picker'): void {
    if (def.kind === 'sun' && this.selection.selectedId() !== def.id) {
      this.pendingSun.set(true);
      return;
    }
    this.apply(def.id, from);
  }

  protected confirmSun(): void {
    this.apply('sun', 'picker');
  }

  private apply(id: string, from: SelectionSource): void {
    this.selection.select(id);
    this.analytics.targetSelected(id, from);
    this.query.set('');
    this.pendingSun.set(false);
    this.closed.emit();
  }

  protected close(): void {
    this.query.set('');
    this.pendingSun.set(false);
    this.closed.emit();
  }

  protected onEscape(): void {
    if (this.open()) this.close();
  }

  /** Keeps Tab inside the dialog. */
  protected onKeydown(e: KeyboardEvent): void {
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
}
