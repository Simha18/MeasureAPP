import { convertLength, convertVolume } from './conversions';
import type { Measurement, MeasurementUnit, VolumeUnit } from './types';
import { measurementUnits, volumeUnits } from './types';

export const measurementUnitLabels: Record<MeasurementUnit, string> = {
  centimeter: 'Centimeter',
  foot: 'Foot',
  inch: 'Inch',
  meter: 'Meter',
  millimeter: 'Millimeter',
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

export function getDisplayedVolume(measurement: Measurement, unit: VolumeUnit) {
  return {
    unit,
    value: convertVolume(measurement.volume.valueCubicMeters, measurement.volume.unit, unit),
  };
}
