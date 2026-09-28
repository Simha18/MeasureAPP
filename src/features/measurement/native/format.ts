import type { CapabilityAvailability, MeasurementCapabilityReport, MeasurementMode } from './types';

export const measurementModeLabels: Record<MeasurementMode, string> = {
  ar_depth: 'AR Depth',
  camera_fallback: 'Camera fallback',
  standard_ar: 'Standard AR',
  unavailable: 'Unavailable',
};

export function formatCapabilityAvailability(isAvailable: boolean): Capitalize<CapabilityAvailability> {
  return isAvailable ? 'Available' : 'Unavailable';
}

export function getMeasurementModeLabel(capabilities: MeasurementCapabilityReport) {
  return measurementModeLabels[capabilities.mode];
}
