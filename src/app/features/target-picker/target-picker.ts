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
import { TargetInfoService } from '../target-info/target-info.service';
import { AnalyticsService, SelectionSource } from '../../core/analytics/analytics.service';
import { GpService } from '../../core/gp/gp.service';
import { StatsService } from '../../core/personality/stats.service';
import { SkyDataService } from '../../core/sky/sky-data.service';
import { AvailabilityService } from '../../core/targets/availability.service';
import { formatAvailability } from '../../core/targets/availability-format';
import { ALL_TARGETS, TARGETS } from '../../core/targets/catalog';
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
  { category: 'constellations', title: 'Constellations' },
];

/** The constellations section shows just the most prominent ones until the user asks for all of them. */
const PROMINENT_RANK = 1;

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
            @if (!searching()) {
              <button
                type="button"
                class="look-around"
                [attr.aria-current]="lookActive() ? 'true' : null"
                (click)="lookAround()"
              >
                <span class="glyph" aria-hidden="true">◎</span>
                <span class="text">
                  <span class="name">Look Around</span>
                  <span class="sub">See everything at once</span>
                </span>
                @if (lookActive()) {
                  <span class="check" role="img" aria-label="Selected">✓</span>
                }
              </button>
            }
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
              <section [attr.data-category]="section.category">
                <h3>{{ section.title }}</h3>
                <ul>
                  @for (row of section.rows; track row.def.id) {
                    <li class="item">
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
                          } @else if (row.blurb) {
                            <span class="blurb">{{ row.blurb }}</span>
                          } @else {
                            <span class="skeleton" aria-hidden="true"></span>
                          }
                        </span>
                        @if (row.selected) {
                          <span class="check" role="img" aria-label="Selected">✓</span>
                        }
                      </button>
                      <button
                        type="button"
                        class="info-btn"
                        [attr.aria-label]="'About ' + row.def.name"
                        (click)="openInfo(row.def, $event)"
                      >
                        <span aria-hidden="true">ⓘ</span>
                      </button>
                    </li>
                  }
                </ul>
                @if (section.category === 'constellations' && !searching()) {
                  <button type="button" class="show-all" (click)="toggleAllConstellations()">
                    {{ showAllConstellations() ? 'Show fewer' : 'Show all ' + constellationCount }}
                  </button>
                }
              </section>
            } @empty {
              <p class="none">Nothing in the sky matches that.</p>
            }
            <p class="credits">
              Star map from
              <a href="https://github.com/ofrohn/d3-celestial" target="_blank" rel="noopener"
                >d3-celestial</a
              >
              (BSD-3-Clause,
              <a href="/data/LICENSE-d3-celestial.txt" target="_blank" rel="noopener">notice</a>).
            </p>
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
    .item {
      display: flex;
      align-items: center;
      border-bottom: 1px solid rgba(233, 230, 220, 0.07);
    }
    .item .row {
      flex: 1;
      min-width: 0;
      border-bottom: 0;
    }
    .info-btn {
      flex: none;
      width: 44px;
      height: 44px;
      font: inherit;
      font-size: 1.2rem;
      color: inherit;
      opacity: 0.7;
      background: none;
      border: 0;
      border-radius: 50%;
      cursor: pointer;
    }
    .info-btn:focus-visible,
    .look-around:focus-visible {
      outline: 2px solid #e9e6dc;
      outline-offset: 2px;
    }
    .sub {
      font-size: 0.82rem;
      opacity: 0.7;
    }
    .look-around {
      display: flex;
      align-items: center;
      gap: 0.8rem;
      width: 100%;
      min-height: 56px;
      margin: 0.4rem 0 0.2rem;
      padding: 0.4rem 0.8rem;
      font: inherit;
      color: inherit;
      text-align: left;
      background: rgba(233, 230, 220, 0.08);
      border: 1px solid rgba(233, 230, 220, 0.18);
      border-radius: 0.8rem;
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
    .status,
    .blurb {
      font-size: 0.82rem;
    }
    .blurb {
      color: #9a968c;
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
    .show-all {
      min-height: 48px;
      width: 100%;
      margin-top: 0.2rem;
      font: inherit;
      font-size: 0.85rem;
      color: inherit;
      opacity: 0.8;
      background: none;
      border: 0;
      cursor: pointer;
    }
    .show-all:focus-visible {
      outline: 2px solid #e9e6dc;
      outline-offset: 2px;
    }
    .credits {
      margin: 1rem 0 0;
      font-size: 0.7rem;
      opacity: 0.4;
      text-align: center;
    }
    .credits a {
      color: inherit;
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
  /** Whether Look Around is the current mode (shows the check mark on its row). */
  readonly lookActive = input(false);
  /** Look Around was chosen. The parent switches the engine's mode. */
  readonly lookAroundChosen = output<void>();
  /** A target was chosen (so the parent leaves Look Around for find mode). */
  readonly targetChosen = output<string>();

  private readonly selection = inject(TargetSelectionService);
  private readonly availability = inject(AvailabilityService);
  private readonly stats = inject(StatsService);
  private readonly gp = inject(GpService);
  private readonly sky = inject(SkyDataService);
  private readonly analytics = inject(AnalyticsService);
  private readonly info = inject(TargetInfoService);
  private readonly sheetRef = viewChild<ElementRef<HTMLElement>>('sheet');

  protected readonly query = signal('');
  protected readonly pendingSun = signal(false);
  protected readonly dragOffset = signal(0);
  protected readonly sunWarning = SUN_SAFETY_BANNER;
  protected readonly showAllConstellations = signal(false);
  protected readonly constellationCount = ALL_TARGETS.filter((t) => t.category === 'constellations')
    .length;
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
    const showAll = this.showAllConstellations();
    const mapLoaded = this.sky.geometry() !== null;
    return SECTIONS.map((s) => ({
      category: s.category,
      title: s.title,
      rows: ALL_TARGETS.filter((t) => t.category === s.category)
        .filter((t) => q || showAll || (t.constellation?.rank ?? PROMINENT_RANK) === PROMINENT_RANK)
        .filter(
          (t) =>
            !q ||
            [t.name, t.shortName, t.id, t.constellation?.english, t.constellation?.iau].some(
              (field) => !!field && normalizeSearch(field).includes(q),
            ),
        )
        .map((def) => {
          const a = byId[def.id];
          const status = a ? formatAvailability(a, now, this.locale, { def }) : null;
          return {
            def,
            status,
            warn: status?.warn ?? def.kind === 'sun',
            // A constellation's status needs the star map, which only Look Around or choosing one loads.
            blurb: !status && def.kind === 'constellation' && !mapLoaded ? def.blurb : null,
            finds: perTarget[def.id]?.finds ?? 0,
            selected: def.id === selectedId,
            color: def.planet?.color ?? null,
          };
        }),
    })).filter((s) => s.rows.length > 0);
  });

  /** The shown constellations beyond the prominent 22 (Show all, or a search): the picker asks for their status too. */
  private readonly extraConstellations = computed<TargetDef[]>(() =>
    this.sections()
      .filter((s) => s.category === 'constellations')
      .flatMap((s) => s.rows.map((r) => r.def))
      .filter((d) => d.constellation?.rank !== PROMINENT_RANK),
  );

  /** True while the Satellites section is on screen (open, and not filtered out by the search). */
  private constellationObserver: IntersectionObserver | null = null;
  private observedSection: Element | null = null;

  private readonly satellitesShown = computed(
    () => this.open() && this.sections().some((s) => s.category === 'satellites'),
  );

  constructor() {
    // The star map is fetched the first time the Constellations section scrolls into view (never when
    // the sheet merely opens: the section is usually below the fold). Without IntersectionObserver
    // nothing is fetched here; selecting a constellation or Look Around still loads it.
    effect(() => {
      const sheet = this.sheetRef()?.nativeElement;
      this.sections();
      untracked(() => this.observeConstellations(sheet));
    });
    inject(DestroyRef).onDestroy(() => this.stopObserving());
    // The first time the Satellites section renders, ask for orbit data (never earlier).
    effect(() => {
      if (this.satellitesShown()) untracked(() => void this.gp.get());
    });
    // Orbit data arriving (or failing) while the sheet is open: fill in the satellite rows.
    effect(() => {
      this.gp.stamp();
      if (this.open())
        untracked(() => void this.availability.refreshAll(this.extraConstellations()));
    });
    // The star map arriving, or more constellation rows being shown: fill in their status.
    effect(() => {
      this.sky.geometry();
      const extra = this.extraConstellations();
      if (this.open()) untracked(() => void this.availability.refreshAll(extra));
    });
    // On open: remember what had focus, compute availability (instantly showing skeletons), focus the
    // sheet. On close: give focus back.
    effect(() => {
      if (this.open()) {
        untracked(() => {
          this.returnFocusTo = document.activeElement;
          this.now.set(new Date());
          this.pendingSun.set(false);
          void this.availability.refreshAll(this.extraConstellations());
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

  private observeConstellations(sheet: HTMLElement | undefined): void {
    const section = sheet?.querySelector('section[data-category="constellations"]') ?? null;
    if (section === this.observedSection) return;
    this.stopObserving();
    if (!section || this.sky.geometry() || typeof IntersectionObserver === 'undefined') return;
    this.observedSection = section;
    this.constellationObserver = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      this.stopObserving();
      void this.sky.load();
    });
    this.constellationObserver.observe(section);
  }

  private stopObserving(): void {
    this.constellationObserver?.disconnect();
    this.constellationObserver = null;
    this.observedSection = null;
  }

  protected toggleAllConstellations(): void {
    this.showAllConstellations.update((v) => !v);
  }

  /** Enter Look Around: every target at once, no finding. */
  protected lookAround(): void {
    this.lookAroundChosen.emit();
    this.analytics.lookAroundOpened('picker');
    this.close();
  }

  /** The (i) on a row: the info card opens over the sheet; the sheet stays where it was. */
  protected openInfo(def: TargetDef, event: Event): void {
    event.stopPropagation();
    this.info.open(def, 'picker');
  }

  protected confirmSun(): void {
    this.apply('sun', 'picker');
  }

  private apply(id: string, from: SelectionSource): void {
    this.selection.select(id);
    this.targetChosen.emit(id);
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
    // The info card (above this sheet) handles its own Escape.
    if (this.open() && !this.info.current()) this.close();
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
