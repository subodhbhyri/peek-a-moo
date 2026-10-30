import citiesJson from '../../../../public/data/cities.json';
import {
  CitiesFile,
  City,
  FALLBACK_CITIES,
  buildIndex,
  cityLabel,
  citiesFromFile,
  normalizeSearch,
  searchCities,
} from './cities';

const file = citiesJson as unknown as CitiesFile;
const all = citiesFromFile(file);
const index = buildIndex(all);
const names = (cs: City[]) => cs.map((c) => `${c.name}, ${c.country}`);

describe('the generated cities file (public/data/cities.json)', () => {
  it('has thousands of cities, each with a valid place, a country and a population', () => {
    expect(all.length).toBeGreaterThanOrEqual(3000);
    for (const c of all) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.country.length, c.name).toBeGreaterThan(0);
      expect(c.latitude, c.name).toBeGreaterThanOrEqual(-90);
      expect(c.latitude, c.name).toBeLessThanOrEqual(90);
      expect(c.longitude, c.name).toBeGreaterThanOrEqual(-180);
      expect(c.longitude, c.name).toBeLessThanOrEqual(180);
      // GeoNames records no population for a few tiny capitals (Ngerulmud is 0); they are kept regardless.
      expect(c.population, c.name).toBeGreaterThanOrEqual(0);
    }
  });

  it('coordinates have at most 4 decimals', () => {
    for (const c of all) {
      expect(Math.abs(c.latitude * 1e4 - Math.round(c.latitude * 1e4)), c.name).toBeLessThan(1e-6);
      expect(Math.abs(c.longitude * 1e4 - Math.round(c.longitude * 1e4)), c.name).toBeLessThan(
        1e-6,
      );
    }
  });

  it('contains the big cities and national capitals, including small ones (below 100,000)', () => {
    const has = (n: string, country: string) =>
      all.some((c) => c.name === n && c.country === country);
    expect(has('Abu Dhabi', 'UAE')).toBe(true);
    expect(has('Dubai', 'UAE')).toBe(true);
    expect(has('New York City', 'USA') || has('New York', 'USA')).toBe(true);
    expect(has('Tokyo', 'Japan')).toBe(true);
    // Capitals with fewer than 100,000 people are kept anyway.
    const smallCapitals = all.filter((c) => c.population < 100_000);
    expect(smallCapitals.length).toBeGreaterThan(5);
    expect(has('Reykjavík', 'Iceland')).toBe(true);
  });

  it('names a country the way people write it', () => {
    const countries = new Set(all.map((c) => c.country));
    expect(countries.has('USA')).toBe(true);
    expect(countries.has('UK')).toBe(true);
    expect(countries.has('United States')).toBe(false);
  });
});

describe('searchCities', () => {
  it('"abu" finds Abu Dhabi', () => {
    expect(names(searchCities(index, 'abu'))).toContain('Abu Dhabi, UAE');
  });

  it('"dhabi" finds Abu Dhabi too (substring, after the prefix matches)', () => {
    expect(names(searchCities(index, 'dhabi'))).toContain('Abu Dhabi, UAE');
  });

  it('"Abu Dhabi" puts Abu Dhabi first', () => {
    expect(names(searchCities(index, 'Abu Dhabi'))[0]).toBe('Abu Dhabi, UAE');
  });

  it('ignores case and accents, in the query and in the names', () => {
    expect(names(searchCities(index, 'BOGOTA'))).toContain('Bogotá, Colombia');
    expect(names(searchCities(index, 'bogotá'))).toContain('Bogotá, Colombia');
    expect(names(searchCities(index, 'sao paulo'))[0]).toMatch(/^São Paulo/);
    expect(names(searchCities(index, 'zurich'))).toContain('Zürich, Switzerland');
  });

  it('prefix matches come before substring matches, and each tier is ranked by population', () => {
    const results = searchCities(index, 'new');
    const firstSubstring = results.findIndex(
      (c) =>
        !normalizeSearch(c.name).startsWith('new') && !normalizeSearch(c.ascii).startsWith('new'),
    );
    const prefixPart = firstSubstring === -1 ? results : results.slice(0, firstSubstring);
    expect(prefixPart.length).toBeGreaterThan(3);
    for (let i = 1; i < prefixPart.length; i++) {
      expect(prefixPart[i].population).toBeLessThanOrEqual(prefixPart[i - 1].population);
    }
    for (const c of prefixPart) {
      expect(
        normalizeSearch(c.name).startsWith('new') || normalizeSearch(c.ascii).startsWith('new'),
      ).toBe(true);
    }
  });

  it('shows at most 30, and lists the biggest cities for an empty query', () => {
    expect(searchCities(index, 'a')).toHaveLength(30);
    const top = searchCities(index, '');
    expect(top).toHaveLength(30);
    expect(top[0].population).toBeGreaterThanOrEqual(top[29].population);
  });

  it('finds nothing for nonsense', () => {
    expect(searchCities(index, 'zzzz')).toEqual([]);
    expect(searchCities(index, 'qqxxzz9')).toEqual([]);
  });

  it('works on the small built-in fallback list too (Abu Dhabi is in it)', () => {
    const small = buildIndex(FALLBACK_CITIES);
    expect(names(searchCities(small, 'abu'))).toContain('Abu Dhabi, UAE');
    expect(names(searchCities(small, 'dhabi'))).toEqual(['Abu Dhabi, UAE']);
    expect(names(searchCities(small, 'bogota'))).toEqual(['Bogotá, Colombia']);
  });
});

describe('fallback list and labels', () => {
  it('is about 30 capitals around the world, all valid', () => {
    expect(FALLBACK_CITIES.length).toBeGreaterThanOrEqual(25);
    expect(FALLBACK_CITIES.length).toBeLessThanOrEqual(40);
    for (const c of FALLBACK_CITIES) {
      expect(Math.abs(c.latitude)).toBeLessThanOrEqual(90);
      expect(Math.abs(c.longitude)).toBeLessThanOrEqual(180);
    }
  });

  it('labels as "Abu Dhabi, UAE", with the region only when there is one', () => {
    expect(cityLabel({ name: 'Abu Dhabi', country: 'UAE', admin1: '' })).toBe('Abu Dhabi, UAE');
    expect(cityLabel({ name: 'Springfield', country: 'USA', admin1: 'Illinois' })).toBe(
      'Springfield, Illinois, USA',
    );
  });
});
