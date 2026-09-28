import { describe, expect, it } from 'vitest';

import {
  getObjectDetectionStatus,
  shouldRunObjectDetection,
} from '../objectDetectionService';
import type { ObjectDetectionResult } from '../types';

const detectionResult: ObjectDetectionResult = {
  boundingBox: {
    height: 0.4,
    width: 0.6,
    x: 0.2,
    y: 0.3,
  },
  category: 'box',
  confidence: 0.7,
  detectedAt: '2026-08-31T00:00:00.000Z',
  frameId: 'frame-test',
  id: 'detection-test',
  source: 'mock',
};

describe('object detection service', () => {
  it('throttles detection while another run is active', () => {
    expect(
      shouldRunObjectDetection({
        isDetecting: true,
        now: 1500,
      }),
    ).toBe(false);
  });

  it('runs when no previous run exists or the interval has elapsed', () => {
    expect(
      shouldRunObjectDetection({
        isDetecting: false,
        now: 1000,
      }),
    ).toBe(true);
    expect(
      shouldRunObjectDetection({
        intervalMs: 1200,
        isDetecting: false,
        lastRunAt: 1000,
        now: 2199,
      }),
    ).toBe(false);
    expect(
      shouldRunObjectDetection({
        intervalMs: 1200,
        isDetecting: false,
        lastRunAt: 1000,
        now: 2200,
      }),
    ).toBe(true);
  });

  it('maps detection confidence to ready or low-confidence status', () => {
    expect(getObjectDetectionStatus(detectionResult, 0.55)).toBe('ready');
    expect(getObjectDetectionStatus({ ...detectionResult, confidence: 0.42 }, 0.55)).toBe(
      'low_confidence',
    );
    expect(getObjectDetectionStatus(undefined, 0.55)).toBe('idle');
  });
});
