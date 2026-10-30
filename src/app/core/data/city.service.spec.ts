import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import citiesJson from '../../../../public/data/cities.json';
import { FALLBACK_CITIES, searchCities } from './cities';
import { CityService } from './city.service';

describe('CityService (lazy city list)', () => {
  afterEach(() => vi.unstubAllGlobals());

  const stub = (response: () => Promise<Response>) => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      void url;
      void init;
      return response();
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };
  const ok = () => Promise.resolve(new Response(JSON.stringify(citiesJson), { status: 200 }));

  it('fetches nothing until load() is called, and starts with the small built-in list', () => {
    const fetchMock = stub(ok);
    const svc = TestBed.inject(CityService);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(svc.status()).toBe('idle');
    expect(svc.index()).toHaveLength(FALLBACK_CITIES.length);
  });

  it('load() fetches /data/cities.json once and swaps in the big list (concurrent calls share it)', async () => {
    const fetchMock = stub(ok);
    const svc = TestBed.inject(CityService);
    await Promise.all([svc.load(), svc.load()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/data/cities.json');
    expect(svc.status()).toBe('ready');
    expect(svc.index().length).toBeGreaterThan(3000);
    await svc.load();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(searchCities(svc.index(), 'abu').map((c) => c.name)).toContain('Abu Dhabi');
  });

  it('a failed fetch keeps the built-in capitals (still searchable) and does not retry', async () => {
    for (const failing of [
      () => Promise.reject(new TypeError('offline')),
      () => Promise.resolve(new Response('nope', { status: 404 })),
      () => Promise.resolve(new Response('{"cities": []}', { status: 200 })),
      () => Promise.resolve(new Response('not json', { status: 200 })),
    ]) {
      TestBed.resetTestingModule();
      const fetchMock = stub(failing);
      const svc = TestBed.inject(CityService);
      await svc.load();
      expect(svc.status()).toBe('fallback');
      expect(svc.index()).toHaveLength(FALLBACK_CITIES.length);
      expect(searchCities(svc.index(), 'abu dhabi').map((c) => c.name)).toEqual(['Abu Dhabi']);
      await svc.load();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });
});
