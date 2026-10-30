import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { LocationService } from './location.service';

const original = Object.getOwnPropertyDescriptor(navigator, 'geolocation');

function stubTimeZone(zone: string | undefined) {
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
    timeZone: zone,
  } as Intl.ResolvedDateTimeFormatOptions);
}

function stubGeolocation(result: 'denied' | 'unavailable' | 'timeout' | 'granted' | 'missing') {
  if (result === 'missing') {
    // jsdom has none, but be explicit.
    Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true });
    delete (navigator as unknown as Record<string, unknown>)['geolocation'];
    return;
  }
  const geo = {
    getCurrentPosition: (
      ok: (p: GeolocationPosition) => void,
      fail: (e: GeolocationPositionError) => void,
    ) => {
      if (result === 'granted') {
        ok({
          coords: { latitude: 39.6123, longitude: -104.7012, altitude: 1800 },
        } as GeolocationPosition);
      } else {
        const code = result === 'denied' ? 1 : result === 'unavailable' ? 2 : 3;
        fail({ code, PERMISSION_DENIED: 1 } as GeolocationPositionError);
      }
    },
  };
  Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
}

describe('LocationService fallbacks', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    if (original) Object.defineProperty(navigator, 'geolocation', original);
    else delete (navigator as unknown as Record<string, unknown>)['geolocation'];
  });

  it('denied + Asia/Dubai: the position is the Dubai area, source "timezone", status still "denied"', async () => {
    stubGeolocation('denied');
    stubTimeZone('Asia/Dubai');
    const loc = TestBed.inject(LocationService);
    const pos = await loc.request();
    expect(pos).not.toBeNull();
    expect(loc.position()!.latitude).toBeCloseTo(25.3, 0);
    expect(loc.position()!.longitude).toBeCloseTo(55.3, 0);
    expect(loc.source()).toBe('timezone');
    expect(loc.label()).toBe('Dubai');
    expect(loc.status()).toBe('denied');
  });

  it('timeout and "position unavailable" fall back the same way', async () => {
    for (const result of ['timeout', 'unavailable'] as const) {
      TestBed.resetTestingModule();
      stubGeolocation(result);
      stubTimeZone('Asia/Dubai');
      const loc = TestBed.inject(LocationService);
      await loc.request();
      expect(loc.source(), result).toBe('timezone');
      expect(loc.status(), result).toBe('unavailable');
    }
  });

  it('no geolocation API at all falls back too', async () => {
    stubGeolocation('missing');
    stubTimeZone('America/Denver');
    const loc = TestBed.inject(LocationService);
    await loc.request();
    expect(loc.source()).toBe('timezone');
    expect(loc.label()).toBe('Denver');
    expect(loc.status()).toBe('unavailable');
  });

  it('an alias zone works: Asia/Muscat gives the Dubai area; Asia/Calcutta gives Kolkata', async () => {
    stubGeolocation('denied');
    stubTimeZone('Asia/Muscat');
    let loc = TestBed.inject(LocationService);
    await loc.request();
    expect(loc.label()).toBe('Dubai');
    TestBed.resetTestingModule();
    stubTimeZone('Asia/Calcutta');
    loc = TestBed.inject(LocationService);
    await loc.request();
    expect(loc.label()).toBe('Kolkata');
  });

  it('an unknown zone, UTC or Etc/*: no position, so the app asks for a city', async () => {
    stubGeolocation('denied');
    for (const zone of ['Etc/UTC', 'UTC', 'Etc/GMT-4', 'Nowhere/Land', undefined]) {
      TestBed.resetTestingModule();
      vi.restoreAllMocks();
      stubTimeZone(zone);
      const loc = TestBed.inject(LocationService);
      await loc.request();
      expect(loc.position(), String(zone)).toBeNull();
      expect(loc.source(), String(zone)).toBeNull();
      expect(loc.status(), String(zone)).toBe('denied');
    }
  });

  it('GPS wins when it works, and is never stored', async () => {
    stubGeolocation('granted');
    stubTimeZone('Asia/Dubai');
    const loc = TestBed.inject(LocationService);
    await loc.request();
    expect(loc.source()).toBe('gps');
    expect(loc.label()).toBeNull();
    expect(loc.position()!.latitude).toBeCloseTo(39.6123, 4);
    expect(localStorage.getItem('ptm.location')).toBeNull();
  });

  it('a saved choice beats the time zone', async () => {
    localStorage.setItem(
      'ptm.location',
      JSON.stringify({ lat: 24.45, lon: 54.38, label: 'Abu Dhabi, UAE' }),
    );
    stubGeolocation('denied');
    stubTimeZone('Asia/Kolkata');
    const loc = TestBed.inject(LocationService);
    await loc.request();
    expect(loc.source()).toBe('manual');
    expect(loc.label()).toBe('Abu Dhabi, UAE');
    expect(loc.position()!.latitude).toBe(24.45);
  });

  it('a fallback never overrides a position that is already set', async () => {
    stubGeolocation('denied');
    stubTimeZone('Asia/Dubai');
    const loc = TestBed.inject(LocationService);
    loc.setManual({ latitude: 10, longitude: 20, heightM: 0 }, 'Somewhere');
    await loc.request();
    expect(loc.position()).toEqual({ latitude: 10, longitude: 20, heightM: 0 });
    expect(loc.source()).toBe('manual');
  });

  it('chooseManual saves it rounded to 2 decimals; setManual alone does not save', () => {
    const loc = TestBed.inject(LocationService);
    loc.setManual({ latitude: 25.2048, longitude: 55.2708, heightM: 0 });
    expect(localStorage.getItem('ptm.location')).toBeNull();
    loc.chooseManual({ latitude: 25.2048, longitude: 55.2708, heightM: 0 }, 'Dubai, UAE');
    expect(JSON.parse(localStorage.getItem('ptm.location')!)).toEqual({
      lat: 25.2,
      lon: 55.27,
      label: 'Dubai, UAE',
    });
    expect(loc.status()).toBe('manual');
    expect(loc.source()).toBe('manual');
    // The position in use is exactly what was chosen.
    expect(loc.position()!.latitude).toBe(25.2048);
  });

  it('survives unavailable storage and corrupt saved data', async () => {
    stubGeolocation('denied');
    stubTimeZone('Asia/Dubai');
    localStorage.setItem('ptm.location', '{not json');
    let loc = TestBed.inject(LocationService);
    await loc.request();
    expect(loc.source()).toBe('timezone'); // corrupt data ignored
    localStorage.setItem('ptm.location', JSON.stringify({ lat: 999, lon: 0, label: 'x' }));
    TestBed.resetTestingModule();
    loc = TestBed.inject(LocationService);
    await loc.request();
    expect(loc.source()).toBe('timezone'); // out-of-range ignored
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => loc.chooseManual({ latitude: 1, longitude: 2, heightM: 0 }, 'x')).not.toThrow();
    expect(loc.source()).toBe('manual');
    spy.mockRestore();
  });

  it('useTimeZone applies the zone and forgets a saved city; false when the zone is no use', () => {
    stubTimeZone('Asia/Dubai');
    const loc = TestBed.inject(LocationService);
    loc.chooseManual({ latitude: 51.5, longitude: -0.12, heightM: 0 }, 'London, UK');
    expect(loc.useTimeZone()).toBe(true);
    expect(loc.source()).toBe('timezone');
    expect(loc.label()).toBe('Dubai');
    expect(localStorage.getItem('ptm.location')).toBeNull();
    vi.restoreAllMocks();
    stubTimeZone('Etc/UTC');
    expect(loc.useTimeZone()).toBe(false);
    expect(loc.timeZoneArea()).toBeNull();
  });
});
