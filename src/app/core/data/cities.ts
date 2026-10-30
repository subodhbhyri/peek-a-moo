/** A place for the manual location fallback. City-level accuracy is plenty: 100 km moves things by about 1 degree. */
export interface City {
  name: string;
  /** ASCII spelling, for matching "Bogota" to "Bogotá"; same as name when it has no accents. */
  ascii: string;
  /** Short country name, e.g. "UAE". */
  country: string;
  /** First-level region, only given where the name is ambiguous within the country. */
  admin1: string;
  latitude: number;
  longitude: number;
  /** Rounded; only used to rank search results. */
  population: number;
}

/** The shape of public/data/cities.json (see scripts/cities.mjs). */
export interface CitiesFile {
  columns: string[];
  cities: [string, string, string, string, number, number, number][];
}

export function citiesFromFile(file: CitiesFile): City[] {
  return file.cities.map(([name, ascii, country, admin1, latitude, longitude, population]) => ({
    name,
    ascii: ascii || name,
    country,
    admin1,
    latitude,
    longitude,
    population,
  }));
}

/** "Abu Dhabi, UAE" (or "Springfield, Illinois, USA" when the region disambiguates). */
export function cityLabel(c: Pick<City, 'name' | 'country' | 'admin1'>): string {
  return c.admin1 ? `${c.name}, ${c.admin1}, ${c.country}` : `${c.name}, ${c.country}`;
}

const cap = (name: string, country: string, latitude: number, longitude: number): City => ({
  name,
  ascii: name.normalize('NFD').replace(/[̀-ͯ]/g, ''),
  country,
  admin1: '',
  latitude,
  longitude,
  population: 1,
});

/**
 * Used only if public/data/cities.json cannot be fetched (offline on a first visit): about 30 capitals
 * spread over the world, so the picker is never empty.
 */
export const FALLBACK_CITIES: readonly City[] = [
  cap('Abu Dhabi', 'UAE', 24.4539, 54.3773),
  cap('Riyadh', 'Saudi Arabia', 24.7136, 46.6753),
  cap('Tehran', 'Iran', 35.6892, 51.389),
  cap('Ankara', 'Turkey', 39.9334, 32.8597),
  cap('Cairo', 'Egypt', 30.0444, 31.2357),
  cap('Addis Ababa', 'Ethiopia', 9.03, 38.74),
  cap('Nairobi', 'Kenya', -1.2921, 36.8219),
  cap('Abuja', 'Nigeria', 9.0765, 7.3986),
  cap('Pretoria', 'South Africa', -25.7479, 28.2293),
  cap('New Delhi', 'India', 28.6139, 77.209),
  cap('Islamabad', 'Pakistan', 33.6844, 73.0479),
  cap('Dhaka', 'Bangladesh', 23.8103, 90.4125),
  cap('Bangkok', 'Thailand', 13.7563, 100.5018),
  cap('Jakarta', 'Indonesia', -6.2088, 106.8456),
  cap('Beijing', 'China', 39.9042, 116.4074),
  cap('Seoul', 'South Korea', 37.5665, 126.978),
  cap('Tokyo', 'Japan', 35.6762, 139.6503),
  cap('Canberra', 'Australia', -35.2809, 149.13),
  cap('Wellington', 'New Zealand', -41.2865, 174.7762),
  cap('Moscow', 'Russia', 55.7558, 37.6173),
  cap('Kyiv', 'Ukraine', 50.4501, 30.5234),
  cap('Berlin', 'Germany', 52.52, 13.405),
  cap('Paris', 'France', 48.8566, 2.3522),
  cap('Madrid', 'Spain', 40.4168, -3.7038),
  cap('Rome', 'Italy', 41.9028, 12.4964),
  cap('London', 'UK', 51.5074, -0.1278),
  cap('Ottawa', 'Canada', 45.4215, -75.6972),
  cap('Washington, D.C.', 'USA', 38.9072, -77.0369),
  cap('Mexico City', 'Mexico', 19.4326, -99.1332),
  cap('Bogotá', 'Colombia', 4.711, -74.0721),
  cap('Lima', 'Peru', -12.0464, -77.0428),
  cap('Brasília', 'Brazil', -15.7939, -47.8828),
  cap('Buenos Aires', 'Argentina', -34.6037, -58.3816),
  cap('Santiago', 'Chile', -33.4489, -70.6693),
];

/** Lowercase, accent-free, trimmed: the form searches compare in. */
export function normalizeSearch(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** A city with its search strings computed once, so a keystroke is a cheap scan. */
export interface IndexedCity {
  city: City;
  name: string;
  ascii: string;
}

/** Sorted by population, biggest first (the order each search tier keeps). */
export function buildIndex(cities: readonly City[]): IndexedCity[] {
  return [...cities]
    .sort((a, b) => b.population - a.population)
    .map((city) => ({
      city,
      name: normalizeSearch(city.name),
      ascii: normalizeSearch(city.ascii),
    }));
}

/**
 * Case- and accent-insensitive: names (or ASCII names) that START with the query first, then ones that
 * merely CONTAIN it ("dhabi" finds Abu Dhabi), each tier ranked by population, at most `limit` results.
 * An empty query lists the biggest cities.
 */
export function searchCities(index: readonly IndexedCity[], query: string, limit = 30): City[] {
  const q = normalizeSearch(query);
  if (!q) return index.slice(0, limit).map((i) => i.city);
  const prefix: City[] = [];
  const inside: City[] = [];
  for (const i of index) {
    if (i.name.startsWith(q) || i.ascii.startsWith(q)) {
      if (prefix.length < limit) prefix.push(i.city);
    } else if (i.name.includes(q) || i.ascii.includes(q)) {
      if (inside.length < limit) inside.push(i.city);
    }
    if (prefix.length >= limit) break;
  }
  return [...prefix, ...inside].slice(0, limit);
}
