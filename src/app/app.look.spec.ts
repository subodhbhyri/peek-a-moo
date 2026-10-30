import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { App } from './app';
import { ANALYTICS_SINK } from './core/analytics/analytics.service';
import { SkyEngineService } from './core/engine/sky-engine.service';
import { LocationService } from './core/sensors/location.service';
import { TargetSelectionService } from './core/targets/target-selection.service';

// Each test bootstraps the whole App, and the first one in a file pays the cold start: slow on a loaded or
// 2-core CI machine. A per-file allowance (the global default stays 5 s).
vi.setConfig({ testTimeout: 15_000 });

const POS = { latitude: 39.6, longitude: -104.7, heightM: 1800 };

describe('App: info cards and Look Around', () => {
  let sent: { name: string; props: Record<string, unknown> }[];

  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    history.replaceState(null, '', '/');
    localStorage.clear();
  });

  async function render(search = '') {
    sent = [];
    history.replaceState(null, '', '/' + search);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ANALYTICS_SINK,
          useValue: (name: string, props: Record<string, unknown>) => sent.push({ name, props }),
        },
      ],
    });
    TestBed.inject(LocationService).setManual(POS);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const openPicker = async () => {
      el.querySelector<HTMLButtonElement>('.target-chip')!.click();
      await settle();
    };
    return { fixture, el, settle, openPicker };
  }
  const named = (n: string) => sent.filter((s) => s.name === n).map((s) => s.props);

  it("an (i) on each picker row opens that target's card without selecting it", async () => {
    const { el, settle, openPicker } = await render();
    await openPicker();
    const btn = el.querySelector<HTMLButtonElement>('.info-btn[aria-label="About Jupiter"]')!;
    expect(btn).not.toBeNull();
    // The 22 targets, plus the 22 prominent constellations (Phase 10).
    expect(el.querySelectorAll('.info-btn').length).toBe(22 + 22);
    btn.click();
    await settle();
    expect(el.querySelector('[aria-label="About Jupiter"][role=dialog]')).not.toBeNull();
    expect(TestBed.inject(TargetSelectionService).selectedId()).toBe('moon');
    expect(named('target_info_opened')).toEqual([{ target: 'jupiter', from: 'picker' }]);
    // The picker is still open underneath.
    expect(el.querySelector('[aria-label="Pick something to find"]')).not.toBeNull();
  });

  it('"Find it" selects the target, closes the card and the picker, and returns to find mode', async () => {
    const { el, settle, openPicker } = await render();
    TestBed.inject(SkyEngineService).setMode('look');
    await openPicker();
    el.querySelector<HTMLButtonElement>('.info-btn[aria-label="About Saturn"]')!.click();
    await settle();
    el.querySelector<HTMLButtonElement>('[aria-label="About Saturn"] .pill.primary')!.click();
    await settle();
    expect(TestBed.inject(TargetSelectionService).selectedId()).toBe('saturn');
    expect(TestBed.inject(SkyEngineService).mode()).toBe('find');
    expect(el.querySelector('[role=dialog]')).toBeNull();
    // Tapping Find it is a selection, reported as from "info" (after the one for the first target).
    expect(named('target_selected')).toEqual([
      { target: 'moon', from: 'default' },
      { target: 'saturn', from: 'info' },
    ]);
  });

  it('the Look Around item is at the top of the picker; choosing it enters the mode', async () => {
    const { el, settle, openPicker } = await render();
    await openPicker();
    const first = el.querySelector('.scroll')!.firstElementChild as HTMLElement;
    expect(first.classList.contains('look-around')).toBe(true);
    expect(first.textContent).toContain('Look Around');
    expect(first.textContent).toContain('See everything at once');
    first.click();
    await settle();
    expect(TestBed.inject(SkyEngineService).mode()).toBe('look');
    expect(TestBed.inject(SkyEngineService).trackerPaused()).toBe(true);
    expect(el.querySelector('[role=dialog]')).toBeNull();
    expect(named('look_around_opened')).toEqual([{ from: 'picker' }]);
    // The chip says so, and the find intro is gone.
    expect(el.querySelector('.target-chip')!.textContent).toContain('Look Around');
    expect(el.querySelector('.intro')).toBeNull();
  });

  it('picking any target in the picker leaves Look Around for find mode', async () => {
    const { el, settle, openPicker } = await render();
    TestBed.inject(SkyEngineService).setMode('look');
    await settle();
    await openPicker();
    expect(el.querySelector('.look-around .check')).not.toBeNull();
    const row = Array.from(el.querySelectorAll<HTMLElement>('.row')).find((r) =>
      r.textContent!.includes('Jupiter'),
    )!;
    row.click();
    await settle();
    expect(TestBed.inject(SkyEngineService).mode()).toBe('find');
    expect(TestBed.inject(TargetSelectionService).selectedId()).toBe('jupiter');
    expect(el.querySelector('.target-chip')!.textContent).toContain('Jupiter');
    expect(localStorage.getItem('ptm.mode')).toBe('find');
  });

  it("the found toast has an (i) that opens that target's card", async () => {
    const { fixture, el, settle } = await render('?target=jupiter');
    TestBed.tick();
    TestBed.inject(SkyEngineService).events$.next({
      type: 'found',
      targetId: 'jupiter',
      durationMs: 4000,
      findIndex: 1,
    });
    fixture.detectChanges();
    const about = el.querySelector<HTMLButtonElement>('.about[aria-label="About Jupiter"]')!;
    expect(about).not.toBeNull();
    about.click();
    await settle();
    expect(el.querySelector('[aria-label="About Jupiter"][role=dialog]')).not.toBeNull();
    expect(named('target_info_opened')).toEqual([{ target: 'jupiter', from: 'found' }]);
  });

  it('the Sun banner shows in Look Around only while the Sun is near the center; the camera toggle stays usable', async () => {
    const { el, settle } = await render();
    const engine = TestBed.inject(SkyEngineService);
    engine.setMode('look');
    await settle();
    expect(el.querySelector('.sun-banner')).toBeNull();
    engine.lookSunNearCenter.set(true);
    await settle();
    expect(el.querySelector('.sun-banner')!.textContent).toContain('Never look at the Sun');
    const camera = el.querySelector<HTMLButtonElement>('.camera-toggle')!;
    expect(camera.getAttribute('aria-disabled')).toBe('false');
    engine.lookSunNearCenter.set(false);
    await settle();
    expect(el.querySelector('.sun-banner')).toBeNull();
  });

  it('the Sun as the selected target does not trigger the banner or lock the camera in Look Around', async () => {
    const { el, settle } = await render('?target=sun');
    expect(el.querySelector('.sun-banner')).not.toBeNull();
    TestBed.inject(SkyEngineService).setMode('look');
    await settle();
    expect(el.querySelector('.sun-banner')).toBeNull();
    expect(el.querySelector('.camera-toggle')!.getAttribute('aria-disabled')).toBe('false');
  });

  it('the sight-alignment button is hidden in Look Around', async () => {
    const { el, settle } = await render();
    TestBed.inject(SkyEngineService).setMode('look');
    await settle();
    expect(el.querySelector('.align-button')).toBeNull();
  });

  it('startup analytics: ?mode=look reports "link", a remembered look mode "restored", ?target= alone nothing', async () => {
    await render('?mode=look');
    expect(named('look_around_opened')).toEqual([{ from: 'link' }]);
    localStorage.setItem('ptm.mode', 'look');
    await render('');
    expect(named('look_around_opened')).toEqual([{ from: 'restored' }]);
    await render('?target=jupiter');
    expect(named('look_around_opened')).toEqual([]);
    expect(TestBed.inject(SkyEngineService).mode()).toBe('find');
  });
});
