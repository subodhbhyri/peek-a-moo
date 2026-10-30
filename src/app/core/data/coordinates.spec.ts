import {
  formatCoordinates,
  parseCoordinateFields,
  parseCoordinatePair,
  validCoordinates,
} from './coordinates';

describe('coordinates', () => {
  it('accepts decimal degrees in two fields', () => {
    expect(parseCoordinateFields('24.45', '54.38')).toEqual({ latitude: 24.45, longitude: 54.38 });
    expect(parseCoordinateFields(' -33.8688 ', '151.2093')).toEqual({
      latitude: -33.8688,
      longitude: 151.2093,
    });
    expect(parseCoordinateFields('+0', '-0.5')).toEqual({ latitude: 0, longitude: -0.5 });
    expect(parseCoordinateFields('90', '180')).not.toBeNull();
    expect(parseCoordinateFields('-90', '-180')).not.toBeNull();
    expect(parseCoordinateFields('.5', '10.')).toEqual({ latitude: 0.5, longitude: 10 });
  });

  it('rejects empty, non-numeric and out-of-range values', () => {
    for (const [la, lo] of [
      ['', ''],
      ['24.45', ''],
      ['abc', '54'],
      ['24,45', '54.38'],
      ['91', '0'],
      ['-90.1', '0'],
      ['0', '180.5'],
      ['0', '-181'],
      ['1e2', '0'],
      ['NaN', '0'],
      ['Infinity', '0'],
    ]) {
      expect(parseCoordinateFields(la, lo), `${la} / ${lo}`).toBeNull();
    }
  });

  it('accepts a pasted pair: comma, space, semicolon, tab or newline between', () => {
    const expected = { latitude: 25.2048, longitude: 55.2708 };
    for (const text of [
      '25.2048, 55.2708',
      '25.2048,55.2708',
      '25.2048 55.2708',
      '  25.2048   55.2708  ',
      '25.2048;55.2708',
      '25.2048\t55.2708',
      '25.2048\n55.2708',
    ]) {
      expect(parseCoordinatePair(text), JSON.stringify(text)).toEqual(expected);
    }
  });

  it('a pasted pair must be exactly two valid numbers', () => {
    for (const text of [
      '25.2048',
      '25.2048, 55.2708, 3',
      '25.2048, abc',
      '95, 10',
      '10, 200',
      '',
    ]) {
      expect(parseCoordinatePair(text), text).toBeNull();
    }
  });

  it('validCoordinates checks ranges and finiteness', () => {
    expect(validCoordinates(0, 0)).toBe(true);
    expect(validCoordinates(90, 180)).toBe(true);
    expect(validCoordinates(90.0001, 0)).toBe(false);
    expect(validCoordinates(0, NaN)).toBe(false);
  });

  it('formats as "25.20°, 55.27°"', () => {
    expect(formatCoordinates({ latitude: 25.2048, longitude: 55.2708 })).toBe('25.20°, 55.27°');
    expect(formatCoordinates({ latitude: -33.8688, longitude: 151.2093 })).toBe('-33.87°, 151.21°');
  });
});
