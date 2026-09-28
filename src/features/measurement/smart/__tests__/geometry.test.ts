import { describe, expect, it } from 'vitest';
import { horizontalSection, polygonArea, prismGeometry, referenceDistance, regularArGeometry, regularGeometry, sectionedGeometry } from '../geometry';
import { createSmartMeasurement } from '../createMeasurement';
import { historyRecordToMeasurement, measurementToHistoryRecord, normalizeHistoryRecord } from '../../../history/measurementHistoryMappers';
import type { WorldPoint3D } from '../../types';

const section = (y: number, scale = 1): WorldPoint3D[] => [[0, 0], [2, 0], [2, 3], [0, 3]].map(([x, z]) => ({ xMeters: x * scale, yMeters: y, zMeters: z * scale }));
const capabilities = { hasARCore: false, hasARKit: false, hasCamera: true, hasDepthSensor: false, hasLiDAR: false, supportsWorldTracking: false, platform: 'android' as const };
describe('physical shape volumes', () => {
  it.each([
    ['cuboid', [2, 3, 4], 24], ['cylinder', [2, 3], 3 * Math.PI], ['sphere', [2], 4 * Math.PI / 3],
    ['cone', [2, 3], Math.PI], ['ellipsoid', [2, 4, 6], 8 * Math.PI],
  ] as const)('calculates %s from full dimensions, not radii', (shape, values, expected) => {
    expect(regularGeometry(shape, [...values]).volume).toBeCloseTo(expected, 10);
  });
  it.each([0, -1, NaN, Infinity])('rejects invalid input %s', value => {
    expect(() => regularGeometry('sphere', [value])).toThrow();
  });
  it('rejects missing dimensions and overflow', () => {
    expect(() => regularGeometry('cuboid', [2, 3])).toThrow();
    expect(() => regularGeometry('sphere', [1e200])).toThrow();
  });
  it('retains small physical volumes', () => {
    expect(regularGeometry('cuboid', [0.01, 0.01, 0.01]).volume).toBeCloseTo(0.000001, 12);
  });
});

describe('walk-around geometry', () => {
  it('accepts shared corners for perpendicular AR dimensions', () => {
    const points = [[0, 0, 0], [2, 0, 0], [2, 0, 0], [2, 0, 3], [2, 0, 3], [2, 4, 3]]
      .map(([xMeters, yMeters, zMeters]) => ({ xMeters, yMeters, zMeters }));
    expect(regularArGeometry('cuboid', points).volume).toBe(24);
  });
  it('allows realistic AR endpoint noise while keeping dimension axes distinct', () => {
    const points = [
      [0, 0, 0], [2, 0.2, 0.1],
      [0, 0, 0], [0.35, 3, 0.2],
      [0, 0, 0], [0.2, 0.3, 4],
    ].map(([xMeters, yMeters, zMeters]) => ({ xMeters, yMeters, zMeters }));

    expect(regularArGeometry('cuboid', points).volume).toBeGreaterThan(24);
  });
  it('rejects collapsed anchors and a cylinder height measured along its diameter', () => {
    const point = (xMeters: number, yMeters = 0) => ({ xMeters, yMeters, zMeters: 0 });
    expect(() => regularArGeometry('sphere', [point(0), point(0.001)])).toThrow();
    expect(() => regularArGeometry('cylinder', [point(0), point(2), point(0), point(3)])).toThrow(/perpendicular/);
    expect(regularArGeometry('cylinder', [point(0), point(2), point(0), point(0, 3)]).volume).toBeCloseTo(3 * Math.PI, 10);
  });
  it('uses concave outline area instead of its bounding box', () => {
    const outline = [[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]].map(([x, z]) => ({ xMeters: x, yMeters: 0, zMeters: z }));
    expect(prismGeometry(outline, 4).volume).toBe(20);
    expect(prismGeometry([...outline].reverse(), 4).volume).toBe(20);
  });
  it('is invariant under world translation and horizontal rotation', () => {
    const transformed = section(0).map(p => ({ xMeters: p.xMeters * Math.cos(0.4) - p.zMeters * Math.sin(0.4) + 10000,
      yMeters: 30, zMeters: p.xMeters * Math.sin(0.4) + p.zMeters * Math.cos(0.4) - 10000 }));
    expect(prismGeometry(transformed, 2).volume).toBeCloseTo(12, 8);
  });
  it('rejects bow-ties, duplicate endpoints, overlapping edges and collinear outlines', () => {
    for (const points of [ [[0, 0], [2, 2], [0, 2], [2, 0]], [[0, 0], [1, 0], [1, 1], [0, 0]],
      [[0, 0], [2, 0], [1, 0], [1, 2], [0, 2]], [[0, 0], [1, 0], [2, 0]] ]) {
      expect(() => polygonArea(points.map(([x, y]) => ({ x, y })))).toThrow();
    }
  });
  it('rejects non-horizontal sections and non-finite elevations', () => {
    const points = section(0); points[2].yMeters = 0.05;
    expect(() => horizontalSection(points)).toThrow(/same height/);
    points[2].yMeters = NaN;
    expect(() => horizontalSection(points)).toThrow();
  });
  it('integrates varying areas at their measured heights', () => {
    expect(sectionedGeometry([section(0), section(1), section(3, 0.5)]).volume).toBeCloseTo(13.5, 10);
    expect(sectionedGeometry([section(0), section(4)]).volume).toBe(24);
  });
  it('rejects incomplete, reversed and duplicate sections', () => {
    expect(() => sectionedGeometry([section(0)])).toThrow();
    expect(() => sectionedGeometry([section(1), section(0)])).toThrow();
    expect(() => sectionedGeometry([section(0), section(0.01)])).toThrow();
  });
});

describe('reference-photo scale', () => {
  it('corrects the photo aspect ratio for differently oriented edges', () => {
    const points = [{ x: 0.1, y: 0.1 }, { x: 0.6, y: 0.1 }, { x: 0.2, y: 0.2 }, { x: 0.2, y: 0.7 }];
    expect(referenceDistance(points, 2, 0.2)).toBeCloseTo(0.1, 10);
    expect(referenceDistance(points, 0.5, 0.2)).toBeCloseTo(0.4, 10);
  });
  it('rejects unknown scale, incomplete markings and tiny reference spans', () => {
    const points = [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 0, y: 0.5 }, { x: 0.5, y: 0.5 }];
    expect(() => referenceDistance(points, 1, 0)).toThrow();
    expect(() => referenceDistance(points.slice(0, 3), 1, 1)).toThrow();
    expect(() => referenceDistance([{ x: 0, y: 0 }, { x: 0.001, y: 0 }, ...points.slice(2)], 1, 1)).toThrow();
  });
});

describe('measurement provenance and history', () => {
  it('preserves an irregular model and its volume across JSON storage', () => {
    const sections = [section(0), section(1, 0.5)];
    const measurement = createSmartMeasurement({ shape: 'sectioned', geometry: sectionedGeometry(sections), sections, source: 'ar_points', capabilities, quality: 0.9 });
    const record = normalizeHistoryRecord(JSON.parse(JSON.stringify(measurementToHistoryRecord(measurement, { preferredLengthUnit: 'centimeter', preferredVolumeUnit: 'liter' }))))!;
    const restored = historyRecordToMeasurement(record);
    expect(restored.shape).toBe('sectioned');
    expect(restored.model).toEqual(measurement.model);
    expect(restored.volume.valueCubicMeters).toBe(3.75);
    expect(restored.confidence.score).toBeLessThanOrEqual(0.65);
  });
  it('does not invent confidence for photo or entered dimensions', () => {
    for (const source of ['reference_photo', 'entered_dimensions'] as const) {
      const result = createSmartMeasurement({ shape: 'sphere', geometry: regularGeometry('sphere', [0.2]), source, capabilities });
      expect(result.confidence.score).toBe(0);
      expect(result.model?.source).toBe(source);
      const restored = historyRecordToMeasurement(measurementToHistoryRecord(result, { preferredLengthUnit: 'meter', preferredVolumeUnit: 'liter' }));
      expect(restored.deviceCapabilities.supportsWorldTracking).toBe(false);
      expect(restored.deviceCapabilities.hasARCore).toBe(false);
    }
  });
});
