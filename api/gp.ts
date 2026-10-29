/**
 * Vercel Function: public orbital elements (OMM JSON) for a fixed whitelist of satellites.
 *
 * Deliberately dumb and polite to CelesTrak:
 *  - Ignores every client input (query string, headers, body). The whitelist below is the only thing
 *    ever requested, one request per object, always with FORMAT=JSON (CelesTrak's default is CSV).
 *  - Never retries. Any non-200, empty answer or timeout stops everything and answers 502 with a short
 *    cache lifetime, so a CelesTrak outage is not hammered by clients or by us.
 *  - Success is cached at the edge for 2 h (CelesTrak updates GP data every 2 h), so upstream sees at
 *    most about one batch of 3 requests per region per update.
 */

/** ISS, Tiangong (Tianhe core module), Hubble. Keep in sync with scripts/gp-refresh.mjs. */
export const GP_WHITELIST: readonly number[] = [25544, 48274, 20580];

const UPSTREAM = 'https://celestrak.org/NORAD/elements/gp.php';
const USER_AGENT = 'peek-a-moo (+https://github.com/subodhbhyri/peek-a-moo)';
const TIMEOUT_MS = 8000;

/** The OMM fields satellite.js json2satrec needs; CelesTrak omits blank or redundant ones, so none is required. */
export const OMM_FIELDS = [
  'OBJECT_NAME',
  'OBJECT_ID',
  'EPOCH',
  'MEAN_MOTION',
  'ECCENTRICITY',
  'INCLINATION',
  'RA_OF_ASC_NODE',
  'ARG_OF_PERICENTER',
  'MEAN_ANOMALY',
  'NORAD_CAT_ID',
  'REV_AT_EPOCH',
  'BSTAR',
  'MEAN_MOTION_DOT',
  'MEAN_MOTION_DDOT',
  'EPHEMERIS_TYPE',
  'CLASSIFICATION_TYPE',
  'ELEMENT_SET_NO',
] as const;

export type OmmRecord = Record<string, string | number>;

const SUCCESS_CACHE = 'public, s-maxage=7200, stale-while-revalidate=86400';
const FAILURE_CACHE = 'public, s-maxage=600';

export function pickOmm(raw: Record<string, unknown>): OmmRecord {
  const out: OmmRecord = {};
  for (const key of OMM_FIELDS) {
    const v = raw[key];
    if (typeof v === 'string' || typeof v === 'number') out[key] = v;
  }
  return out;
}

function json(body: unknown, status: number, cacheControl: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cacheControl },
  });
}

const fail = (error: string) => json({ error }, 502, FAILURE_CACHE);

export async function GET(): Promise<Response> {
  const elements: OmmRecord[] = [];
  // One at a time, and stop at the first problem: never a loop, never a retry.
  for (const id of GP_WHITELIST) {
    let res: Response;
    try {
      res = await fetch(`${UPSTREAM}?CATNR=${id}&FORMAT=JSON`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return fail(`CelesTrak did not answer for ${id} (timeout or network error).`);
    }
    if (res.status !== 200) return fail(`CelesTrak answered ${res.status} for ${id}.`);

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      // CelesTrak answers 200 with plain text such as "No GP data found" for unknown objects.
      return fail(`CelesTrak sent something other than JSON for ${id}.`);
    }
    const first: unknown = Array.isArray(body) ? body[0] : null;
    if (!first || typeof first !== 'object') return fail(`CelesTrak had no element set for ${id}.`);
    const record = pickOmm(first as Record<string, unknown>);
    if (Number(record['NORAD_CAT_ID']) !== id || typeof record['EPOCH'] !== 'string') {
      return fail(`CelesTrak sent an unexpected record for ${id}.`);
    }
    elements.push(record);
  }
  return json({ fetchedAt: new Date().toISOString(), elements }, 200, SUCCESS_CACHE);
}
