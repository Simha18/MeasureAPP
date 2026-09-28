import type { MeasurementUnit, VolumeUnit } from '@/features/measurement';

const unitLabels: Record<MeasurementUnit | VolumeUnit, string> = {
  centimeter: 'cm',
  cubic_centimeter: 'cm\u00b3',
  cubic_foot: 'ft\u00b3',
  cubic_inch: 'in\u00b3',
  cubic_meter: 'm\u00b3',
  foot: 'ft',
  inch: 'in',
  liter: 'L',
  meter: 'm',
  millimeter: 'mm',
};

export function formatMeasurement(
  value: number,
  unit: MeasurementUnit | VolumeUnit,
  options: Intl.NumberFormatOptions = { maximumSignificantDigits: 5 },
) {
  return `${new Intl.NumberFormat(undefined, options).format(value)} ${unitLabels[unit]}`;
}
