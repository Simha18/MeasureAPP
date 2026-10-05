import type { MeasurementUnit, VolumeUnit } from './types';

export const canonicalLengthUnit = 'meter' satisfies MeasurementUnit;
export const canonicalVolumeUnit = 'cubic_meter' satisfies VolumeUnit;

const metersPerUnit: Record<MeasurementUnit, number> = {
  centimeter: 0.01,
  foot: 0.3048,
  inch: 0.0254,
  meter: 1,
  millimeter: 0.001,
};

const cubicMetersPerUnit: Record<VolumeUnit, number> = {
  cubic_centimeter: 0.000001,
  cubic_foot: 0.028316846592,
  cubic_inch: 0.000016387064,
  cubic_meter: 1,
  liter: 0.001,
};

export function assertFiniteNumber(value: number, fieldName = 'value') {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${fieldName} must be a finite number.`);
  }
}

export function assertNonNegative(value: number, fieldName = 'value') {
  assertFiniteNumber(value, fieldName);

  if (value < 0) {
    throw new RangeError(`${fieldName} cannot be negative.`);
  }
}

export function assertPositive(value: number, fieldName = 'value') {
  assertFiniteNumber(value, fieldName);

  if (value <= 0) {
    throw new RangeError(`${fieldName} must be greater than zero.`);
  }
}

export function roundValue(value: number, fractionDigits = 3) {
  assertFiniteNumber(value);

  if (!Number.isInteger(fractionDigits) || fractionDigits < 0) {
    throw new RangeError('fractionDigits must be a non-negative integer.');
  }

  const factor = 10 ** fractionDigits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function convertLength(value: number, fromUnit: MeasurementUnit, toUnit: MeasurementUnit) {
  assertNonNegative(value, 'length');

  const meters = value * metersPerUnit[fromUnit];
  return meters / metersPerUnit[toUnit];
}

export function convertVolume(value: number, fromUnit: VolumeUnit, toUnit: VolumeUnit) {
  assertNonNegative(value, 'volume');

  const cubicMeters = value * cubicMetersPerUnit[fromUnit];
  return cubicMeters / cubicMetersPerUnit[toUnit];
}

export function convertArea(value: number, fromLengthUnit: MeasurementUnit, toLengthUnit: MeasurementUnit) {
  assertNonNegative(value, 'area');

  const squareMeters = value * (metersPerUnit[fromLengthUnit] ** 2);
  return squareMeters / (metersPerUnit[toLengthUnit] ** 2);
}

export function toMeters(value: number, fromUnit: MeasurementUnit) {
  return convertLength(value, fromUnit, canonicalLengthUnit);
}

export function fromMeters(value: number, toUnit: MeasurementUnit) {
  return convertLength(value, canonicalLengthUnit, toUnit);
}

export function toCubicMeters(value: number, fromUnit: VolumeUnit) {
  return convertVolume(value, fromUnit, canonicalVolumeUnit);
}

export function fromCubicMeters(value: number, toUnit: VolumeUnit) {
  return convertVolume(value, canonicalVolumeUnit, toUnit);
}
