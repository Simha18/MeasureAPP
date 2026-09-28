import { describe, expect, it } from 'vitest';

import {
  createAssistedCuboidObservation,
  estimateAssistedCuboidFromObservations,
  getAssistedCuboidCornerScreenPoints,
  type AssistedCuboidCornerCandidate,
  type AssistedCuboidCornerRole,
} from '../assistedCuboidEstimation';

const roles: AssistedCuboidCornerRole[] = [
  'front_top_left',
  'front_top_right',
  'front_bottom_left',
  'front_bottom_right',
  'back_top_left',
  'back_top_right',
  'back_bottom_left',
  'back_bottom_right',
];

function createCuboidCandidates(input: {
  height?: number;
  length?: number;
  offset?: number;
  skewHeightX?: number;
  width?: number;
}): AssistedCuboidCornerCandidate[] {
  const length = input.length ?? 0.6;
  const width = input.width ?? 0.4;
  const height = input.height ?? 0.3;
  const offset = input.offset ?? 0;
  const skewHeightX = input.skewHeightX ?? 0;
  const points: Record<AssistedCuboidCornerRole, { xMeters: number; yMeters: number; zMeters: number }> = {
    back_bottom_left: { xMeters: offset, yMeters: 0, zMeters: width },
    back_bottom_right: { xMeters: offset + length, yMeters: 0, zMeters: width },
    back_top_left: { xMeters: offset + skewHeightX, yMeters: height, zMeters: width },
    back_top_right: { xMeters: offset + length + skewHeightX, yMeters: height, zMeters: width },
    front_bottom_left: { xMeters: offset, yMeters: 0, zMeters: 0 },
    front_bottom_right: { xMeters: offset + length, yMeters: 0, zMeters: 0 },
    front_top_left: { xMeters: offset + skewHeightX, yMeters: height, zMeters: 0 },
    front_top_right: { xMeters: offset + length + skewHeightX, yMeters: height, zMeters: 0 },
  };

  return roles.map((role, index) => ({
    detectionConfidence: 0.82,
    role,
    screenPoint: {
      x: index * 10,
      y: index * 12,
    },
    worldPoint: points[role],
    pointQuality: {
      depthAvailable: true,
      measurementConfidence: 0.86,
      qualityLevel: 'HIGH',
      trackingQuality: 0.9,
    },
  }));
}

function createObservation(input: Parameters<typeof createCuboidCandidates>[0]) {
  return createAssistedCuboidObservation({
    candidates: createCuboidCandidates(input),
    detectionConfidence: 0.82,
    detectionId: `detection-${input.offset ?? 0}-${input.length ?? 0.6}`,
    observedAt: '2026-09-01T00:00:00.000Z',
    trackingState: 'tracking',
  });
}

describe('assisted cuboid estimation', () => {
  it('maps semantic detection keypoints into screen points', () => {
    const detection = {
      boundingBox: { height: 0.4, width: 0.6, x: 0.2, y: 0.3 },
      category: 'box',
      confidence: 0.8,
      detectedAt: '2026-09-01T00:00:00.000Z',
      frameId: 'frame-1',
      id: 'box-1',
      keypoints: [
        { id: 'front_top_left', x: 0.25, y: 0.3 },
        { id: 'front_top_right', x: 0.75, y: 0.3 },
        { id: 'front_bottom_left', x: 0.25, y: 0.7 },
        { id: 'front_bottom_right', x: 0.75, y: 0.7 },
        { id: 'back_top_left', x: 0.36, y: 0.24 },
        { id: 'back_bottom_left', x: 0.36, y: 0.62 },
      ],
      source: 'mock',
    };

    const screenPoints = getAssistedCuboidCornerScreenPoints(detection, {
      height: 800,
      width: 400,
    });

    const frontTopLeft = screenPoints.find((screenPoint) => screenPoint.role === 'front_top_left');

    expect(screenPoints).toHaveLength(6);
    expect(frontTopLeft).toMatchObject({
      role: 'front_top_left',
      screenPoint: { x: 100, y: 240 },
    });
  });

  it('infers rear corner hints from a detected visible face', () => {
    const detection = {
      boundingBox: { height: 0.4, width: 0.6, x: 0.2, y: 0.3 },
      category: 'box',
      confidence: 0.8,
      detectedAt: '2026-09-01T00:00:00.000Z',
      frameId: 'frame-1',
      id: 'box-face-1',
      keypoints: [
        { id: 'top_left', x: 0.25, y: 0.3 },
        { id: 'top_right', x: 0.75, y: 0.3 },
        { id: 'bottom_left', x: 0.25, y: 0.7 },
        { id: 'bottom_right', x: 0.75, y: 0.7 },
      ],
      source: 'native',
    };

    const screenPoints = getAssistedCuboidCornerScreenPoints(detection, {
      height: 800,
      width: 400,
    });
    const backTopLeft = screenPoints.find((screenPoint) => screenPoint.role === 'back_top_left');

    expect(screenPoints).toHaveLength(8);
    expect(backTopLeft?.inferred).toBe(true);
    expect(backTopLeft?.screenPoint.y).toBeLessThan(240);
  });

  it('requires multiple stable observations before returning a cuboid', () => {
    const estimate = estimateAssistedCuboidFromObservations([createObservation({})]);

    expect(estimate.status).toBe('collecting');
    expect(estimate.dimensions).toBeUndefined();
  });

  it('returns a best-fit cuboid from repeated orthogonal observations', () => {
    const estimate = estimateAssistedCuboidFromObservations([
      createObservation({ offset: 0 }),
      createObservation({ length: 0.604, offset: 0.002 }),
      createObservation({ height: 0.301, offset: -0.001, width: 0.397 }),
    ]);

    expect(estimate.status).toBe('ready');
    expect(estimate.dimensions?.lengthMeters).toBeCloseTo(0.6, 2);
    expect(estimate.dimensions?.widthMeters).toBeCloseTo(0.4, 2);
    expect(estimate.dimensions?.heightMeters).toBeCloseTo(0.3, 2);
    expect(estimate.volumeCubicMeters).toBeCloseTo(0.072, 3);
    expect(estimate.confidence.score).toBeGreaterThan(0.58);
  });

  it('rejects geometry that does not form right angles', () => {
    const observation = createObservation({ skewHeightX: 0.24 });

    expect(observation.geometry.isValid).toBe(false);
    expect(observation.geometry.reasons).toContain('Visible edges do not form stable right angles.');
  });

  it('does not fabricate a result from unstable dimensions', () => {
    const estimate = estimateAssistedCuboidFromObservations([
      createObservation({ length: 0.6 }),
      createObservation({ length: 0.78 }),
      createObservation({ length: 0.51 }),
    ]);

    expect(estimate.status).toBe('insufficient_confidence');
    expect(estimate.dimensions).toBeUndefined();
  });

  it('rejects observations without enough projected AR/depth corners', () => {
    const observation = createAssistedCuboidObservation({
      candidates: createCuboidCandidates({}).slice(0, 4),
      detectionConfidence: 0.82,
      detectionId: 'partial-cuboid',
      observedAt: '2026-09-01T00:00:00.000Z',
      trackingState: 'tracking',
    });
    const estimate = estimateAssistedCuboidFromObservations([
      observation,
      observation,
      observation,
    ]);

    expect(estimate.status).toBe('collecting');
    expect(estimate.reasons).toContain('Move slowly around the box until more stable corner observations are available.');
    expect(estimate.confidence.factors).toContain('Need more detected corners projected into AR/depth space.');
  });
});
