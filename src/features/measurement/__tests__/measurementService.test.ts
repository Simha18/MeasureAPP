import { describe, expect, it } from 'vitest';

import { convertVolume } from '../conversions';
import {
  calculateCuboidVolume,
  createCuboidDimensions,
  createCuboidMeasurement,
} from '../measurementService';
import type { DeviceCapabilities } from '../types';

const deviceCapabilities: DeviceCapabilities = {
  hasARCore: false,
  hasARKit: false,
  hasCamera: true,
  hasDepthSensor: false,
  hasLiDAR: false,
  platform: 'unknown',
  supportsWorldTracking: false,
};

describe('cuboid measurement service', () => {
  it('normalizes cuboid dimensions to meters', () => {
    const dimensions = createCuboidDimensions(60, 40, 30, 'centimeter');

    expect(dimensions).toEqual({
      heightMeters: 0.3,
      lengthMeters: 0.6,
      unit: 'meter',
      widthMeters: 0.4,
    });
  });

  it('calculates cuboid volume in canonical cubic meters', () => {
    const dimensions = createCuboidDimensions(0.6, 0.4, 0.3, 'meter');
    const volume = calculateCuboidVolume(dimensions);

    expect(volume).toEqual({
      unit: 'cubic_meter',
      valueCubicMeters: 0.072,
    });
    expect(convertVolume(volume.valueCubicMeters, volume.unit, 'liter')).toBe(72);
  });

  it('creates a strongly typed cuboid measurement aggregate', () => {
    const measurement = createCuboidMeasurement({
      confidence: {
        level: 'high',
        score: 0.98,
      },
      deviceCapabilities,
      height: 0.3,
      id: 'measurement-test',
      length: 0.6,
      measuredAt: '2026-08-30T16:10:00.000Z',
      measurementUnit: 'meter',
      method: 'mock',
      width: 0.4,
    });

    expect(measurement.shape).toBe('cuboid');
    expect(measurement.status).toBe('completed');
    expect(measurement.volume.valueCubicMeters).toBe(0.072);
  });

  it('rejects invalid cuboid dimensions and confidence scores', () => {
    expect(() => createCuboidDimensions(-0.6, 0.4, 0.3, 'meter')).toThrow(RangeError);
    expect(() => createCuboidDimensions(0, 0.4, 0.3, 'meter')).toThrow(RangeError);
    expect(() =>
      createCuboidMeasurement({
        confidence: {
          level: 'high',
          score: 1.1,
        },
        deviceCapabilities,
        height: 0.3,
        id: 'measurement-test',
        length: 0.6,
        measuredAt: '2026-08-30T16:10:00.000Z',
        measurementUnit: 'meter',
        method: 'mock',
        width: 0.4,
      }),
    ).toThrow(RangeError);
  });
});
