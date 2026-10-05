import { convertArea, convertLength, convertVolume } from './conversions';
import type { Measurement, MeasurementUnit, VolumeUnit } from './types';
import { measurementUnits, volumeUnits } from './types';

export const measurementUnitLabels: Record<MeasurementUnit, string> = {
  centimeter: 'Centimeter',
  foot: 'Foot',
  inch: 'Inch',
  meter: 'Meter',
  millimeter: 'Millimeter',
};

export const measurementUnitSymbols: Record<MeasurementUnit, string> = {
  centimeter: 'cm',
  foot: 'ft',
  inch: 'in',
  meter: 'm',
  millimeter: 'mm',
};

export const areaUnitSymbols: Record<MeasurementUnit, string> = {
  centimeter: 'cm²',
  foot: 'sq ft',
  inch: 'sq in',
  meter: 'm²',
  millimeter: 'mm²',
};

export const volumeUnitLabels: Record<VolumeUnit, string> = {
  cubic_centimeter: 'Cubic centimeter',
  cubic_foot: 'Cubic foot',
  cubic_inch: 'Cubic inch',
  cubic_meter: 'Cubic meter',
  liter: 'Liter',
};

export const measurementUnitOptions = measurementUnits.map((value) => ({
  label: measurementUnitLabels[value],
  value,
}));

export const volumeUnitOptions = volumeUnits.map((value) => ({
  label: volumeUnitLabels[value],
  value,
}));

export function getDisplayedDimensions(measurement: Measurement, unit: MeasurementUnit) {
  return {
    height: convertLength(measurement.dimensions.heightMeters, 'meter', unit),
    length: convertLength(measurement.dimensions.lengthMeters, 'meter', unit),
    unit,
    width: convertLength(measurement.dimensions.widthMeters, 'meter', unit),
  };
}

export function getDisplayedPerimeter(measurement: Measurement, unit: MeasurementUnit) {
  const meters = measurement.dimensions.perimeterMeters ?? measurement.dimensions.basePerimeterMeters;
  if (meters == null) return null;
  return {
    unit,
    symbol: measurementUnitSymbols[unit],
    value: convertLength(meters, 'meter', unit),
  };
}

export function getDisplayedRadius(measurement: Measurement, unit: MeasurementUnit) {
  const meters = measurement.dimensions.radiusMeters;
  if (meters == null) return null;
  return {
    unit,
    symbol: measurementUnitSymbols[unit],
    value: convertLength(meters, 'meter', unit),
  };
}

export function getDisplayedDiameter(measurement: Measurement, unit: MeasurementUnit) {
  const meters = measurement.dimensions.diameterMeters ?? (measurement.dimensions.radiusMeters ? measurement.dimensions.radiusMeters * 2 : undefined);
  if (meters == null) return null;
  return {
    unit,
    symbol: measurementUnitSymbols[unit],
    value: convertLength(meters, 'meter', unit),
  };
}

export function getDisplayedArea(measurement: Measurement, unit: MeasurementUnit) {
  const sqMeters = measurement.dimensions.areaSquareMeters ?? measurement.dimensions.baseAreaSquareMeters;
  if (sqMeters == null) return null;
  return {
    unit,
    symbol: areaUnitSymbols[unit],
    value: convertArea(sqMeters, 'meter', unit),
  };
}

export function getDisplayedBaseArea(measurement: Measurement, unit: MeasurementUnit) {
  const sqMeters = measurement.dimensions.baseAreaSquareMeters ?? measurement.dimensions.areaSquareMeters;
  if (sqMeters == null) return null;
  return {
    unit,
    symbol: areaUnitSymbols[unit],
    value: convertArea(sqMeters, 'meter', unit),
  };
}

export function getDisplayedSurfaceArea(measurement: Measurement, unit: MeasurementUnit) {
  const sqMeters = measurement.dimensions.surfaceAreaSquareMeters ?? measurement.dimensions.areaSquareMeters;
  if (sqMeters == null) return null;
  return {
    unit,
    symbol: areaUnitSymbols[unit],
    value: convertArea(sqMeters, 'meter', unit),
  };
}

export function getDisplayedVolume(measurement: Measurement, unit: VolumeUnit) {
  return {
    unit,
    value: convertVolume(measurement.volume.valueCubicMeters, measurement.volume.unit, unit),
  };
}
