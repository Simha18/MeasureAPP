import { describe, expect, it } from 'vitest';

import {
  calculatePointDistanceMeters,
  createManualArCuboidMeasurement,
  getDimensionValidation,
} from '../manualCuboidWorkflow';

const deviceCapabilities = {
  hasARCore: true,
  hasARKit: false,
  hasCamera: true,
  hasDepthSensor: false,
  hasLiDAR: false,
  platform: 'android',
  supportsWorldTracking: true,
} as const;

describe('manual cuboid workflow', () => {
  it('calculates 3D distance between selected AR points', () => {
    const distance = calculatePointDistanceMeters(
      { xMeters: 0, yMeters: 0, zMeters: 0 },
      { xMeters: 0.3, yMeters: 0.4, zMeters: 0 },
    );

    expect(distance).toBe(0.5);
  });

  it('rejects identical or unrealistically small point pairs', () => {
    expect(getDimensionValidation(0).isValid).toBe(false);
    expect(getDimensionValidation(0.001).isValid).toBe(false);
  });

  it('creates a completed ARCore cuboid measurement in meters', () => {
    const measurement = createManualArCuboidMeasurement({
      deviceCapabilities,
      dimensions: {
        heightMeters: 0.3,
        lengthMeters: 0.6,
        widthMeters: 0.4,
      },
      id: 'measurement-test',
    });

    expect(measurement.method).toBe('arcore');
    expect(measurement.dimensions.lengthMeters).toBe(0.6);
    expect(measurement.volume.valueCubicMeters).toBe(0.072);
  });
});
