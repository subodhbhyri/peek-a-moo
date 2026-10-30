import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import citiesJson from '../../public/data/cities.json';
import { App } from './app';
import { SkyEngineService } from './core/engine/sky-engine.service';
import { LocationService } from './core/sensors/location.service';

// Each test bootstraps the whole App, and the first one in a file pays the cold start: slow on a loaded or
// 2-core CI machine. A per-file allowance (the global default stays 5 s).
vi.setConfig({ testTimeout: 15_000 });

const original = Object.getOwnPropertyDescriptor(navigator, 'geolocation');

function stubGeolocation(kind: 'denied' | 'granted') {
  const geo = {
    getCurrentPosition: (
      ok: (p: GeolocationPosition) => void,
      fail: (e: GeolocationPositionError) => void,
    ) => {
      if (kind === 'granted') {
        ok({ coords: { latitude: 51.5, longitude: -0.12, altitude: 0 } } as GeolocationPosition);
      } else {
        fail({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError);
      }
    },
  };
  Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
}

describe('App: location without GPS', () => {
  beforeEach(() => {
    localStorage.clear();
    history.replaceState(null, '', '/');
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
      vi.fn(async (url: string) =>
        url === '/data/cities.json'
          ? new Response(JSON.stringify(citiesJson), { status: 200 })
          : new Response('nope', { status: 404 }),
      ),
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    if (original) Object.defineProperty(navigator, 'geolocation', original);
    else delete (navigator as unknown as Record<string, unknown>)['geolocation'];
  });

  async function render(zone: string | undefined, geo: 'denied' | 'granted' = 'denied') {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      timeZone: zone,
    } as Intl.ResolvedDateTimeFormatOptions);
    stubGeolocation(geo);
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    // The (mocked) geolocation answers asynchronously, like the real one: wait for the answer itself.
    await vi.waitFor(
      () => {
        fixture.detectChanges();
        expect(TestBed.inject(LocationService).status()).not.toBe('pending');
      },
      { timeout: 10_000, interval: 10 },
    );
    const el = fixture.nativeElement as HTMLElement;
    const chip = () => el.querySelector<HTMLButtonElement>('.location-control .chip');
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };
    return { fixture, el, chip, settle };
  }

  it('geolocation denied and time zone Asia/Dubai: starts at once with the Dubai area and a "Change" chip', async () => {
    const { chip } = await render('Asia/Dubai');
    const loc = TestBed.inject(LocationService);
    expect(loc.status()).toBe('denied');
    expect(loc.source()).toBe('timezone');
    expect(loc.position()!.latitude).toBeCloseTo(25.3, 0);
    expect(loc.position()!.longitude).toBeCloseTo(55.3, 0);
    expect(chip()!.textContent!.trim()).toBe('Using Dubai area (from your time zone) · Change');
    // The engine already has something to show: no blocking screen, no dead end.
    TestBed.tick();
    expect(TestBed.inject(SkyEngineService).target()).not.toBeNull();
  });

  it('the chip opens the city picker; picking Abu Dhabi changes the location, shows it in the chip and remembers it', async () => {
    const { el, chip, settle } = await render('Asia/Dubai');
    chip()!.click();
    await settle();
    const search = el.querySelector<HTMLInputElement>('input[aria-label="Search cities"]')!;
    expect(search).not.toBeNull();
    await vi.waitFor(() => expect(true).toBe(true));
    search.value = 'abu dhabi';
    search.dispatchEvent(new Event('input'));
    await vi.waitFor(async () => {
      await settle();
      expect(el.querySelector('.panel li button')?.textContent?.trim()).toBe('Abu Dhabi, UAE');
    });
    el.querySelector<HTMLButtonElement>('.panel li button')!.click();
    await settle();
    const loc = TestBed.inject(LocationService);
    expect(loc.source()).toBe('manual');
    expect(loc.position()!.latitude).toBeCloseTo(24.45, 1);
    expect(chip()!.textContent!.trim()).toBe('Abu Dhabi, UAE · Change');
    expect(el.querySelector('.panel')).toBeNull();
    expect(JSON.parse(localStorage.getItem('ptm.location')!).label).toBe('Abu Dhabi, UAE');
  });

  it('a returning visitor with a saved choice is not asked again, even with GPS denied', async () => {
    localStorage.setItem(
      'ptm.location',
      JSON.stringify({ lat: 24.45, lon: 54.38, label: 'Abu Dhabi, UAE' }),
    );
    const { chip } = await render('Asia/Kolkata');
    expect(chip()!.textContent!.trim()).toBe('Abu Dhabi, UAE · Change');
  });

  it('"zzzz" then Enter coordinates with 24.45, 54.38 works end to end', async () => {
    const { el, chip, settle } = await render(undefined);
    expect(chip()!.textContent!.trim()).toBe('Set location'); // no zone, no saved city: ask
    chip()!.click();
    await settle();
    const search = el.querySelector<HTMLInputElement>('input[aria-label="Search cities"]')!;
    search.value = 'zzzz';
    search.dispatchEvent(new Event('input'));
    await settle();
    expect(el.querySelector('.help')!.textContent).toContain('A nearby city works fine');
    Array.from(el.querySelectorAll<HTMLButtonElement>('.help .action'))
      .find((b) => b.textContent!.includes('Enter coordinates'))!
      .click();
    await settle();
    const lat = el.querySelector<HTMLInputElement>('#loc-lat')!;
    const lon = el.querySelector<HTMLInputElement>('#loc-lon')!;
    lat.value = '24.45, 54.38'; // pasted as a pair
    lat.dispatchEvent(new Event('input'));
    await settle();
    expect(lon.value).toBe('54.38');
    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(
      new Event('submit', { cancelable: true }),
    );
    await settle();
    expect(chip()!.textContent!.trim()).toBe('24.45°, 54.38° · Change');
    expect(TestBed.inject(LocationService).position()!.longitude).toBe(54.38);
  });

  it('UTC counts as no zone: the picker is offered, never a blocking screen', async () => {
    const { el, chip } = await render('Etc/UTC');
    expect(TestBed.inject(LocationService).position()).toBeNull();
    expect(chip()!.textContent!.trim()).toBe('Set location');
    expect(el.querySelector('.intro')).not.toBeNull(); // the app itself is still there
  });

  it('GPS granted: no location chip at all', async () => {
    const { chip } = await render('Asia/Dubai', 'granted');
    expect(TestBed.inject(LocationService).source()).toBe('gps');
    expect(chip()).toBeNull();
  });
});
