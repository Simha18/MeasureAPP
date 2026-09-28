import type { Measurement } from '../measurement';

import type { CalibrationSummary, CalibrationTestResult } from './types';

export type CreateCalibrationTestResultInput = {
  actualHeightMeters: number;
  actualLengthMeters: number;
  actualWidthMeters: number;
  createdAt: string;
  id: string;
  measurement: Measurement;
};

function assertPositive(value: number, fieldName: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${fieldName} must be greater than zero.`);
  }
}

function percentageError(measured: number, actual: number) {
  return (Math.abs(measured - actual) / actual) * 100;
}

function mean(values: number[]) {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}

export function createCalibrationTestResult(
  input: CreateCalibrationTestResultInput,
): CalibrationTestResult {
  assertPositive(input.actualLengthMeters, 'actualLengthMeters');
  assertPositive(input.actualWidthMeters, 'actualWidthMeters');
  assertPositive(input.actualHeightMeters, 'actualHeightMeters');

  const actualVolumeCubicMeters =
    input.actualLengthMeters * input.actualWidthMeters * input.actualHeightMeters;
  const measuredLengthMeters = input.measurement.dimensions.lengthMeters;
  const measuredWidthMeters = input.measurement.dimensions.widthMeters;
  const measuredHeightMeters = input.measurement.dimensions.heightMeters;
  const measuredVolumeCubicMeters = input.measurement.volume.valueCubicMeters;
  const lengthAbsoluteErrorMeters = Math.abs(measuredLengthMeters - input.actualLengthMeters);
  const widthAbsoluteErrorMeters = Math.abs(measuredWidthMeters - input.actualWidthMeters);
  const heightAbsoluteErrorMeters = Math.abs(measuredHeightMeters - input.actualHeightMeters);
  const volumeAbsoluteErrorCubicMeters = Math.abs(
    measuredVolumeCubicMeters - actualVolumeCubicMeters,
  );
  const lengthPercentageError = percentageError(measuredLengthMeters, input.actualLengthMeters);
  const widthPercentageError = percentageError(measuredWidthMeters, input.actualWidthMeters);
  const heightPercentageError = percentageError(measuredHeightMeters, input.actualHeightMeters);
  const volumePercentageError = percentageError(measuredVolumeCubicMeters, actualVolumeCubicMeters);

  return {
    actualHeightMeters: input.actualHeightMeters,
    actualLengthMeters: input.actualLengthMeters,
    actualVolumeCubicMeters,
    actualWidthMeters: input.actualWidthMeters,
    confidence: input.measurement.confidence,
    createdAt: input.createdAt,
    depthSupported: input.measurement.deviceCapabilities.hasDepthSensor,
    heightAbsoluteErrorMeters,
    heightPercentageError,
    id: input.id,
    lengthAbsoluteErrorMeters,
    lengthPercentageError,
    lidarSupported: input.measurement.deviceCapabilities.hasLiDAR,
    measuredHeightMeters,
    measuredLengthMeters,
    measuredVolumeCubicMeters,
    measuredWidthMeters,
    measurementId: input.measurement.id,
    measurementMethod: input.measurement.method,
    objectType: input.measurement.objectType,
    overallMeanPercentageError: mean([
      lengthPercentageError,
      widthPercentageError,
      heightPercentageError,
      volumePercentageError,
    ]),
    platform: input.measurement.deviceCapabilities.platform,
    volumeAbsoluteErrorCubicMeters,
    volumePercentageError,
    widthAbsoluteErrorMeters,
    widthPercentageError,
  };
}

export function calculateCalibrationSummary(
  results: CalibrationTestResult[],
): CalibrationSummary {
  const sortedByAccuracy = [...results].sort(
    (left, right) => left.overallMeanPercentageError - right.overallMeanPercentageError,
  );

  return {
    bestResult: sortedByAccuracy[0],
    meanAbsoluteHeightErrorMeters: mean(results.map((result) => result.heightAbsoluteErrorMeters)),
    meanAbsoluteLengthErrorMeters: mean(results.map((result) => result.lengthAbsoluteErrorMeters)),
    meanAbsoluteVolumeErrorCubicMeters: mean(
      results.map((result) => result.volumeAbsoluteErrorCubicMeters),
    ),
    meanAbsoluteWidthErrorMeters: mean(results.map((result) => result.widthAbsoluteErrorMeters)),
    meanPercentageError: mean(results.map((result) => result.overallMeanPercentageError)),
    numberOfTests: results.length,
    worstResult: sortedByAccuracy.at(-1),
  };
}

export function sortCalibrationResultsNewestFirst(results: CalibrationTestResult[]) {
  return [...results].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}
