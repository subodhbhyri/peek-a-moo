import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { GP_FIXTURE } from '../../core/gp/testing/gp-fixture';
import { ANALYTICS_SINK } from '../../core/analytics/analytics.service';
import { StatsService } from '../../core/personality/stats.service';
import type { Availability } from '../../core/targets/availability';
import { AvailabilityService } from '../../core/targets/availability.service';
import { ALL_TARGETS, TARGETS } from '../../core/targets/catalog';
import { LocationService } from '../../core/sensors/location.service';
import { TargetSelectionService } from '../../core/targets/target-selection.service';
import { TargetPicker, normalizeSearch } from './target-picker';

const CLOCK = new Date('2026-10-30T01:20:00Z');
const POS = { latitude: 39.6, longitude: -104.7, heightM: 1800 };

describe('normalizeSearch', () => {
  it('lowercases and strips accents', () => {
    expect(normalizeSearch('  Andrômeda ')).toBe('andromeda');
    expect(normalizeSearch('ÉTOILE')).toBe('etoile');
  });
});

describe('TargetPicker', () => {
  let fixture: ComponentFixture<TargetPicker>;
  let closed: number;
  const el = () => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement>(sel: string) => el().querySelector<T>(sel);
  const qa = (sel: string) => Array.from(el().querySelectorAll<HTMLElement>(sel));
  const rowNames = () => qa('.row .name').map((n) => n.firstChild?.textContent?.trim() ?? '');
  const rowFor = (name: string) =>
    qa('.row').find((r) => r.querySelector('.name')?.textContent?.includes(name))!;

  /** Re-renders, flushing the chunked availability timers first. */
  async function settle() {
    await vi.runAllTimersAsync();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function create(open = true) {
    fixture = TestBed.createComponent(TargetPicker);
    closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    fixture.componentRef.setInput('open', open);
    fixture.detectChanges();
  }
  const setOpen = (open: boolean) => {
    fixture.componentRef.setInput('open', open);
    fixture.detectChanges();
  };

  let sent: { name: string; props: Record<string, unknown> }[];

  beforeEach(() => {
    sent = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ANALYTICS_SINK,
          useValue: (name: string, props: Record<string, unknown>) => sent.push({ name, props }),
        },
      ],
    });
    vi.useFakeTimers();
    // A fixed clock, and orbit data fetched 10 minutes before it: GpService only reuses a copy that is
    // at most 2 h old by the clock, so a fixture with a fixed date must not depend on the real time.
    vi.setSystemTime(CLOCK);
    // The Satellites section asks for orbit data as soon as the sheet shows it.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              ...GP_FIXTURE,
              fetchedAt: new Date(CLOCK.getTime() - 600_000).toISOString(),
            }),
            { status: 200 },
          ),
      ),
    );
    localStorage.clear();
    history.replaceState(null, '', '/');
    TestBed.inject(LocationService).setManual(POS);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('is closed until opened', () => {
    create(false);
    expect(q('[role=dialog]')).toBeNull();
    setOpen(true);
    const d = q('[role=dialog]')!;
    expect(d).not.toBeNull();
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(d.getAttribute('aria-label')).toBe('Pick something to find');
  });

  it('lists Solar system, Stars, Deep sky, Satellites, Constellations in order, in catalog order', async () => {
    create();
    await settle();
    expect(
      qa('h3')
        .map((h) => h.textContent!.trim())
        .filter((t) => t !== 'Best right now'),
    ).toEqual(['Solar system', 'Stars', 'Deep sky', 'Satellites', 'Constellations']);
    // Within a section the order is the catalog's, not re-sorted by availability. Constellations show
    // just the 22 prominent ones until "Show all" (Phase 10).
    const expected = ['solar-system', 'stars', 'deep-sky', 'satellites', 'constellations'].flatMap(
      (c) =>
        ALL_TARGETS.filter(
          (t) => t.category === c && (c !== 'constellations' || t.constellation?.rank === 1),
        ).map((t) => t.name),
    );
    expect(rowNames()).toEqual(expected);
  });

  it('shows skeletons first, then a status label for every row', async () => {
    create();
    // The first target is computed in the same tick as opening; the rest fill in one per timer tick.
    expect(qa('.skeleton').length).toBe(TARGETS.length - 1);
    expect(qa('.status')).toHaveLength(1);
    await settle();
    await settle(); // orbit data arrives after the first pass; the satellite rows fill in on the second
    expect(qa('.skeleton')).toHaveLength(0);
    expect(qa('.status')).toHaveLength(TARGETS.length);
    expect(rowFor('Galactic Center').querySelector('.status')!.textContent).toMatch(
      /hidden behind dust|Rises|Not up/,
    );
    expect(rowFor('Large Magellanic Cloud').querySelector('.status')!.textContent).toContain(
      'Never rises from here',
    );
  });

  it('search filters by name, short name and id, ignoring case and accents', async () => {
    create();
    await settle();
    const type = (text: string) => {
      const input = q<HTMLInputElement>('input.search')!;
      input.value = text;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    type('ANDRÔMEDA');
    // The galaxy, and (Phase 10) the constellation it is in.
    expect(rowNames()).toEqual(['Andromeda Galaxy', 'Andromeda']);
    type('lmc');
    expect(rowNames()).toEqual(['Large Magellanic Cloud']);
    type('m45');
    expect(rowNames()).toEqual(['Pleiades']);
    type('orion');
    expect(rowNames()).toEqual(['Orion Nebula', 'Orion']); // and, since Phase 10, the constellation
    type('zzzz');
    expect(rowNames()).toEqual([]);
    expect(q('.none')).not.toBeNull();
    type('');
    // The 22 targets plus the 22 prominent constellations (Phase 10).
    expect(rowNames()).toHaveLength(TARGETS.length + 22);
  });

  it('choosing a row selects the target, closes the sheet and clears the search', async () => {
    create();
    await settle();
    const input = q<HTMLInputElement>('input.search')!;
    input.value = 'jup';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    rowFor('Jupiter').click();
    fixture.detectChanges();
    expect(TestBed.inject(TargetSelectionService).selectedId()).toBe('jupiter');
    expect(localStorage.getItem('ptm.target')).toBe('jupiter');
    expect(closed).toBe(1);
    setOpen(false);
    setOpen(true);
    expect(q<HTMLInputElement>('input.search')!.value).toBe('');
  });

  it('marks the selected row with a check and shows found counts', async () => {
    TestBed.inject(StatsService).recordFind('moon', 3000);
    TestBed.inject(StatsService).recordFind('moon', 2500);
    create();
    await settle();
    expect(rowFor('Moon').querySelector('.check')).not.toBeNull();
    expect(rowFor('Jupiter').querySelector('.check')).toBeNull();
    expect(rowFor('Moon').querySelector('.badge')!.textContent!.trim()).toBe('found 2×');
    expect(rowFor('Jupiter').querySelector('.badge')).toBeNull();
    expect(rowFor('Moon').getAttribute('aria-current')).toBe('true');
  });

  it('Escape closes it and focus goes back to where it was', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    create(false);
    setOpen(true);
    vi.advanceTimersByTime(10);
    expect(document.activeElement).toBe(q('[role=dialog]'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toBe(1);
    setOpen(false);
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('the backdrop closes it', () => {
    create();
    q('.backdrop')!.click();
    expect(closed).toBe(1);
  });

  it('keeps Tab inside the dialog', () => {
    create();
    vi.advanceTimersByTime(10);
    // The last stop is the credits link at the bottom of the list (Phase 10).
    const focusables = qa(
      '[role=dialog] button:not([tabindex="-1"]), [role=dialog] input, [role=dialog] a[href]',
    );
    const last = focusables[focusables.length - 1];
    last.focus();
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    last.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(focusables[0]);
    const back = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    q('[role=dialog]')!.focus();
    q('[role=dialog]')!.dispatchEvent(back);
    expect(back.defaultPrevented).toBe(true);
  });

  describe('the Sun', () => {
    it('asks for confirmation first; Cancel changes nothing', async () => {
      create();
      await settle();
      rowFor('Sun').click();
      fixture.detectChanges();
      const text = q('.confirm')!.textContent!;
      expect(text).toContain('Never look at the Sun — not directly, not through your camera.');
      expect(text).toContain('Continue?');
      expect(TestBed.inject(TargetSelectionService).selectedId()).toBe('moon');
      expect(closed).toBe(0);
      qa('.confirm .pill')
        .find((b) => b.textContent!.includes('Cancel'))!
        .click();
      fixture.detectChanges();
      expect(q('.confirm')).toBeNull();
      expect(TestBed.inject(TargetSelectionService).selectedId()).toBe('moon');
    });

    it('"I understand" selects the Sun and closes', async () => {
      create();
      await settle();
      rowFor('Sun').click();
      fixture.detectChanges();
      qa('.confirm .pill')
        .find((b) => b.textContent!.includes('I understand'))!
        .click();
      expect(TestBed.inject(TargetSelectionService).selectedId()).toBe('sun');
      expect(closed).toBe(1);
    });

    it('the Sun row carries the warning mark', async () => {
      create();
      await settle();
      expect(rowFor('Sun').querySelector('.warn')).not.toBeNull();
      expect(rowFor('Moon').querySelector('.warn')).toBeNull();
    });
  });

  describe('Best right now', () => {
    const av = (
      targetId: string,
      magnitude: number,
      visibility: Availability['visibility'],
    ): Availability => ({
      targetId,
      computedAt: new Date(),
      altitudeDeg: 30,
      magnitude,
      visibility,
      low: false,
      nextRise: null,
      nextSet: null,
      alwaysUp: false,
      neverUp: false,
      neverRisesHere: false,
    });

    /** Every target fresh (so the sheet computes nothing real), all below the horizon unless overridden. */
    const seed = (over: Record<string, Availability>) =>
      TestBed.inject(AvailabilityService).byId.set({
        ...Object.fromEntries(TARGETS.map((t) => [t.id, av(t.id, 9, 'below-horizon')])),
        ...over,
      });

    it('shows at most three up-visible targets, brightest first, and never the Sun', async () => {
      create(false);
      seed({
        sun: av('sun', -26.7, 'up-visible'),
        venus: av('venus', -4.1, 'up-visible'),
        jupiter: av('jupiter', -2.1, 'up-visible'),
        sirius: av('sirius', -1.46, 'up-visible'),
        mars: av('mars', 1.0, 'up-visible'),
        moon: av('moon', -12, 'up-daylight'),
        neptune: av('neptune', 7.8, 'up-too-faint'),
      });
      setOpen(true);
      const chips = qa('.chip').map((c) => c.textContent!.replace(/\s+/g, ' ').trim());
      expect(chips).toHaveLength(3);
      expect(chips[0]).toContain('Venus');
      expect(chips[1]).toContain('Jupiter');
      expect(chips[2]).toContain('Sirius');
    });

    it('is hidden when nothing is up and visible, and while searching', async () => {
      create(false);
      seed({});
      setOpen(true);
      expect(qa('h3').some((h) => h.textContent!.includes('Best right now'))).toBe(false);
      seed({ venus: av('venus', -4, 'up-visible') });
      fixture.detectChanges();
      expect(qa('h3').some((h) => h.textContent!.includes('Best right now'))).toBe(true);
      const input = q<HTMLInputElement>('input.search')!;
      input.value = 'ven';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(qa('h3').some((h) => h.textContent!.includes('Best right now'))).toBe(false);
    });

    it('a satellite is in it only when overhead and visible ("look fast"), brightest first', () => {
      create(false);
      seed({
        iss: av('iss', -3.5, 'up-visible'), // overhead now and visible
        tiangong: av('tiangong', -1.5, 'up-daylight'), // overhead but not visible
        hubble: av('hubble', 1.5, 'below-horizon'),
        mars: av('mars', 1.0, 'up-visible'),
      });
      setOpen(true);
      const chips = qa('.chip').map((c) => c.textContent!.replace(/\s+/g, ' ').trim());
      expect(chips).toHaveLength(2);
      expect(chips[0]).toContain('ISS');
      expect(chips[1]).toContain('Mars');
    });

    it('analytics: a chip reports from "best-now", a row from "picker" (only target and from)', async () => {
      create(false);
      seed({ venus: av('venus', -4, 'up-visible') });
      setOpen(true);
      qa('.chip')[0].click();
      expect(sent).toEqual([
        { name: 'target_selected', props: { target: 'venus', from: 'best-now' } },
      ]);
      sent.length = 0;
      setOpen(true);
      rowFor('Jupiter').click();
      expect(sent).toEqual([
        { name: 'target_selected', props: { target: 'jupiter', from: 'picker' } },
      ]);
    });

    it('a chip selects its target', () => {
      create(false);
      seed({ venus: av('venus', -4, 'up-visible') });
      setOpen(true);
      qa('.chip')[0].click();
      expect(TestBed.inject(TargetSelectionService).selectedId()).toBe('venus');
      expect(closed).toBe(1);
    });
  });

  describe('Satellites section', () => {
    const gpCalls = () =>
      (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter(
        (c) => String(c[0]) === '/api/gp',
      );

    it('asks for orbit data the first time it renders, and not before the sheet opens', async () => {
      create(false);
      await settle();
      expect(gpCalls()).toHaveLength(0);
      setOpen(true);
      await settle();
      expect(gpCalls()).toHaveLength(1);
      setOpen(false);
      setOpen(true);
      await settle();
      expect(gpCalls()).toHaveLength(1); // memory copy is fresh
    });

    it('shows skeletons until the data arrives, then a pass label per satellite', async () => {
      create();
      expect(rowFor('International Space Station').querySelector('.skeleton')).not.toBeNull();
      await settle();
      await settle();
      for (const name of ['International Space Station', 'Tiangong', 'Hubble']) {
        const status = rowFor(name).querySelector('.status')!.textContent!;
        expect(status, name).toMatch(/^(Overhead now|Visible pass|No visible passes today)/);
      }
    });

    it('on total failure the rows say "Orbit data unavailable"', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('nope', { status: 500 })),
      );
      create();
      await settle();
      await settle();
      for (const name of ['International Space Station', 'Tiangong', 'Hubble']) {
        expect(rowFor(name).querySelector('.status')!.textContent).toBe('Orbit data unavailable');
      }
      // Non-satellite rows are unaffected.
      expect(rowFor('Jupiter').querySelector('.status')).not.toBeNull();
    });

    it('a satellite is never in "Best right now" unless it is overhead and visible', async () => {
      create();
      await settle();
      await settle();
      const best = qa('.chips .chip').map((c) => c.textContent!.trim());
      const isOverheadVisible = (id: string) =>
        TestBed.inject(AvailabilityService).byId()[id]?.visibleNow === true;
      for (const [id, short] of [
        ['iss', 'ISS'],
        ['tiangong', 'Tiangong'],
        ['hubble', 'Hubble'],
      ]) {
        if (!isOverheadVisible(id)) expect(best.some((b) => b.includes(short))).toBe(false);
      }
    });
  });
});
