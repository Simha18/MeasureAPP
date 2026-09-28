import { describe, expect, it } from 'vitest';

import { createCuboidMeasurement } from '../../measurement/measurementService';
import type { DeviceCapabilities } from '../../measurement/types';

import {
  historyRecordToMeasurement,
  measurementToHistoryRecord,
  normalizeHistoryRecord,
  sortHistoryNewestFirst,
} from '../measurementHistoryMappers';
import type { MeasurementHistoryRecord } from '../types';

const deviceCapabilities: DeviceCapabilities = {
  hasARCore: false,
  hasARKit: true,
  hasCamera: true,
  hasDepthSensor: true,
  hasLiDAR: true,
  platform: 'ios',
  supportsWorldTracking: true,
};

describe('measurement history repository helpers', () => {
  it('flattens a measurement into the local history schema', () => {
    const measurement = createCuboidMeasurement({
      confidence: {
        factors: ['Stable cuboid fit'],
        level: 'high',
        score: 0.91,
      },
      deviceCapabilities,
      height: 0.3,
      id: 'measurement-1',
      length: 0.6,
      measuredAt: '2026-09-04T08:00:00.000Z',
      measurementUnit: 'meter',
      method: 'arkit',
      objectType: 'carton',
      snapshot: {
        capturedAt: '2026-09-04T08:00:00.000Z',
        height: 720,
        uri: 'file:///local/snapshot.jpg',
        width: 960,
      },
      width: 0.4,
    });

    expect(
      measurementToHistoryRecord(measurement, {
        preferredLengthUnit: 'centimeter',
        preferredVolumeUnit: 'liter',
      }),
    ).toEqual({
      shape: 'cuboid',
      model: undefined,
      confidence: measurement.confidence,
      createdAt: '2026-09-04T08:00:00.000Z',
      depthSupported: true,
      heightMeters: 0.3,
      id: 'measurement-1',
      lengthMeters: 0.6,
      lidarSupported: true,
      measurementMethod: 'arkit',
      objectType: 'carton',
      platform: 'ios',
      preferredLengthUnit: 'centimeter',
      preferredVolumeUnit: 'liter',
      snapshotHeight: 720,
      snapshotUri: 'file:///local/snapshot.jpg',
      snapshotWidth: 960,
      volumeCubicMeters: 0.072,
      widthMeters: 0.4,
    });
  });

  it('sorts saved history newest first', () => {
    const older = createHistoryRecord('older', '2026-09-04T08:00:00.000Z');
    const newer = createHistoryRecord('newer', '2026-09-04T09:00:00.000Z');

    expect(sortHistoryNewestFirst([older, newer]).map((record) => record.id)).toEqual([
      'newer',
      'older',
    ]);
  });

  it('rehydrates a history record for existing result UI compatibility', () => {
    const record = createHistoryRecord('measurement-2', '2026-09-04T10:00:00.000Z');
    const measurement = historyRecordToMeasurement(record);

    expect(measurement.id).toBe(record.id);
    expect(measurement.measuredAt).toBe(record.createdAt);
    expect(measurement.objectType).toBe(record.objectType);
    expect(measurement.dimensions.lengthMeters).toBe(record.lengthMeters);
    expect(measurement.volume.valueCubicMeters).toBe(record.volumeCubicMeters);
    expect(measurement.snapshot?.uri).toBe(record.snapshotUri);
  });

  it('rejects malformed stored records', () => {
    expect(normalizeHistoryRecord({ id: 'missing-dimensions' })).toBeUndefined();
    expect(normalizeHistoryRecord('not-json')).toBeUndefined();
  });
});

function createHistoryRecord(id: string, createdAt: string): MeasurementHistoryRecord {
  return {
    confidence: {
      level: 'medium',
      score: 0.7,
    },
    createdAt,
    depthSupported: true,
    heightMeters: 0.3,
    id,
    lengthMeters: 0.6,
    lidarSupported: false,
    measurementMethod: 'manual',
    objectType: 'box',
    platform: 'ios',
    preferredLengthUnit: 'meter',
    preferredVolumeUnit: 'liter',
    snapshotUri: 'file:///snapshot.jpg',
    volumeCubicMeters: 0.072,
    widthMeters: 0.4,
  };
}
