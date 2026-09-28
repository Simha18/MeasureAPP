import { describe, expect, it } from 'vitest';

import {
  calculateMeasurementQualityScore,
  calculateSampleVarianceMetersSquared,
  getMeasurementQualityLevel,
  median,
  medianWorldPoint,
  smoothWorldPointSamples,
  type WorldPointSample,
} from '../sampleSmoothing';

function createSample(
  xMeters: number,
  yMeters: number,
  zMeters: number,
  overrides: Partial<WorldPointSample> = {},
): WorldPointSample {
  return {
    depthAvailable: true,
    depthConfidence: 0.9,
    depthMeters: 1.25,
    source: 'depth_point',
    trackingQuality: 1,
    trackingState: 'tracking',
    x: xMeters,
    xMeters,
    y: yMeters,
    yMeters,
    z: zMeters,
    zMeters,
    ...overrides,
  };
}

describe('sample smoothing', () => {
  it('calculates medians for scalar values and world points', () => {
    expect(median([3, 1, 100, 2, 4])).toBe(3);
    expect(median([1, 3, 2, 4])).toBe(2.5);

    expect(
      medianWorldPoint([
        createSample(0, 0, 0),
        createSample(0.02, 0.01, 0),
        createSample(2, 2, 2),
      ]),
    ).toMatchObject({
      xMeters: 0.02,
      yMeters: 0.01,
      zMeters: 0,
    });
  });

  it('rejects invalid depth, non-tracking frames, extreme jumps, and outliers', () => {
    const result = smoothWorldPointSamples([
      createSample(0, 0, 0),
      createSample(0.01, 0, 0),
      createSample(0.012, 0.002, 0),
      createSample(0.011, 0.001, 0),
      createSample(0.013, 0, 0),
      createSample(0.4, 0.4, 0.4),
      createSample(0.015, 0, 0, { depthMeters: 0 }),
      createSample(0.016, 0, 0, { trackingState: 'limited' }),
      createSample(0.2, 0.2, 0.2),
    ]);

    expect(result).toBeDefined();
    expect(result?.acceptedSamples).toHaveLength(5);
    expect(result?.discardedSamples.map((sample) => sample.reason)).toEqual(
      expect.arrayContaining(['invalid_depth', 'non_tracking_frame', 'extreme_jump']),
    );
    expect(result?.finalPoint.xMeters).toBeCloseTo(0.011, 3);
  });

  it('reports low quality for noisy or under-sampled point sets', () => {
    const stableResult = smoothWorldPointSamples([
      createSample(0, 0, 0),
      createSample(0.002, 0.001, 0),
      createSample(0.001, 0, 0.001),
      createSample(0.003, 0, 0),
      createSample(0.0015, 0.0005, 0),
      createSample(0.0025, 0.001, 0),
      createSample(0.001, 0.0003, 0),
      createSample(0.0022, 0.0004, 0),
    ]);
    const noisyResult = smoothWorldPointSamples(
      [
        createSample(0, 0, 0, { depthAvailable: false, depthConfidence: undefined, trackingQuality: 0.4 }),
        createSample(0.08, 0.03, 0, { depthAvailable: false, depthConfidence: undefined, trackingQuality: 0.4 }),
        createSample(0.11, 0.01, 0.03, { depthAvailable: false, depthConfidence: undefined, trackingQuality: 0.4 }),
      ],
      { minimumAcceptedSamples: 2 },
    );

    expect(stableResult?.qualityLevel).toBe('HIGH');
    expect(noisyResult?.qualityLevel).toBe('LOW');
  });

  it('scores quality from tracking, samples, variance, depth, and plane signals', () => {
    const highScore = calculateMeasurementQualityScore({
      acceptedSampleCount: 8,
      depthAvailable: true,
      depthConfidence: 0.95,
      depthConsistency: 0.95,
      planeStability: 1,
      sampleVarianceMetersSquared: 0.00001,
      trackingQuality: 1,
    });
    const lowScore = calculateMeasurementQualityScore({
      acceptedSampleCount: 1,
      depthAvailable: false,
      planeStability: 0.3,
      sampleVarianceMetersSquared: 0.02,
      trackingQuality: 0.25,
    });

    expect(highScore).toBeGreaterThan(0.9);
    expect(getMeasurementQualityLevel(highScore)).toBe('HIGH');
    expect(lowScore).toBeLessThan(0.5);
    expect(getMeasurementQualityLevel(lowScore)).toBe('LOW');
  });

  it('calculates variance relative to the robust center point', () => {
    const variance = calculateSampleVarianceMetersSquared([
      createSample(1, 1, 1),
      createSample(1.01, 1, 1),
      createSample(0.99, 1, 1),
    ]);

    expect(variance).toBeGreaterThan(0);
    expect(variance).toBeLessThan(0.0001);
  });
});
