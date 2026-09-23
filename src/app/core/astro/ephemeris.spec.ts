import { angleBetweenDeg, azAltFromDirection } from '../math/vec3';
import { computeMoonState, phaseNameFromDegrees } from './ephemeris';
import { magneticDeclinationDeg } from './declination';

const DENVER = { latitude: 39.74, longitude: -104.99, heightM: 1600 };

describe('computeMoonState', () => {
  // Reference events (UTC): full moon + partial lunar eclipse 2024-09-18 02:34,
  // new moon + annular solar eclipse 2024-10-02 18:49, first quarter 2024-10-10 18:55.
  it('is ~100% lit and opposite the Sun at the Sept 2024 full moon', () => {
    const m = computeMoonState(new Date('2024-09-18T02:34:00Z'), DENVER);
    expect(m.illuminatedFraction).toBeGreaterThan(0.99);
    expect(m.phaseName).toBe('full');
    expect(angleBetweenDeg(m.direction, m.sunDirection)).toBeGreaterThan(175);
  });

  it('is ~0% lit and next to the Sun at the Oct 2024 new moon', () => {
    const m = computeMoonState(new Date('2024-10-02T18:49:00Z'), DENVER);
    expect(m.illuminatedFraction).toBeLessThan(0.01);
    expect(m.phaseName).toBe('new');
    expect(angleBetweenDeg(m.direction, m.sunDirection)).toBeLessThan(5);
  });

  it('is ~half lit and waxing at first quarter', () => {
    const m = computeMoonState(new Date('2024-10-10T18:55:00Z'), DENVER);
    expect(m.illuminatedFraction).toBeGreaterThan(0.45);
    expect(m.illuminatedFraction).toBeLessThan(0.55);
    expect(m.waxing).toBe(true);
    expect(m.phaseName).toBe('first-quarter');
  });

  it('direction vector agrees with azimuth/altitude and angular size is realistic', () => {
    const m = computeMoonState(new Date('2026-09-23T03:00:00Z'), DENVER);
    const back = azAltFromDirection(m.direction);
    expect(back.azimuthDeg).toBeCloseTo(m.azimuthDeg, 9);
    expect(back.altitudeDeg).toBeCloseTo(m.altitudeDeg, 9);
    expect(m.angularDiameterDeg).toBeGreaterThan(0.48);
    expect(m.angularDiameterDeg).toBeLessThan(0.57);
  });

  it('topocentric: observers far apart see the Moon in different places', () => {
    const t = new Date('2026-09-23T03:00:00Z');
    const a = computeMoonState(t, DENVER);
    const b = computeMoonState(t, { latitude: -33.87, longitude: 151.21 }); // Sydney
    expect(angleBetweenDeg(a.direction, b.direction)).toBeGreaterThan(10);
  });
});

describe('phaseNameFromDegrees', () => {
  it('buckets the cycle', () => {
    expect(phaseNameFromDegrees(0)).toBe('new');
    expect(phaseNameFromDegrees(45)).toBe('waxing-crescent');
    expect(phaseNameFromDegrees(90)).toBe('first-quarter');
    expect(phaseNameFromDegrees(180)).toBe('full');
    expect(phaseNameFromDegrees(270)).toBe('last-quarter');
    expect(phaseNameFromDegrees(350)).toBe('waning-crescent');
  });
});

describe('magneticDeclinationDeg (WMM2025)', () => {
  it('Denver is several degrees east', () => {
    const d = magneticDeclinationDeg(39.74, -104.99, new Date('2026-09-22'));
    expect(d).toBeGreaterThan(6);
    expect(d).toBeLessThan(9);
  });
  it('Seattle is ~15° east, Maine is ~14° west', () => {
    expect(magneticDeclinationDeg(47.61, -122.33, new Date('2026-09-22'))).toBeGreaterThan(13);
    expect(magneticDeclinationDeg(44.31, -69.78, new Date('2026-09-22'))).toBeLessThan(-12);
  });
});
