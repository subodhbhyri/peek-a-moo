import { TIMEZONE_LOCATIONS, TimeZoneLocation } from '../data/timezone-locations';

/** The device's IANA time zone, e.g. "Asia/Dubai"; null when the browser will not say. */
export function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/**
 * Reference coordinates for a time zone, or null when the zone says nothing about where you are: unknown
 * zones, "UTC" / "GMT" and everything under "Etc/" (those are offsets, not places).
 */
export function locationForTimeZone(zone: string | null | undefined): TimeZoneLocation | null {
  if (!zone) return null;
  if (zone === 'UTC' || zone === 'GMT' || zone.startsWith('Etc/')) return null;
  return TIMEZONE_LOCATIONS[zone] ?? null;
}
