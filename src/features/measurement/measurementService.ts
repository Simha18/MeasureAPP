import { assertFiniteNumber, assertPositive, roundValue, toMeters } from './conversions';
import type {
  CuboidMeasurementInput,
  Measurement,
  MeasurementConfidence,
  MeasurementDimensions,
  MeasurementUnit,
  VolumeMeasurement,
} from './types';

const defaultConfidence: MeasurementConfidence = {
  factors: ['Mock data for visual verification'],
  level: 'high',
  score: 0.95,
};

function assertConfidence(confidence: MeasurementConfidence) {
  assertFiniteNumber(confidence.score, 'confidence.score');

  if (confidence.score < 0 || confidence.score > 1) {
    throw new RangeError('confidence.score must be between 0 and 1.');
  }
}

export function createCuboidDimensions(
  length: number,
  width: number,
  height: number,
  unit: MeasurementUnit,
): MeasurementDimensions {
  assertPositive(length, 'length');
  assertPositive(width, 'width');
  assertPositive(height, 'height');

  return {
    heightMeters: toMeters(height, unit),
    lengthMeters: toMeters(length, unit),
    unit: 'meter',
    widthMeters: toMeters(width, unit),
  };
}

export function calculateCuboidVolume(dimensions: MeasurementDimensions): VolumeMeasurement {
  assertPositive(dimensions.lengthMeters, 'lengthMeters');
  assertPositive(dimensions.widthMeters, 'widthMeters');
  assertPositive(dimensions.heightMeters, 'heightMeters');

  return {
    unit: 'cubic_meter',
    valueCubicMeters: roundValue(
      dimensions.lengthMeters * dimensions.widthMeters * dimensions.heightMeters,
      12,
    ),
  };
}

export function createCuboidMeasurement(input: CuboidMeasurementInput): Measurement {
  const confidence = input.confidence ?? defaultConfidence;
  assertConfidence(confidence);

  const dimensions = createCuboidDimensions(
    input.length,
    input.width,
    input.height,
    input.measurementUnit,
  );

  return {
    confidence,
    deviceCapabilities: input.deviceCapabilities,
    dimensions,
    id: input.id,
    measuredAt: input.measuredAt,
    measurementUnit: input.measurementUnit,
    method: input.method,
    objectType: input.objectType ?? 'box',
    scanSessionId: input.scanSessionId,
    shape: 'cuboid',
    snapshot: input.snapshot,
    status: input.status ?? 'completed',
    volume: calculateCuboidVolume(dimensions),
  };
}
