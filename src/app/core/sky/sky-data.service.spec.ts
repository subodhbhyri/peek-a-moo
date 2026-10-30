import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SKY_RETRY_AFTER_MS, SKY_URL, SkyDataService } from './sky-data.service';
import { SKY_FILE } from './testing/sky-fixture';

describe('SkyDataService (lazy star map)', () => {
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
  const ok = () => Promise.resolve(new Response(JSON.stringify(SKY_FILE), { status: 200 }));

  it('fetches nothing until load() is called, and starts idle with no geometry', () => {
    const fetchMock = stub(ok);
    const svc = TestBed.inject(SkyDataService);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(svc.status()).toBe('idle');
    expect(svc.geometry()).toBeNull();
    expect(svc.field()).toBeNull();
  });

  it('load() fetches /data/sky.json once (concurrent and later calls share it) and builds the geometry', async () => {
    const fetchMock = stub(ok);
    const svc = TestBed.inject(SkyDataService);
    const first = svc.load();
    expect(svc.status()).toBe('loading');
    const [a, b] = await Promise.all([first, svc.load()]);
    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(SKY_URL);
    expect(SKY_URL).toBe('/data/sky.json');
    expect(svc.status()).toBe('ready');
    expect(svc.geometry()?.starCount).toBe(1627);
    expect(svc.geometry()?.constellations).toHaveLength(88);
    await svc.load();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // One SkyField per geometry, reused.
    expect(svc.field()).toBe(svc.field());
    expect(svc.field()?.geometry).toBe(svc.geometry());
  });

  it.each([
    ['a 404', () => Promise.resolve(new Response('nope', { status: 404 }))],
    ['a network error', () => Promise.reject(new TypeError('offline'))],
    [
      'a file that is not a star map',
      () => Promise.resolve(new Response('{"hello":1}', { status: 200 })),
    ],
    ['invalid JSON', () => Promise.resolve(new Response('<html>', { status: 200 }))],
  ])('%s: status "unavailable", no geometry, never throws', async (_name, response) => {
    stub(response);
    const svc = TestBed.inject(SkyDataService);
    await expect(svc.load()).resolves.toBeNull();
    expect(svc.status()).toBe('unavailable');
    expect(svc.geometry()).toBeNull();
  });

  it('does not retry for 5 minutes after a failure, then tries once more', async () => {
    let clock = 1_000_000;
    const fetchMock = stub(() => Promise.resolve(new Response('nope', { status: 500 })));
    const svc = TestBed.inject(SkyDataService);
    svc.now = () => clock;
    await svc.load();
    await svc.load();
    await svc.load();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    clock += SKY_RETRY_AFTER_MS - 1;
    await svc.load();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    clock += 2;
    fetchMock.mockImplementation(ok);
    await expect(svc.load()).resolves.not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(svc.status()).toBe('ready');
  });
});
