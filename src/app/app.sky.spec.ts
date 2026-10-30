import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { App } from './app';
import { ANALYTICS_SINK } from './core/analytics/analytics.service';
import { SkyEngineService } from './core/engine/sky-engine.service';
import { GP_FIXTURE } from './core/gp/testing/gp-fixture';
import { NIGHT_STORAGE_KEY, NIGHT_THEME_COLOR } from './core/night/night-mode.service';
import { LocationService } from './core/sensors/location.service';
import { OrientationService } from './core/sensors/orientation.service';
import { SKY_URL, SkyDataService } from './core/sky/sky-data.service';
import { SKY_FILE } from './core/sky/testing/sky-fixture';

// Each test bootstraps the whole App, and the first one in a file pays the cold start: slow on a loaded or
// 2-core CI machine. A per-file allowance (the global default stays 5 s).
vi.setConfig({ testTimeout: 15_000 });

const POS = { latitude: 39.6, longitude: -104.7, heightM: 1800 };
const setUrl = (search: string) => history.replaceState(null, '', '/' + search);

describe('App: the star map and red night mode', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let sent: { name: string; props: Record<string, unknown> }[];
  let skyResponse: () => Promise<Response>;
  interface FakeObserver {
    observed: Element[];
    fire(isIntersecting?: boolean): void;
    disconnect: ReturnType<typeof vi.fn>;
  }
  let observers: FakeObserver[];

  beforeEach(() => {
    localStorage.clear();
    sent = [];
    skyResponse = async () => new Response(JSON.stringify(SKY_FILE), { status: 200 });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );
    observers = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observed: Element[] = [];
        constructor(private cb: (e: { isIntersecting: boolean }[]) => void) {
          observers.push(this as unknown as FakeObserver);
        }
        observe(el: Element) {
          this.observed.push(el);
        }
        unobserve = vi.fn();
        disconnect = vi.fn();
        fire(isIntersecting = true) {
          this.cb([{ isIntersecting }]);
        }
      },
    );
    fetchMock = vi.fn(async (url: string) =>
      url === SKY_URL
        ? skyResponse()
        : url === '/api/gp'
          ? new Response(JSON.stringify({ ...GP_FIXTURE, fetchedAt: new Date().toISOString() }), {
              status: 200,
            })
          : new Response('nope', { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setUrl('');
    localStorage.clear();
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  });

  const skyCalls = () => fetchMock.mock.calls.filter((c) => c[0] === SKY_URL).length;

  async function render(search = '') {
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
    setUrl(search);
    const fixture = TestBed.createComponent(App);
    // One macrotask and a change-detection pass. Deliberately not fixture.whenStable(): on a starved CI
    // machine it can wait for every chunked availability timer, and it says nothing about the condition
    // a test actually needs (use `until` for that).
    const settle = async () => {
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();
    };
    // Wait for a real condition, never for a number of ticks: the mocked Response body is read on a later
    // macrotask, which a slow 2-core CI runner reaches much later than a fast laptop.
    const until = (condition: () => unknown) =>
      vi.waitFor(
        () => {
          fixture.detectChanges();
          expect(condition()).toBeTruthy();
        },
        { timeout: 10_000, interval: 10 },
      );
    await settle();
    return { fixture, el: fixture.nativeElement as HTMLElement, settle, until };
  }

  describe('never fetched at app start', () => {
    it('not for the Moon, a planet, a star, a deep-sky object or a satellite', async () => {
      for (const id of ['moon', 'jupiter', 'sirius', 'm31', 'iss']) {
        fetchMock.mockClear();
        await render(`?target=${id}`);
        expect(skyCalls(), id).toBe(0);
      }
    });

    it('nor when the picker opens: the Constellations section is only observed, and an observer that has not fired (or fires while it is not visible) fetches nothing', async () => {
      const { el, settle, until } = await render();
      el.querySelector<HTMLButtonElement>('.intro .link')!.click();
      await until(() => el.querySelector('[role=dialog]') && observers.length > 0);
      expect(el.querySelector('[role=dialog]')).not.toBeNull();
      expect(skyCalls()).toBe(0);
      const orion = Array.from(el.querySelectorAll<HTMLElement>('.row')).find(
        (r) => r.querySelector('.name')?.firstChild?.textContent?.trim() === 'Orion',
      )!;
      expect(orion.querySelector('.blurb')?.textContent).toBe('The Hunter.');
      expect(orion.querySelector('.skeleton')).toBeNull();
      const section = el.querySelector('section[data-category="constellations"]');
      expect(observers.flatMap((o) => o.observed)).toEqual([section]);
      observers[0].fire(false);
      await settle();
      expect(skyCalls()).toBe(0);
    });

    it('nor when an info card opens for anything that is not a constellation', async () => {
      const { el, until } = await render();
      el.querySelector<HTMLButtonElement>('.intro .link')!.click();
      await until(() => el.querySelector('[role=dialog]') && observers.length > 0);
      for (const name of ['Jupiter', 'Sirius', 'Andromeda Galaxy']) {
        const card = `[aria-label="About ${name}"][role=dialog]`;
        el.querySelector<HTMLButtonElement>(`.info-btn[aria-label="About ${name}"]`)!.click();
        await until(() => el.querySelector(card));
        el.querySelector<HTMLButtonElement>('[aria-label^="About"] .pill:not(.primary)')!.click();
        await until(() => !el.querySelector(card));
      }
      expect(skyCalls()).toBe(0);
    });
  });

  describe('fetched exactly when asked for', () => {
    it('the picker fetches it once, when its Constellations section first scrolls into view', async () => {
      const { el, settle, until } = await render();
      el.querySelector<HTMLButtonElement>('.intro .link')!.click();
      await until(() => el.querySelector('[role=dialog]') && observers.length > 0);
      expect(skyCalls()).toBe(0);
      observers[0].fire(true);
      await until(() => TestBed.inject(SkyDataService).status() === 'ready');
      expect(skyCalls()).toBe(1);
      // The rows now show a status instead of the blurb.
      await until(() => !el.querySelector('section[data-category="constellations"] .blurb'));
      expect(observers[0].disconnect).toHaveBeenCalled();
      // A second scroll cannot fetch again, even from a fresh observer.
      observers.at(-1)!.fire(true);
      await settle();
      await new Promise((r) => setTimeout(r, 20)); // room for a (wrongly) second request to start
      expect(skyCalls()).toBe(1);
    });

    it('a constellation info card fetches it once; closing and reopening does not fetch again', async () => {
      const { el, until } = await render();
      el.querySelector<HTMLButtonElement>('.intro .link')!.click();
      await until(() => el.querySelector('[role=dialog]') && observers.length > 0);
      el.querySelector<HTMLButtonElement>('.info-btn[aria-label="About Orion"]')!.click();
      await until(() => skyCalls() >= 1);
      await until(() => TestBed.inject(SkyDataService).status() === 'ready');
      expect(skyCalls()).toBe(1);
      // The live row is filled in now that the map is here.
      await until(() => el.querySelector('[aria-label="About Orion"] .stat dd'));
      const rows = Array.from(el.querySelectorAll('[aria-label="About Orion"] .stat dd')).map((d) =>
        d.textContent?.trim(),
      );
      expect(rows).toHaveLength(1);
      expect(['Up from here', 'Partly up', 'Below the horizon']).toContain(rows[0]);
      el.querySelector<HTMLButtonElement>('[aria-label^="About"] .pill:not(.primary)')!.click();
      await until(() => !el.querySelector('[aria-label="About Orion"][role=dialog]'));
      el.querySelector<HTMLButtonElement>('.info-btn[aria-label="About Orion"]')!.click();
      await until(() => el.querySelector('[aria-label="About Orion"][role=dialog]'));
      await new Promise((r) => setTimeout(r, 20)); // room for a (wrongly) second request to start
      expect(skyCalls()).toBe(1);
    });

    it('selecting a constellation (?target=orion) fetches it once, and the target appears', async () => {
      const { el, until } = await render('?target=orion');
      await until(() => TestBed.inject(SkyDataService).status() === 'ready');
      await until(() => TestBed.inject(SkyEngineService).target()?.id === 'orion');
      await until(() => !el.querySelector('.orbit-status'));
      expect(skyCalls()).toBe(1);
      expect(el.querySelector('.intro h1')?.textContent).toContain('Find Orion.');
    });

    it('says "Getting the star map…" while it loads and "Star map unavailable" if it cannot', async () => {
      let release!: (r: Response) => void;
      skyResponse = () => new Promise<Response>((r) => (release = r));
      const { el, until } = await render('?target=orion');
      await until(() => release); // the request has started
      const status = () => el.querySelector('.orbit-status')?.textContent?.trim();
      await until(() => status() === 'Getting the star map…');
      release(new Response('nope', { status: 404 }));
      await until(() => status() === 'Star map unavailable');
      // Nothing else breaks: the picker still opens and another target can be chosen.
      expect(TestBed.inject(SkyDataService).status()).toBe('unavailable');
      expect(TestBed.inject(SkyEngineService).target()).toBeNull();
    });

    it('starting Look Around (?mode=look) fetches it once, and Look Around has the star field', async () => {
      const { until } = await render('?mode=look');
      await until(() => TestBed.inject(SkyDataService).geometry() !== null);
      expect(skyCalls()).toBe(1);
    });

    it('choosing Look Around from the picker fetches it', async () => {
      const { el, until } = await render();
      el.querySelector<HTMLButtonElement>('.intro .link')!.click();
      await until(() => el.querySelector('[role=dialog]') && observers.length > 0);
      expect(skyCalls()).toBe(0);
      el.querySelector<HTMLButtonElement>('.look-around')!.click();
      await until(() => TestBed.inject(SkyDataService).geometry() !== null);
      expect(skyCalls()).toBe(1);
    });

    it('if the map cannot be loaded, Look Around still works without stars or constellations', async () => {
      skyResponse = async () => new Response('nope', { status: 500 });
      const { until } = await render('?mode=look');
      await until(() => TestBed.inject(SkyDataService).status() === 'unavailable');
      const engine = TestBed.inject(SkyEngineService);
      TestBed.inject(OrientationService).setManualPose(180, 30);
      const frame = engine.tickLook(0, { width: 390, height: 844, vFovDeg: 62 });
      expect(frame).not.toBeNull();
      expect(frame!.items.length).toBeGreaterThan(10);
      expect(frame!.sky).toBeUndefined();
      expect(skyCalls()).toBe(1); // no retry storm
    });
  });

  describe('Look Around: Constellations toggle', () => {
    it('is a chip with aria-pressed, on by default, persisted, and reported', async () => {
      const { el, settle } = await render('?mode=look');
      const chip = () => el.querySelector<HTMLButtonElement>('.constellations-chip')!;
      expect(chip().textContent?.trim()).toBe('Constellations');
      expect(chip().getAttribute('aria-pressed')).toBe('true');
      chip().click();
      await settle();
      expect(chip().getAttribute('aria-pressed')).toBe('false');
      expect(localStorage.getItem('ptm.constellations')).toBe('off');
      expect(TestBed.inject(SkyEngineService).constellationsOn()).toBe(false);
      chip().click();
      await settle();
      expect(chip().getAttribute('aria-pressed')).toBe('true');
      expect(localStorage.getItem('ptm.constellations')).toBe('on');
      expect(sent.filter((s) => s.name === 'constellations_toggled').map((s) => s.props)).toEqual([
        { on: false },
        { on: true },
      ]);
    });

    it('a remembered "off" is restored, and the frame says so', async () => {
      localStorage.setItem('ptm.constellations', 'off');
      const { until } = await render('?mode=look');
      await until(() => TestBed.inject(SkyDataService).geometry() !== null);
      TestBed.inject(OrientationService).setManualPose(180, 30);
      const frame = TestBed.inject(SkyEngineService).tickLook(0, {
        width: 390,
        height: 844,
        vFovDeg: 62,
      });
      expect(frame?.constellationsOn).toBe(false);
      expect(frame?.sky).toBeDefined(); // the background stars stay
    });

    it('is only offered in Look Around', async () => {
      const { el } = await render();
      expect(el.querySelector('.constellations-chip')).toBeNull();
    });
  });

  describe('red night mode', () => {
    const toggle = (el: HTMLElement) =>
      el.querySelector<HTMLButtonElement>('button[aria-label="Red night mode"]')!;
    const cssRule = (selector: string) => {
      const css = Array.from(document.querySelectorAll('style'))
        .map((s) => s.textContent ?? '')
        .join('\n');
      const m = new RegExp(`${selector.replace('.', '\\.')}[^{]*\\{([^}]*)\\}`).exec(css);
      return m?.[1] ?? '';
    };

    it('has a toggle button with aria-label and aria-pressed, off by default', async () => {
      const { el } = await render();
      expect(toggle(el)).not.toBeNull();
      expect(toggle(el).getAttribute('aria-pressed')).toBe('false');
      expect(el.querySelector('app-night-overlay')).toBeNull();
    });

    it('turning it on shows the overlay, persists, reports it, and sets theme-color to black', async () => {
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.content = '#030303';
      document.head.appendChild(meta);
      const { el, fixture, settle } = await render();
      toggle(el).click();
      await settle();
      expect(toggle(el).getAttribute('aria-pressed')).toBe('true');
      expect(el.querySelector('app-night-overlay')).not.toBeNull();
      expect(localStorage.getItem(NIGHT_STORAGE_KEY)).toBe('on');
      expect(meta.content).toBe(NIGHT_THEME_COLOR);
      expect(NIGHT_THEME_COLOR).toBe('#000000');
      expect((fixture.nativeElement as HTMLElement).classList.contains('night')).toBe(true);
      toggle(el).click();
      await settle();
      expect(el.querySelector('app-night-overlay')).toBeNull();
      expect(localStorage.getItem(NIGHT_STORAGE_KEY)).toBe('off');
      expect(meta.content).toBe('#030303');
      expect(sent.filter((s) => s.name === 'night_mode_toggled').map((s) => s.props)).toEqual([
        { on: true },
        { on: false },
      ]);
    });

    it('the "n" key toggles it, except while typing in a field', async () => {
      const { el, settle } = await render();
      const press = (target: EventTarget) =>
        target.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }));
      press(document.body);
      await settle();
      expect(toggle(el).getAttribute('aria-pressed')).toBe('true');
      const input = document.createElement('input');
      document.body.appendChild(input);
      press(input);
      await settle();
      expect(toggle(el).getAttribute('aria-pressed')).toBe('true'); // unchanged
      input.remove();
      press(document.body);
      await settle();
      expect(toggle(el).getAttribute('aria-pressed')).toBe('false');
    });

    it('is restored from storage', async () => {
      localStorage.setItem(NIGHT_STORAGE_KEY, 'on');
      const { el } = await render();
      expect(toggle(el).getAttribute('aria-pressed')).toBe('true');
      expect(el.querySelector('app-night-overlay')).not.toBeNull();
    });

    it('the overlay is a red multiply filter above all UI that lets every click through', async () => {
      localStorage.setItem(NIGHT_STORAGE_KEY, 'on');
      await render();
      // The overlay component's own host rule (the only one with a blend mode).
      const css = Array.from(document.querySelectorAll('style'))
        .map((s) => s.textContent ?? '')
        .join('\n');
      const rule = /\{[^{}]*mix-blend-mode[^{}]*\}/.exec(css)?.[0] ?? '';
      expect(rule).toMatch(/pointer-events:\s*none/);
      expect(rule).toMatch(/mix-blend-mode:\s*multiply/);
      expect(rule).toMatch(/position:\s*fixed/);
      expect(rule).toMatch(/inset:\s*0/);
      const z = Number(/z-index:\s*(\d+)/.exec(rule)?.[1]);
      // Above the picker (21), the info card (31) and the other overlays.
      expect(z).toBeGreaterThan(100);
      // Only the red channel survives a multiply by this color.
      expect(/background:\s*#([0-9a-f]{2})0000/i.exec(rule)).not.toBeNull();
    });

    it('the overlay is hidden from assistive tech and not focusable, so the picker chip stays reachable', async () => {
      localStorage.setItem(NIGHT_STORAGE_KEY, 'on');
      const { el, settle } = await render();
      const overlay = el.querySelector<HTMLElement>('app-night-overlay')!;
      expect(overlay.getAttribute('aria-hidden')).toBe('true');
      expect(overlay.tabIndex).toBe(-1);
      expect(overlay.children).toHaveLength(0);
      // The target chip is still there and still opens the picker through the overlay.
      el.querySelector<HTMLButtonElement>('.target-chip')!.click();
      await settle();
      expect(el.querySelector('app-night-overlay')).not.toBeNull();
      expect(el.querySelector('[role=dialog]')).not.toBeNull();
    });

    it('the Sun safety banner sits above the filter in pure red and black, so it stays clearly readable', async () => {
      localStorage.setItem(NIGHT_STORAGE_KEY, 'on');
      const { el } = await render('?target=sun');
      const rule = cssRule(':host(.night) .sun-banner');
      const banner =
        rule ||
        Array.from(document.querySelectorAll('style'))
          .map((s) => s.textContent)
          .join('\n');
      expect(banner).toMatch(/\.night[^{]*\.sun-banner[^{]*\{[^}]*z-index:\s*1001/);
      expect(banner).toMatch(/\.night[^{]*\.sun-banner[^{]*\{[^}]*background:\s*#ff0000/);
      expect(banner).toMatch(/\.night[^{]*\.sun-banner[^{]*\{[^}]*color:\s*#000/);
      const sunBanner = el.querySelector('.sun-banner');
      expect(sunBanner).not.toBeNull();
      expect(sunBanner?.textContent).toContain('Never look at the Sun');
      expect(sunBanner?.getAttribute('role')).toBe('alert');
    });
  });
});
