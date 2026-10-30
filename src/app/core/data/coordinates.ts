export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** A plain decimal-degrees number such as "25.2048" or "-0.12". A comma is a separator, never a decimal mark. */
function parseDegrees(s: string): number | null {
  const t = s.trim();
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  return Number(t);
}

/** Latitude -90..90, longitude -180..180. */
export function validCoordinates(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

/** Two separate fields (decimal degrees). null when either is empty, not a number or out of range. */
export function parseCoordinateFields(lat: string, lon: string): Coordinates | null {
  const la = parseDegrees(lat);
  const lo = parseDegrees(lon);
  if (la === null || lo === null || !validCoordinates(la, lo)) return null;
  return { latitude: la, longitude: lo };
}

/**
 * A pasted pair: "25.2048, 55.2708", "25.2048 55.2708", "25.2048;55.2708" or with a tab or newline between.
 * null when it is not exactly two decimal numbers in range.
 */
export function parseCoordinatePair(text: string): Coordinates | null {
  const parts = text
    .trim()
    .split(/\s*[,;\t\n]\s*|\s+/)
    .filter((p) => p.length > 0);
  if (parts.length !== 2) return null;
  return parseCoordinateFields(parts[0], parts[1]);
}

/** "25.20°, 55.27°". */
export function formatCoordinates(c: Coordinates): string {
  return `${c.latitude.toFixed(2)}°, ${c.longitude.toFixed(2)}°`;
}
