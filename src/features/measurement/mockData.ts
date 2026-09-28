import { createCuboidMeasurement } from './measurementService';
import {
  createUnavailableMeasurementCapabilities,
  toDeviceCapabilities,
} from './native/capabilities';
import type { DeviceCapabilities, ScanSession } from './types';

export const mockMeasurementCapabilities = createUnavailableMeasurementCapabilities();

export const mockDeviceCapabilities: DeviceCapabilities = toDeviceCapabilities(mockMeasurementCapabilities);

export const mockScanSession: ScanSession = {
  completedAt: '2026-08-30T16:10:00.000Z',
  deviceCapabilities: mockDeviceCapabilities,
  id: 'scan-session-mock-cuboid-001',
  measurementId: 'measurement-mock-cuboid-001',
  method: 'mock',
  planes: [],
  points: [],
  startedAt: '2026-08-30T16:09:30.000Z',
  status: 'completed',
};

export const mockCuboidMeasurement = createCuboidMeasurement({
  confidence: {
    factors: ['Known cuboid dimensions', 'Mock session data'],
    level: 'high',
    score: 0.98,
  },
  deviceCapabilities: mockDeviceCapabilities,
  height: 0.3,
  id: 'measurement-mock-cuboid-001',
  length: 0.6,
  measuredAt: '2026-08-30T16:10:00.000Z',
  measurementUnit: 'meter',
  method: 'mock',
  scanSessionId: mockScanSession.id,
  width: 0.4,
});
