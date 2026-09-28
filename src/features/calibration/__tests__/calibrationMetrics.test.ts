import { describe, expect, it } from 'vitest';

import { createCuboidMeasurement } from '../../measurement/measurementService';
import type { DeviceCapabilities } from '../../measurement/types';
import {
  calculateCalibrationSummary,
  createCalibrationTestResult,
  sortCalibrationResultsNewestFirst,
} from '../calibrationMetrics';

const deviceCapabilities: DeviceCapabilities = {
  hasARCore: false,
  hasARKit: true,
  hasCamera: true,
  hasDepthSensor: true,
  hasLiDAR: true,
  platform: 'ios',
  supportsWorldTracking: true,
};

describe('calibration metrics', () => {
  it('compares measured values against known physical dimensions', () => {
    const measurement = createCuboidMeasurement({
      confidence: {
        level: 'high',
        score: 0.9,
      },
      deviceCapabilities,
      height: 0.33,
      id: 'measurement-1',
      length: 0.66,
      measuredAt: '2026-09-04T08:00:00.000Z',
      measurementUnit: 'meter',
      method: 'arkit',
      objectType: 'box',
      width: 0.44,
    });

    const result = createCalibrationTestResult({
      actualHeightMeters: 0.3,
      actualLengthMeters: 0.6,
      actualWidthMeters: 0.4,
      createdAt: '2026-09-04T09:00:00.000Z',
      id: 'calibration-1',
      measurement,
    });

    expect(result.actualVolumeCubicMeters).toBeCloseTo(0.072);
    expect(result.measuredVolumeCubicMeters).toBeCloseTo(0.095832);
    expect(result.lengthAbsoluteErrorMeters).toBeCloseTo(0.06);
    expect(result.widthAbsoluteErrorMeters).toBeCloseTo(0.04);
    expect(result.heightAbsoluteErrorMeters).toBeCloseTo(0.03);
    expect(result.lengthPercentageError).toBeCloseTo(10);
    expect(result.widthPercentageError).toBeCloseTo(10);
    expect(result.heightPercentageError).toBeCloseTo(10);
    expect(result.volumePercentageError).toBeCloseTo(33.1);
  });

  it('rejects zero or negative known dimensions', () => {
    const measurement = createCuboidMeasurement({
      deviceCapabilities,
      height: 0.3,
      id: 'measurement-2',
      length: 0.6,
      measuredAt: '2026-09-04T08:00:00.000Z',
      measurementUnit: 'meter',
      method: 'manual',
      width: 0.4,
    });

    expect(() =>
      createCalibrationTestResult({
        actualHeightMeters: 0.3,
        actualLengthMeters: 0,
        actualWidthMeters: 0.4,
        createdAt: '2026-09-04T09:00:00.000Z',
        id: 'calibration-2',
        measurement,
      }),
    ).toThrow(RangeError);
  });

  it('summarizes tests and identifies best and worst results', () => {
    const first = createResult('first', 0.6, '2026-09-04T08:00:00.000Z');
    const second = createResult('second', 0.63, '2026-09-04T09:00:00.000Z');
    const summary = calculateCalibrationSummary([first, second]);

    expect(summary.numberOfTests).toBe(2);
    expect(summary.bestResult?.id).toBe('first');
    expect(summary.worstResult?.id).toBe('second');
    expect(summary.meanAbsoluteLengthErrorMeters).toBeCloseTo(0.015);
    expect(summary.meanPercentageError).toBeGreaterThan(0);
  });

  it('sorts calibration results newest first', () => {
    const older = createResult('older', 0.6, '2026-09-04T08:00:00.000Z');
    const newer = createResult('newer', 0.6, '2026-09-04T09:00:00.000Z');

    expect(sortCalibrationResultsNewestFirst([older, newer]).map((result) => result.id)).toEqual([
      'newer',
      'older',
    ]);
  });
});

function createResult(id: string, measuredLength: number, createdAt: string) {
  return createCalibrationTestResult({
    actualHeightMeters: 0.3,
    actualLengthMeters: 0.6,
    actualWidthMeters: 0.4,
    createdAt,
    id,
    measurement: createCuboidMeasurement({
      deviceCapabilities,
      height: 0.3,
      id: `measurement-${id}`,
      length: measuredLength,
      measuredAt: createdAt,
      measurementUnit: 'meter',
      method: 'manual',
      width: 0.4,
    }),
  });
}
