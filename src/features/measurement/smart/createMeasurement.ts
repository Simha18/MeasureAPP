import type { DeviceCapabilities, Measurement, MeasurementModel, MeasurementShape } from '../types';
import { formulas, type regularGeometry } from './geometry';

export function createSmartMeasurement(input: {
  shape: MeasurementShape;
  geometry: ReturnType<typeof regularGeometry>;
  source: MeasurementModel['source'];
  capabilities: DeviceCapabilities;
  sections?: MeasurementModel['sections'];
  quality?: number;
}): Measurement {
  const assumptions = [
    input.shape === 'sectioned'
      ? 'Approximation between sampled horizontal outlines. Capture the lowest and highest surfaces and extra outlines wherever the shape changes. Unseen cavities and unsampled detail are excluded.'
      : input.shape === 'polygon_prism'
        ? 'Assumes a solid object with vertical sides and a constant outline over its full height. Holes are not subtracted.'
        : 'Assumes a solid object matching the selected geometric shape. Empty space inside the exterior is included.',
    input.source === 'reference_photo'
      ? 'Each measured edge and its reference must lie in the same plane, facing the camera straight on. Perspective, lens distortion and misplaced endpoints affect scale.'
      : input.source === 'ar_points'
        ? 'AR tracking quality is not an accuracy guarantee. Surface hits may land behind an object; check the model and validate against a known physical measurement.'
        : 'Calculated from dimensions you entered; input accuracy has not been verified.',
  ];
  const score = input.source === 'ar_points' && Number.isFinite(input.quality)
    ? Math.min(input.shape === 'sectioned' ? 0.65 : 0.85, Math.max(0, input.quality!)) : 0;
  return {
    id: `volume-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    measuredAt: new Date().toISOString(), shape: input.shape, objectType: input.shape === 'cuboid' ? 'box' : 'object',
    method: input.source === 'ar_points' ? input.capabilities.platform === 'ios' ? 'arkit' : 'arcore'
      : input.source === 'reference_photo' ? 'camera' : 'manual',
    deviceCapabilities: input.capabilities, measurementUnit: 'meter', dimensions: input.geometry.dimensions,
    volume: { unit: 'cubic_meter', valueCubicMeters: input.geometry.volume }, status: 'completed',
    confidence: { score, level: score >= 0.8 ? 'high' : score >= 0.5 ? 'medium' : 'low', factors: assumptions },
    model: { assumptions, source: input.source, formula: formulas[input.shape], sections: input.sections },
  };
}
