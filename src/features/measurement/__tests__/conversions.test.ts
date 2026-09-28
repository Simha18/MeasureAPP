import { describe, expect, it } from 'vitest';

import {
  convertLength,
  convertVolume,
  roundValue,
  toCubicMeters,
  toMeters,
} from '../conversions';

describe('measurement unit conversions', () => {
  it('converts supported length units through canonical meters', () => {
    expect(toMeters(1000, 'millimeter')).toBe(1);
    expect(toMeters(100, 'centimeter')).toBe(1);
    expect(toMeters(1, 'meter')).toBe(1);
    expect(toMeters(12, 'inch')).toBeCloseTo(0.3048);
    expect(toMeters(3, 'foot')).toBeCloseTo(0.9144);
    expect(convertLength(1, 'meter', 'centimeter')).toBe(100);
  });

  it('converts supported volume units through canonical cubic meters', () => {
    expect(toCubicMeters(1000000, 'cubic_centimeter')).toBe(1);
    expect(toCubicMeters(1000, 'liter')).toBe(1);
    expect(toCubicMeters(1, 'cubic_meter')).toBe(1);
    expect(toCubicMeters(1728, 'cubic_inch')).toBeCloseTo(0.028316846592);
    expect(toCubicMeters(1, 'cubic_foot')).toBeCloseTo(0.028316846592);
    expect(convertVolume(0.072, 'cubic_meter', 'liter')).toBe(72);
  });

  it('rejects invalid and negative conversion values', () => {
    expect(() => convertLength(-1, 'meter', 'centimeter')).toThrow(RangeError);
    expect(() => convertVolume(-1, 'liter', 'cubic_meter')).toThrow(RangeError);
    expect(() => convertLength(Number.NaN, 'meter', 'centimeter')).toThrow(TypeError);
    expect(() => convertVolume(Number.POSITIVE_INFINITY, 'liter', 'cubic_meter')).toThrow(TypeError);
  });

  it('rounds numeric values using the requested precision', () => {
    expect(roundValue(0.07200000000000001, 3)).toBe(0.072);
    expect(roundValue(1.005, 2)).toBe(1.01);
    expect(() => roundValue(1, -1)).toThrow(RangeError);
  });
});
