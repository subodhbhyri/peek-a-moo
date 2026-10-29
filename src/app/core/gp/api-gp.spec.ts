import { vi } from 'vitest';
import { GET, GP_WHITELIST, OMM_FIELDS, pickOmm } from '../../../../api/gp';

/** A CelesTrak-style OMM answer for one object, with extras the function must drop. */
function omm(id: number, extra: Record<string, unknown> = {}) {
  return [
    {
      OBJECT_NAME: `OBJ ${id}`,
      OBJECT_ID: '1998-067A',
      EPOCH: '2026-10-28T14:18:15.597504',
      MEAN_MOTION: 15.49,
      ECCENTRICITY: 0.0007,
      INCLINATION: 51.63,
      RA_OF_ASC_NODE: 359.9,
      ARG_OF_PERICENTER: 320.4,
      MEAN_ANOMALY: 39.6,
      EPHEMERIS_TYPE: 0,
      CLASSIFICATION_TYPE: 'U',
      NORAD_CAT_ID: id,
      ELEMENT_SET_NO: 999,
      REV_AT_EPOCH: 59243,
      BSTAR: 0.0001,
      MEAN_MOTION_DOT: 0.00005,
      MEAN_MOTION_DDOT: 0,
      SOME_EXTRA_FIELD: 'drop me',
      ...extra,
    },
  ];
}
const urlId = (url: unknown) => Number(new URL(String(url)).searchParams.get('CATNR'));
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('api/gp handler', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks CelesTrak exactly three times (the whitelist, one each), in JSON, with our User-Agent', async () => {
    const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
      void init;
      return ok(omm(urlId(url)));
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const urls = fetchMock.mock.calls.map((c) => new URL(String(c[0])));
    expect(urls.map((u) => u.searchParams.get('CATNR'))).toEqual(['25544', '48274', '20580']);
    for (const u of urls) {
      expect(u.origin + u.pathname).toBe('https://celestrak.org/NORAD/elements/gp.php');
      expect(u.searchParams.get('FORMAT')).toBe('JSON');
      expect([...u.searchParams.keys()].sort()).toEqual(['CATNR', 'FORMAT']);
    }
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['User-Agent']).toBe(
      'peek-a-moo (+https://github.com/subodhbhyri/peek-a-moo)',
    );
    expect(GP_WHITELIST).toEqual([25544, 48274, 20580]);
  });

  it('success: { fetchedAt, elements } with trimmed OMM records and the 2 h CDN cache headers', async () => {
    vi.stubGlobal('fetch', async (url: unknown) => ok(omm(urlId(url))));
    const res = await GET();
    expect(res.headers.get('Cache-Control')).toBe(
      'public, s-maxage=7200, stale-while-revalidate=86400',
    );
    expect(res.headers.get('Content-Type')).toContain('application/json');
    const body = await res.json();
    expect(Date.parse(body.fetchedAt)).toBeGreaterThan(Date.now() - 60_000);
    expect(body.elements.map((e: { NORAD_CAT_ID: number }) => e.NORAD_CAT_ID)).toEqual([
      25544, 48274, 20580,
    ]);
    for (const e of body.elements) {
      expect(e.SOME_EXTRA_FIELD).toBeUndefined();
      expect(Object.keys(e).every((k) => (OMM_FIELDS as readonly string[]).includes(k))).toBe(true);
      expect(e.EPOCH).toBe('2026-10-28T14:18:15.597504');
    }
  });

  it('does not require blank or redundant OMM fields', async () => {
    vi.stubGlobal('fetch', async (url: unknown) =>
      ok([
        {
          OBJECT_NAME: 'X',
          OBJECT_ID: 'Y',
          EPOCH: '2026-10-28T00:00:00',
          NORAD_CAT_ID: urlId(url),
        },
      ]),
    );
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it('one upstream 403 -> 502 with the short cache, and nothing further is requested', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok(omm(25544)))
      .mockResolvedValueOnce(new Response('Forbidden', { status: 403 }))
      .mockResolvedValue(ok(omm(20580)));
    vi.stubGlobal('fetch', fetchMock);
    const res = await GET();
    expect(res.status).toBe(502);
    expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=600');
    expect((await res.json()).error).toContain('403');
    // Second object failed: no retry of it, and the third was never asked for.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a 403 on the very first request: exactly one call, no retry', async () => {
    const fetchMock = vi.fn(async () => new Response('Forbidden', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await GET();
    expect(res.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a timeout or network error: 502, short cache, no retry', async () => {
    const fetchMock = vi.fn(async () => {
      throw new DOMException('timed out', 'TimeoutError');
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await GET();
    expect(res.status).toBe(502);
    expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=600');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('passes an 8 s abort signal to every request', async () => {
    const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
      void init;
      return ok(omm(urlId(url)));
    });
    vi.stubGlobal('fetch', fetchMock);
    await GET();
    for (const call of fetchMock.mock.calls) {
      expect((call[1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('a 200 that is not a usable element set ("No GP data found", wrong object) is a failure too', async () => {
    for (const reply of [
      () => new Response('No GP data found', { status: 200 }),
      () => ok([]),
      () => ok(omm(1)), // not the object we asked for
    ]) {
      const fetchMock = vi.fn(async () => reply());
      vi.stubGlobal('fetch', fetchMock);
      const res = await GET();
      expect(res.status).toBe(502);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it('takes no input: GET() reads nothing from the request', async () => {
    expect(GET.length).toBe(0);
    vi.stubGlobal('fetch', async (url: unknown) => ok(omm(urlId(url))));
    const res = await (GET as (req?: Request) => Promise<Response>)(
      new Request('https://x.test/api/gp?CATNR=99999&FORMAT=CSV'),
    );
    expect(res.status).toBe(200);
  });
});

describe('pickOmm', () => {
  it('keeps strings and numbers from the allow-list only', () => {
    expect(pickOmm({ EPOCH: 'e', BSTAR: 1, NOPE: 2, OBJECT_NAME: null, MEAN_MOTION: {} })).toEqual({
      EPOCH: 'e',
      BSTAR: 1,
    });
  });
});
