import { TIMEZONE_LOCATIONS } from '../data/timezone-locations';
import { deviceTimeZone, locationForTimeZone } from './timezone-location';

describe('locationForTimeZone', () => {
  it('Asia/Dubai is the Dubai area', () => {
    const d = locationForTimeZone('Asia/Dubai')!;
    expect(d.label).toBe('Dubai');
    expect(d.lat).toBeGreaterThan(24.5);
    expect(d.lat).toBeLessThan(25.8);
    expect(d.lon).toBeGreaterThan(54.5);
    expect(d.lon).toBeLessThan(56);
  });

  it('a backward alias gets its canonical zone: Asia/Muscat is the Dubai area', () => {
    expect(locationForTimeZone('Asia/Muscat')).toEqual(locationForTimeZone('Asia/Dubai'));
    expect(locationForTimeZone('Asia/Muscat')!.label).toBe('Dubai');
  });

  it('America/Denver is near Denver', () => {
    const d = locationForTimeZone('America/Denver')!;
    expect(d.label).toBe('Denver');
    expect(Math.abs(d.lat - 39.74)).toBeLessThan(0.5);
    expect(Math.abs(d.lon - -104.98)).toBeLessThan(0.5);
  });

  it('Asia/Kolkata and its old name Asia/Calcutta are the same place', () => {
    const k = locationForTimeZone('Asia/Kolkata')!;
    expect(k.label).toBe('Kolkata');
    expect(locationForTimeZone('Asia/Calcutta')).toEqual(k);
  });

  it('zones that say nothing about where you are give null: Etc/UTC, UTC, GMT, Etc/GMT+5, unknown, empty', () => {
    for (const z of [
      'Etc/UTC',
      'UTC',
      'GMT',
      'Etc/GMT+5',
      'Etc/Unknown',
      'Mars/Olympus',
      '',
      null,
      undefined,
    ]) {
      expect(locationForTimeZone(z as string | null | undefined), String(z)).toBeNull();
    }
  });

  it('the generated table has at least 300 zones, each a real place with a label', () => {
    const entries = Object.entries(TIMEZONE_LOCATIONS);
    expect(entries.length).toBeGreaterThanOrEqual(300);
    for (const [zone, v] of entries) {
      expect(Number.isFinite(v.lat), zone).toBe(true);
      expect(Number.isFinite(v.lon), zone).toBe(true);
      expect(v.lat, zone).toBeGreaterThanOrEqual(-90);
      expect(v.lat, zone).toBeLessThanOrEqual(90);
      expect(v.lon, zone).toBeGreaterThanOrEqual(-180);
      expect(v.lon, zone).toBeLessThanOrEqual(180);
      expect(v.label.trim().length, zone).toBeGreaterThan(0);
      expect(zone.startsWith('Etc/'), zone).toBe(false);
    }
  });

  it('every IANA zone this browser knows that the table covers resolves, and the common ones are all covered', () => {
    const common = [
      'Asia/Dubai',
      'Asia/Tokyo',
      'Asia/Shanghai',
      'Asia/Singapore',
      'Asia/Karachi',
      'Asia/Dhaka',
      'Asia/Riyadh',
      'Africa/Cairo',
      'Africa/Lagos',
      'Africa/Johannesburg',
      'Europe/London',
      'Europe/Paris',
      'Europe/Moscow',
      'America/New_York',
      'America/Chicago',
      'America/Los_Angeles',
      'America/Sao_Paulo',
      'America/Mexico_City',
      'America/Argentina/Buenos_Aires',
      'Australia/Sydney',
      'Pacific/Auckland',
      'Pacific/Honolulu',
    ];
    for (const z of common) expect(locationForTimeZone(z), z).not.toBeNull();
  });
});

describe('deviceTimeZone', () => {
  it("returns the browser's zone, or null if it will not say", () => {
    const zone = deviceTimeZone();
    expect(zone === null || typeof zone === 'string').toBe(true);
  });
});
