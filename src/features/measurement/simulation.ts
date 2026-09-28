import { createCuboidMeasurement } from './measurementService';
import { mockDeviceCapabilities } from './mockData';
import type { Measurement } from './types';

export const scanStages = [
  {
    instruction: 'Point at the floor or table under the box.',
    label: 'Searching for surface',
    progress: 0.12,
    quality: 'Low',
  },
  {
    instruction: 'Surface found. Keep the package fully visible.',
    label: 'Surface detected',
    progress: 0.28,
    quality: 'Medium',
  },
  {
    instruction: 'Box outline detected. Hold steady.',
    label: 'Object identified',
    progress: 0.46,
    quality: 'Medium',
  },
  {
    instruction: 'Move slowly so all visible corners can be sampled.',
    label: 'Capturing corners',
    progress: 0.68,
    quality: 'Good',
  },
  {
    instruction: 'Calculating length, width, height, and volume.',
    label: 'Measuring dimensions',
    progress: 0.86,
    quality: 'Good',
  },
  {
    instruction: 'Measurement complete. Review the result before saving.',
    label: 'Measurement complete',
    progress: 1,
    quality: 'High',
  },
] as const;

export type ScanStage = (typeof scanStages)[number];

export function createSimulatedCuboidMeasurement(): Measurement {
  const measuredAt = new Date().toISOString();

  return createCuboidMeasurement({
    confidence: {
      factors: ['Simulated surface lock', 'Simulated corner capture', 'Known POC dimensions'],
      level: 'high',
      score: 0.96,
    },
    deviceCapabilities: mockDeviceCapabilities,
    height: 0.3,
    id: `measurement-${Date.now()}`,
    length: 0.6,
    measuredAt,
    measurementUnit: 'meter',
    method: 'mock',
    snapshot: {
      capturedAt: measuredAt,
      uri: 'mock-camera-preview',
    },
    width: 0.4,
  });
}
