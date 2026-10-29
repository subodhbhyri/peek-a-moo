import { TestBed } from '@angular/core/testing';
import fallbackFile from '../../../../public/data/gp-fallback.json';
import { vi } from 'vitest';
import { satrecFor } from '../targets/providers/satellite';
import { GP_FETCH_TIMEOUT_MS, GP_RETRY_AFTER_MS, GP_STORAGE_KEY, GpService } from './gp.service';
import { type GpPayload, isGpPayload } from './gp.types';
import { GP_FIXTURE } from './testing/gp-fixture';

const NOW = Date.parse('2026-10-29T20:00:00Z');
const fresh = (): GpPayload => ({
  ...GP_FIXTURE,
  fetchedAt: new Date(NOW - 10 * 60_000).toISOString(),
});
const old = (hours: number): GpPayload => ({
  ...GP_FIXTURE,
  fetchedAt: new Date(NOW - hours * 3_600_000).toISOString(),
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('GpService', () => {
  let svc: GpService;
  let fetchMock: ReturnType<typeof vi.fn>;
  const calledUrls = () => fetchMock.mock.calls.map((c) => String(c[0]));

  function setup(routes: Record<string, () => Promise<Response> | Response>) {
    fetchMock = vi.fn(async (url: unknown) => {
      const route = routes[String(url)];
      if (!route) throw new Error(`unexpected fetch ${String(url)}`);
      return route();
    });
    vi.stubGlobal('fetch', fetchMock);
    svc = TestBed.inject(GpService);
    svc.now = () => NOW;
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('does nothing until get() is called: no request on creation', () => {
    setup({});
    expect(svc.status()).toBe('idle');
    expect(svc.data()).toBeNull();
    expect(svc.elements()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches /api/gp, keeps the newest good copy in localStorage, and serves later calls from memory', async () => {
    setup({ '/api/gp': () => json(fresh()) });
    const got = await svc.get();
    expect(got?.elements).toHaveLength(3);
    expect(svc.status()).toBe('ready');
    expect(svc.elements()!.get(25544)!.OBJECT_NAME).toBe('ISS (ZARYA)');
    expect(JSON.parse(localStorage.getItem(GP_STORAGE_KEY)!).fetchedAt).toBe(got!.fetchedAt);
    await svc.get();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('prefers a localStorage copy that is at most 2 h old: no request at all', async () => {
    localStorage.setItem(GP_STORAGE_KEY, JSON.stringify(old(1.5)));
    setup({});
    const got = await svc.get();
    expect(got?.fetchedAt).toBe(old(1.5).fetchedAt);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores a localStorage copy older than 2 h and goes to the network', async () => {
    localStorage.setItem(GP_STORAGE_KEY, JSON.stringify(old(3)));
    setup({ '/api/gp': () => json(fresh()) });
    const got = await svc.get();
    expect(got!.fetchedAt).toBe(fresh().fetchedAt);
    expect(calledUrls()).toEqual(['/api/gp']);
  });

  it('survives garbage or unavailable localStorage', async () => {
    localStorage.setItem(GP_STORAGE_KEY, '{not json');
    setup({ '/api/gp': () => json(fresh()) });
    expect((await svc.get())?.elements).toHaveLength(3);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    TestBed.resetTestingModule();
    setup({ '/api/gp': () => json(fresh()) });
    expect((await svc.get())?.elements).toHaveLength(3);
    spy.mockRestore();
  });

  it('falls through to the bundled snapshot when /api/gp fails (e.g. under ng serve)', async () => {
    setup({
      '/api/gp': () => new Response('Not Found', { status: 404 }),
      'data/gp-fallback.json': () => json(old(30)),
    });
    const got = await svc.get();
    expect(got!.fetchedAt).toBe(old(30).fetchedAt);
    expect(calledUrls()).toEqual(['/api/gp', 'data/gp-fallback.json']);
    expect(svc.status()).toBe('ready');
  });

  it('a 502 from our own function (CelesTrak down) is not retried, and the fallback is used', async () => {
    setup({
      '/api/gp': () => json({ error: 'CelesTrak answered 403' }, 502),
      'data/gp-fallback.json': () => json(old(30)),
    });
    await svc.get();
    expect(calledUrls().filter((u) => u === '/api/gp')).toHaveLength(1);
  });

  it('gives up on /api/gp after 5 s and uses the fallback', async () => {
    vi.useFakeTimers();
    setup({
      '/api/gp': () => new Promise<Response>(() => undefined), // never answers
      'data/gp-fallback.json': () => json(old(30)),
    });
    // A hung fetch only ends when the abort signal fires; make the mock honour it.
    fetchMock.mockImplementation((url: unknown, init?: RequestInit) => {
      if (String(url) === '/api/gp') {
        return new Promise((_, reject) =>
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          ),
        );
      }
      return Promise.resolve(json(old(30)));
    });
    const p = svc.get();
    await vi.advanceTimersByTimeAsync(GP_FETCH_TIMEOUT_MS + 1);
    const got = await p;
    expect(got!.fetchedAt).toBe(old(30).fetchedAt);
  });

  it('uses the newest of a stale localStorage copy and the snapshot', async () => {
    localStorage.setItem(GP_STORAGE_KEY, JSON.stringify(old(5)));
    setup({
      '/api/gp': () => new Response('x', { status: 500 }),
      'data/gp-fallback.json': () => json(old(40)),
    });
    expect((await svc.get())!.fetchedAt).toBe(old(5).fetchedAt);
  });

  it('total failure: status unavailable, null; no hammering for 5 minutes afterwards', async () => {
    setup({
      '/api/gp': () => new Response('x', { status: 500 }),
      'data/gp-fallback.json': () => new Response('x', { status: 404 }),
    });
    expect(await svc.get()).toBeNull();
    expect(svc.status()).toBe('unavailable');
    expect(svc.stamp()).toBe('none');
    const calls = fetchMock.mock.calls.length;
    expect(await svc.get()).toBeNull();
    expect(fetchMock.mock.calls.length).toBe(calls);
    svc.now = () => NOW + GP_RETRY_AFTER_MS + 1;
    await svc.get();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(calls);
  });

  it('refreshes in-memory data once it is older than 2 h', async () => {
    setup({ '/api/gp': () => json(fresh()) });
    await svc.get();
    svc.now = () => NOW + 3 * 3_600_000;
    await svc.get();
    expect(calledUrls().filter((u) => u === '/api/gp')).toHaveLength(2);
  });

  it('concurrent get() calls share one request', async () => {
    setup({ '/api/gp': () => json(fresh()) });
    await Promise.all([svc.get(), svc.get(), svc.get()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed payloads', async () => {
    setup({
      '/api/gp': () => json({ fetchedAt: 'x', elements: [] }),
      'data/gp-fallback.json': () => json({ nope: true }),
    });
    expect(await svc.get()).toBeNull();
  });
});

describe('public/data/gp-fallback.json', () => {
  const file = fallbackFile as unknown as GpPayload;

  it('is real, well-formed data in the /api/gp shape for exactly the three whitelisted objects', () => {
    expect(isGpPayload(file)).toBe(true);
    expect(file.elements.map((e) => e.NORAD_CAT_ID)).toEqual([25544, 48274, 20580]);
    expect(file.elements.map((e: { OBJECT_NAME: string }) => e.OBJECT_NAME)).toEqual([
      'ISS (ZARYA)',
      'CSS (TIANHE)',
      'HST',
    ]);
  });

  it('every record loads into satellite.js', () => {
    for (const e of file.elements) {
      const rec = satrecFor(e);
      expect(rec.error).toBe(0);
      expect(rec.no).toBeGreaterThan(0.05);
    }
  });
});
