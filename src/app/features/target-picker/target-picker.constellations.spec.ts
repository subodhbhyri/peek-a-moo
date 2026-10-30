import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ANALYTICS_SINK } from '../../core/analytics/analytics.service';
import { GP_FIXTURE } from '../../core/gp/testing/gp-fixture';
import { LocationService } from '../../core/sensors/location.service';
import { SKY_URL, SkyDataService } from '../../core/sky/sky-data.service';
import { skyGeometry } from '../../core/sky/testing/sky-fixture';
import type { Availability } from '../../core/targets/availability';
import { AvailabilityService } from '../../core/targets/availability.service';
import { TARGETS } from '../../core/targets/catalog';
import { TargetSelectionService } from '../../core/targets/target-selection.service';
import { TargetPicker } from './target-picker';

const CLOCK = new Date('2026-12-15T04:00:00Z');
const POS = { latitude: 39.6, longitude: -104.7, heightM: 1800 };

describe('TargetPicker: Constellations (Phase 10)', () => {
  let fixture: ComponentFixture<TargetPicker>;
  let fetchMock: ReturnType<typeof vi.fn>;
  let sent: { name: string; props: Record<string, unknown> }[];
  const el = () => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement>(sel: string) => el().querySelector<T>(sel);
  const qa = (sel: string) => Array.from(el().querySelectorAll<HTMLElement>(sel));
  const section = (title: string) =>
    qa('section').find((s) => s.querySelector('h3')?.textContent?.trim() === title)!;
  const rowNames = (s: HTMLElement) =>
    Array.from(s.querySelectorAll('.row .name')).map(
      (n) => n.firstChild?.textContent?.trim() ?? '',
    );

  async function settle() {
    await vi.runAllTimersAsync();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  function create() {
    fixture = TestBed.createComponent(TargetPicker);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
  }
  const type = (text: string) => {
    const input = q<HTMLInputElement>('.search')!;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

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
    vi.setSystemTime(CLOCK);
    fetchMock = vi.fn(
      async (url: string) =>
        new Response(
          url === SKY_URL
            ? 'nope'
            : JSON.stringify({
                ...GP_FIXTURE,
                fetchedAt: new Date(CLOCK.getTime() - 600_000).toISOString(),
              }),
          { status: url === SKY_URL ? 404 : 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
    history.replaceState(null, '', '/');
    TestBed.inject(LocationService).setManual(POS);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('the Constellations section comes after Satellites and starts with the 22 prominent ones, rank 1 alphabetical', async () => {
    create();
    await settle();
    const titles = qa('h3').map((h) => h.textContent!.trim());
    expect(titles.indexOf('Constellations')).toBe(titles.indexOf('Satellites') + 1);
    const names = rowNames(section('Constellations'));
    expect(names).toHaveLength(22);
    expect(names[0]).toBe('Andromeda');
    expect(names).toContain('Orion');
    expect(names).toContain('Ursa Major');
    expect(names).not.toContain('Crux'); // rank 2
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
  });

  it('"Show all 88" reveals every constellation (rank 1 first, then 2, then 3) and "Show fewer" collapses again', async () => {
    create();
    await settle();
    const toggle = () => section('Constellations').querySelector<HTMLButtonElement>('.show-all')!;
    expect(toggle().textContent?.trim()).toBe('Show all 88');
    toggle().click();
    fixture.detectChanges();
    await settle();
    const names = rowNames(section('Constellations'));
    expect(names).toHaveLength(88);
    expect(names.slice(0, 22)).toContain('Orion');
    expect(names.slice(22, 46)).toContain('Crux'); // rank 2 block
    expect(toggle().textContent?.trim()).toBe('Show fewer');
    toggle().click();
    fixture.detectChanges();
    expect(rowNames(section('Constellations'))).toHaveLength(22);
  });

  it('search always covers all 88, by Latin and English name: "great bear" finds Ursa Major', async () => {
    create();
    await settle();
    type('great bear');
    expect(rowNames(section('Constellations'))).toEqual(['Ursa Major']);
    type('little bear');
    expect(rowNames(section('Constellations'))).toEqual(['Ursa Minor']);
    type('ursa');
    expect(rowNames(section('Constellations'))).toEqual(['Ursa Major', 'Ursa Minor']);
    type('hunter');
    expect(rowNames(section('Constellations'))).toEqual(['Orion']);
    // A rank-3 constellation is found even though the list is collapsed.
    type('Boötes'.toLowerCase());
    expect(rowNames(section('Constellations'))).toEqual(['Boötes']);
    type('chamaeleon');
    expect(rowNames(section('Constellations'))).toEqual(['Chamaeleon']);
    type('southern cross');
    expect(rowNames(section('Constellations'))).toEqual(['Crux']);
    // Typing the IAU abbreviation works too.
    type('uma');
    expect(rowNames(section('Constellations'))).toEqual(['Ursa Major']);
    // And there is no "Show all" button while searching.
    expect(section('Constellations').querySelector('.show-all')).toBeNull();
  });

  it('the rows say what a constellation is until the star map is loaded, with no network request', async () => {
    create();
    await settle();
    const orion = qa('.row').find(
      (r) => r.querySelector('.name')?.firstChild?.textContent?.trim() === 'Orion',
    )!;
    expect(orion.querySelector('.blurb')?.textContent).toBe('The Hunter.');
    expect(orion.querySelector('.skeleton')).toBeNull();
    expect(fetchMock.mock.calls.filter((c) => c[0] === SKY_URL)).toHaveLength(0);
  });

  it('once the star map is loaded the rows get a status: Up now / Partly up / Rises ... / Never rises', async () => {
    TestBed.inject(SkyDataService).geometry.set(skyGeometry());
    create();
    await settle();
    await settle();
    const status = (name: string) =>
      qa('.row')
        .find((r) => r.querySelector('.name')?.firstChild?.textContent?.trim() === name)!
        .querySelector('.status')
        ?.textContent?.trim();
    expect(status('Orion')).toBe('Up now');
    // Every prominent constellation row has a real status and no skeleton left.
    const rows = section('Constellations').querySelectorAll('.row');
    expect(rows).toHaveLength(22);
    for (const r of Array.from(rows))
      expect(r.querySelector('.status'), r.textContent!).not.toBeNull();
    expect(section('Constellations').querySelectorAll('.skeleton')).toHaveLength(0);
    // Searching brings in the rest, with their own statuses (Octans never rises from Denver).
    type('octans');
    await settle();
    await settle();
    expect(status('Octans')).toBe('Never rises from here');
    // A partly-up one shows up somewhere in the list as "Partly up".
    type('');
    fixture.componentInstance['showAllConstellations'].set(true);
    fixture.detectChanges();
    await settle();
    await settle();
    const labels = qa('.row .status').map((s) => s.textContent!.trim());
    expect(labels.some((l) => l === 'Partly up')).toBe(true);
  });

  it('constellations never appear in "Best right now", even when they are up and the rest are not', async () => {
    TestBed.inject(SkyDataService).geometry.set(skyGeometry());
    const av = (id: string, visibility: Availability['visibility']): Availability => ({
      targetId: id,
      computedAt: new Date(),
      altitudeDeg: 40,
      magnitude: id === 'orion' ? null : 9,
      visibility,
      low: false,
      nextRise: null,
      nextSet: null,
      alwaysUp: false,
      neverUp: false,
      neverRisesHere: false,
    });
    TestBed.inject(AvailabilityService).byId.set({
      ...Object.fromEntries(TARGETS.map((t) => [t.id, av(t.id, 'below-horizon')])),
      orion: av('orion', 'up-visible'),
      sirius: { ...av('sirius', 'up-visible'), magnitude: -1.4 },
    });
    create();
    await settle();
    const best = q('.chips');
    expect(best).not.toBeNull();
    const chips = Array.from(best!.querySelectorAll('.chip')).map((c) => c.textContent!.trim());
    expect(chips).toHaveLength(1);
    expect(chips[0]).toContain('Sirius');
    expect(best!.textContent).not.toContain('Orion');
  });

  it('choosing a constellation selects it, reports it, and closes the sheet', async () => {
    create();
    await settle();
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    const orion = qa('.row').find(
      (r) => r.querySelector('.name')?.firstChild?.textContent?.trim() === 'Orion',
    )!;
    orion.click();
    expect(TestBed.inject(TargetSelectionService).selectedId()).toBe('orion');
    expect(closed).toBe(1);
    expect(sent.filter((s) => s.name === 'target_selected').map((s) => s.props)).toContainEqual({
      target: 'orion',
      from: 'picker',
    });
  });

  it('the credits line names d3-celestial and links its license notice', async () => {
    create();
    await settle();
    const credits = q('.credits')!;
    expect(credits.textContent).toContain('d3-celestial');
    expect(credits.textContent).toContain('BSD-3-Clause');
    const hrefs = Array.from(credits.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/data/LICENSE-d3-celestial.txt');
  });
});
