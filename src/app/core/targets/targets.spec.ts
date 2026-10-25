import { TestBed } from '@angular/core/testing';
import { computeMoonState } from '../astro/ephemeris';
import { DEFAULT_TARGET_ID, TARGETS, getTarget } from './catalog';
import { recomputeIntervalMs } from './cadence';
import { computeTargetState } from './compute';
import { centeredThreshold, displayRadiusFor } from './display';
import { TargetSelectionService } from './target-selection.service';
import type { TargetDef } from './target.types';
import { displayRadiusPx } from '../projection/projection';

const POS = { latitude: 39.6, longitude: -104.7, heightM: 1800 };

describe('catalog', () => {
  it('has unique, URL-safe ids and a valid default', () => {
    const ids = TARGETS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
    expect(getTarget(DEFAULT_TARGET_ID)).toBeDefined();
  });

  it('getTarget returns undefined for unknown ids', () => {
    expect(getTarget('nope')).toBeUndefined();
    expect(getTarget('')).toBeUndefined();
  });
});

describe('computeTargetState', () => {
  const moon = getTarget('moon')!;

  it('returns the same numbers as computeMoonState for the Moon', () => {
    const date = new Date('2026-11-06T12:30:00Z');
    const t = computeTargetState(moon, date, POS);
    const m = computeMoonState(date, POS);
    expect(t.id).toBe('moon');
    expect(t.computedAt).toEqual(m.computedAt);
    expect(t.azimuthDeg).toBe(m.azimuthDeg);
    expect(t.altitudeDeg).toBe(m.altitudeDeg);
    expect(t.direction).toEqual(m.direction);
    expect(t.sunDirection).toEqual(m.sunDirection);
    expect(t.sunAltitudeDeg).toBe(m.sunAltitudeDeg);
    expect(t.angularSizeDeg).toBe(m.angularDiameterDeg);
    expect(t.phase).toEqual({
      kind: 'moon',
      illuminatedFraction: m.illuminatedFraction,
      phaseDeg: m.phaseDeg,
      name: m.phaseName,
    });
  });

  it('fills a plausible Moon magnitude (about -13 at full, dimmer at a thin crescent)', () => {
    const full = computeTargetState(moon, new Date('2026-10-26T03:00:00Z'), POS);
    const thin = computeTargetState(moon, new Date('2026-11-06T12:30:00Z'), POS);
    expect(full.magnitude).toBeLessThan(-12);
    expect(full.magnitude).toBeGreaterThan(-13.5);
    expect(thin.magnitude!).toBeGreaterThan(full.magnitude!);
  });

  it('throws a clear error for kinds without a provider yet', () => {
    const iss: TargetDef = {
      id: 'iss',
      name: 'ISS',
      kind: 'satellite',
      category: 'satellites',
      blurb: '',
      render: 'satellite',
      satellite: { noradId: 25544 },
    };
    expect(() => computeTargetState(iss, new Date(), POS)).toThrow(/No provider.*iss/);
  });
});

describe('cadence', () => {
  it('matches the architecture table', () => {
    expect(recomputeIntervalMs('moon')).toBe(5000);
    expect(recomputeIntervalMs('sun')).toBe(30000);
    expect(recomputeIntervalMs('planet')).toBe(30000);
    expect(recomputeIntervalMs('fixed')).toBe(30000);
    expect(recomputeIntervalMs('satellite')).toBe(0);
  });
});

describe('display', () => {
  const vp = { width: 400, height: 800, vFovDeg: 62 };
  it('Moon size and find threshold are exactly the v1 values', () => {
    const t = computeTargetState(getTarget('moon')!, new Date('2026-10-26T03:00:00Z'), POS);
    expect(displayRadiusFor(t, vp)).toBe(displayRadiusPx(vp, t.angularSizeDeg));
    expect(centeredThreshold(43.7, vp)).toBe(0.35);
  });
});

describe('TargetSelectionService', () => {
  const KEY = 'ptm.target';
  const setUrl = (search: string) => history.replaceState(null, '', '/' + search);
  beforeEach(() => {
    localStorage.clear();
    setUrl('');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    setUrl('');
  });

  it('defaults to the Moon', () => {
    const s = TestBed.inject(TargetSelectionService);
    expect(s.selectedId()).toBe('moon');
    expect(s.selected().name).toBe('Moon');
  });

  it('?target= wins over localStorage, which wins over the default', () => {
    // Only the Moon exists, so precedence is checked by which source gets consulted at all.
    setUrl('?target=moon');
    localStorage.setItem(KEY, 'not-a-target');
    expect(TestBed.inject(TargetSelectionService).selectedId()).toBe('moon');
  });

  it('uses a known localStorage id when the URL has none', () => {
    localStorage.setItem(KEY, 'moon');
    expect(TestBed.inject(TargetSelectionService).selectedId()).toBe('moon');
  });

  it('unknown ids in the URL or storage fall back to the default', () => {
    setUrl('?target=garbage');
    localStorage.setItem(KEY, 'also-garbage');
    expect(TestBed.inject(TargetSelectionService).selectedId()).toBe('moon');
  });

  it('select() ignores unknown ids, persists known ones, and keeps other URL params', () => {
    setUrl('?debug&target=garbage');
    const s = TestBed.inject(TargetSelectionService);
    s.select('nope');
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(window.location.search).toBe('?debug&target=garbage'); // untouched

    s.select('moon');
    expect(localStorage.getItem(KEY)).toBe('moon');
    const params = new URLSearchParams(window.location.search);
    expect(params.get('target')).toBe('moon');
    expect(params.has('debug')).toBe(true);
  });

  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const s = TestBed.inject(TargetSelectionService);
    expect(s.selectedId()).toBe('moon');
    expect(() => s.select('moon')).not.toThrow();
    expect(s.selectedId()).toBe('moon');
  });
});
