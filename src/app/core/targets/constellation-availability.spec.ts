import { skyGeometry } from '../sky/testing/sky-fixture';
import { CONSTELLATION_NOMINAL_MAG, computeAvailability } from './availability';
import { formatAvailability, introNote } from './availability-format';
import { getTarget } from './catalog';
import { liveStats } from './live-stats';
import { computeTargetState } from './compute';

const DENVER = { latitude: 39.6, longitude: -104.7, heightM: 1800 };
const ABU_DHABI = { latitude: 24.45, longitude: 54.38, heightM: 0 };
const sky = skyGeometry();
const def = (id: string) => getTarget(id)!;
const opts = { sky };
const L = 'en-US';

describe('constellation availability', () => {
  const winterNight = new Date('2026-12-15T04:00:00Z'); // 21:00 in Denver, Orion well up in the east
  const juneNoon = new Date('2026-06-21T18:00:00Z'); // noon in Denver: the Sun is in Gemini, next to Orion

  it('is judged as a naked-eye object: visible in a dark sky, "too bright" in daylight', () => {
    expect(CONSTELLATION_NOMINAL_MAG).toBe(3);
    const night = computeAvailability(def('orion'), winterNight, DENVER, opts);
    expect(night.visibility).toBe('up-visible');
    expect(night.magnitude).toBeNull();
    expect(night.altitudeDeg).toBeGreaterThan(10);
    expect(formatAvailability(night, winterNight, L, { def: def('orion') })).toEqual({
      label: 'Up now',
      tone: 'good',
    });
    const day = computeAvailability(def('orion'), juneNoon, DENVER, opts);
    expect(day.altitudeDeg).toBeGreaterThan(0);
    expect(day.visibility).toBe('up-daylight');
    expect(formatAvailability(day, juneNoon, L, { def: def('orion') }).label).toBe(
      "Up, but the sky's too bright",
    );
  });

  it('says "Rises ..." for a constellation below the horizon, from the scan on its center', () => {
    // Find a constellation that is down at this moment and rises within the scan window.
    const down = sky.constellations
      .map((c) => def(c.id))
      .map((d) => ({ d, a: computeAvailability(d, winterNight, DENVER, opts) }))
      .find(({ a }) => a.visibility === 'below-horizon' && !a.partlyUp && a.nextRise);
    expect(down).toBeDefined();
    const label = formatAvailability(down!.a, winterNight, L, { def: down!.d });
    expect(label.label).toMatch(/^Rises /);
  });

  it('"Partly up" (tone meh) when the center is below the horizon but part of the figure is above it', () => {
    let found: { id: string; hours: number } | null = null;
    for (const c of sky.constellations) {
      for (let hours = 0; hours < 24 && !found; hours += 2) {
        const when = new Date(winterNight.getTime() + hours * 3_600_000);
        const s = computeTargetState(def(c.id), when, DENVER, undefined, sky);
        if (s.constellation?.partlyUp) found = { id: c.id, hours };
      }
      if (found) break;
    }
    expect(found).not.toBeNull();
    const when = new Date(winterNight.getTime() + found!.hours * 3_600_000);
    const a = computeAvailability(def(found!.id), when, DENVER, opts);
    expect(a.partlyUp).toBe(true);
    expect(a.visibility).toBe('below-horizon');
    expect(formatAvailability(a, when, L, { def: def(found!.id) })).toEqual({
      label: 'Partly up',
      tone: 'meh',
    });
    expect(introNote(a, def(found!.id), when, L)).toMatch(/is partly up right now/);
  });

  it('other targets never get a Partly up label, and a plain "up" constellation is not "partly"', () => {
    const jupiter = computeAvailability(def('jupiter'), winterNight, DENVER);
    expect(jupiter.partlyUp).toBeUndefined();
    expect(computeAvailability(def('orion'), winterNight, DENVER, opts).partlyUp).toBe(false);
  });

  it('"Never rises from here" only when no vertex can clear the horizon at this latitude', () => {
    const octans = computeAvailability(def('octans'), winterNight, DENVER, opts);
    expect(octans.neverRisesHere).toBe(true);
    expect(formatAvailability(octans, winterNight, L, { def: def('octans') })).toEqual({
      label: 'Never rises from here',
      tone: 'off',
    });
    // Crux is out of reach from Denver but clears the horizon from Abu Dhabi.
    expect(computeAvailability(def('crux'), winterNight, DENVER, opts).neverRisesHere).toBe(true);
    const crux = computeAvailability(def('crux'), winterNight, ABU_DHABI, opts);
    expect(crux.neverRisesHere).toBe(false);
    expect(crux.neverUp).toBe(false);
    // Ursa Major never sets from Denver, so it is never "never rises".
    expect(computeAvailability(def('ursa-major'), winterNight, DENVER, opts).neverRisesHere).toBe(
      false,
    );
  });

  it('needs the star map: without it computing throws instead of guessing', () => {
    expect(() => computeAvailability(def('orion'), winterNight, DENVER)).toThrow();
  });
});

describe('constellation live stats', () => {
  const date = new Date('2026-12-15T04:00:00Z');
  const rowFor = (id: string, when = date, place = DENVER) => {
    const state = computeTargetState(def(id), when, place, undefined, sky);
    return liveStats(def(id), state, when, { locale: L }).filter((s) => s.label === 'Right now');
  };

  it('says "Up from here", "Partly up" or "Below the horizon", and nothing numeric that it cannot know', () => {
    expect(rowFor('orion')).toEqual([{ label: 'Right now', value: 'Up from here' }]);
    expect(rowFor('octans')).toEqual([{ label: 'Right now', value: 'Below the horizon' }]);
    let partly: string | null = null;
    for (const c of sky.constellations) {
      for (let h = 0; h < 24 && !partly; h += 2) {
        const when = new Date(date.getTime() + h * 3_600_000);
        if (computeTargetState(def(c.id), when, DENVER, undefined, sky).constellation?.partlyUp) {
          expect(rowFor(c.id, when)).toEqual([{ label: 'Right now', value: 'Partly up' }]);
          partly = c.id;
        }
      }
    }
    expect(partly).not.toBeNull();
    const all = liveStats(
      def('orion'),
      computeTargetState(def('orion'), date, DENVER, undefined, sky),
      date,
    );
    expect(all.map((s) => s.label)).toEqual(['Right now']);
  });
});
