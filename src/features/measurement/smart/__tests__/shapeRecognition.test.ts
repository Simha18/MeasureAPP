import { describe, expect, it } from 'vitest';
import {
  benchmarkPresets,
  calculateCircularity,
  createMeasurementFromShapeResult,
  identifyShapeAndComputeMetrics,
} from '../shapeRecognition';

const mockCapabilities = {
  hasARCore: false,
  hasARKit: false,
  hasCamera: true,
  hasDepthSensor: false,
  hasLiDAR: false,
  supportsWorldTracking: false,
  platform: 'android' as const,
};

describe('automated shape recognition and dimensional metrics', () => {
  it('correctly identifies a 2D Square and derives perimeter and area', () => {
    const result = identifyShapeAndComputeMetrics({
      lengthMeters: 0.30,
      widthMeters: 0.30,
      isPlanar: true,
    });

    expect(result.shape).toBe('square');
    expect(result.shapeCategory).toBe('2d_planar');
    expect(result.dimensions.perimeterMeters).toBeCloseTo(1.20, 3); // 4 * 0.30
    expect(result.dimensions.areaSquareMeters).toBeCloseTo(0.09, 4); // 0.30^2
    expect(result.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it('correctly identifies a 2D Rectangle and derives perimeter and area', () => {
    const result = identifyShapeAndComputeMetrics({
      lengthMeters: 0.297,
      widthMeters: 0.210,
      isPlanar: true,
    });

    expect(result.shape).toBe('rectangle');
    expect(result.shapeCategory).toBe('2d_planar');
    expect(result.dimensions.perimeterMeters).toBeCloseTo(1.014, 3); // 2 * (0.297 + 0.210)
    expect(result.dimensions.areaSquareMeters).toBeCloseTo(0.06237, 4);
  });

  it('correctly identifies a 2D Circle and derives radius, diameter, circumference and area', () => {
    const result = identifyShapeAndComputeMetrics({
      lengthMeters: 0.20,
      widthMeters: 0.20,
      isCurved: true,
      isPlanar: true,
    });

    expect(result.shape).toBe('circle');
    expect(result.dimensions.diameterMeters).toBeCloseTo(0.20, 3);
    expect(result.dimensions.radiusMeters).toBeCloseTo(0.10, 3);
    expect(result.dimensions.perimeterMeters).toBeCloseTo(2 * Math.PI * 0.10, 4);
    expect(result.dimensions.areaSquareMeters).toBeCloseTo(Math.PI * 0.10 * 0.10, 4);
  });

  it('correctly identifies a 3D Cylinder and derives radius, height, circumference, surface area, and volume', () => {
    const result = identifyShapeAndComputeMetrics({
      lengthMeters: 0.066,
      widthMeters: 0.066,
      heightMeters: 0.122,
      isCurved: true,
    });

    expect(result.shape).toBe('cylinder');
    expect(result.shapeCategory).toBe('3d_volumetric');
    expect(result.dimensions.radiusMeters).toBeCloseTo(0.033, 4);
    expect(result.dimensions.diameterMeters).toBeCloseTo(0.066, 4);
    expect(result.dimensions.heightMeters).toBeCloseTo(0.122, 4);
    expect(result.dimensions.basePerimeterMeters).toBeCloseTo(2 * Math.PI * 0.033, 4);
    expect(result.dimensions.baseAreaSquareMeters).toBeCloseTo(Math.PI * 0.033 ** 2, 5);

    const expectedVolume = Math.PI * 0.033 ** 2 * 0.122;
    expect(result.volumeCubicMeters).toBeCloseTo(expectedVolume, 6);
  });

  it('correctly identifies a 3D Cuboid (Box) and derives surface area and volume', () => {
    const result = identifyShapeAndComputeMetrics({
      lengthMeters: 0.30,
      widthMeters: 0.20,
      heightMeters: 0.15,
    });

    expect(result.shape).toBe('cuboid');
    expect(result.shapeCategory).toBe('3d_volumetric');
    expect(result.dimensions.basePerimeterMeters).toBeCloseTo(2 * (0.30 + 0.20), 3);
    expect(result.dimensions.baseAreaSquareMeters).toBeCloseTo(0.30 * 0.20, 4);
    expect(result.dimensions.surfaceAreaSquareMeters).toBeCloseTo(2 * (0.30 * 0.20 + 0.30 * 0.15 + 0.20 * 0.15), 4);
    expect(result.volumeCubicMeters).toBeCloseTo(0.30 * 0.20 * 0.15, 6);
  });

  it('correctly identifies a 3D Sphere and derives radius, surface area and volume', () => {
    const result = identifyShapeAndComputeMetrics({
      lengthMeters: 0.067,
      widthMeters: 0.067,
      heightMeters: 0.067,
      isCurved: true,
    });

    expect(result.shape).toBe('sphere');
    expect(result.shapeCategory).toBe('3d_volumetric');
    expect(result.dimensions.radiusMeters).toBeCloseTo(0.0335, 4);
    const expectedVolume = (4 / 3) * Math.PI * Math.pow(0.0335, 3);
    expect(result.volumeCubicMeters).toBeCloseTo(expectedVolume, 6);
  });

  it('creates complete Measurement record with all metadata attached', () => {
    const result = identifyShapeAndComputeMetrics({
      lengthMeters: 0.066,
      widthMeters: 0.066,
      heightMeters: 0.122,
      isCurved: true,
    });

    const measurement = createMeasurementFromShapeResult(result, mockCapabilities, 'camera');
    expect(measurement.shape).toBe('cylinder');
    expect(measurement.dimensions.radiusMeters).toBeCloseTo(0.033, 4);
    expect(measurement.detectedShapeConfidence).toBeGreaterThanOrEqual(0.9);
    expect(measurement.volume.valueCubicMeters).toBeGreaterThan(0);
    expect(measurement.confidence.factors?.length).toBeGreaterThan(0);
  });

  it('provides all standard benchmark presets for demonstration', () => {
    expect(benchmarkPresets.length).toBeGreaterThanOrEqual(6);
    const shapes = benchmarkPresets.map(p => p.shape);
    expect(shapes).toContain('cylinder');
    expect(shapes).toContain('cuboid');
    expect(shapes).toContain('rectangle');
    expect(shapes).toContain('square');
    expect(shapes).toContain('circle');
    expect(shapes).toContain('sphere');
  });

  it('computes isoperimetric circularity quotient accurately', () => {
    // Circle: Area = pi * r^2, Perimeter = 2 * pi * r
    // Q = 4 * pi * (pi * r^2) / (4 * pi^2 * r^2) = 1.0
    const circleQ = calculateCircularity(Math.PI * 1, 2 * Math.PI * 1);
    expect(circleQ).toBeCloseTo(1.0, 5);

    // Square: side = 1, Area = 1, Perimeter = 4
    // Q = 4 * pi * 1 / 16 = pi / 4 ~ 0.785
    const squareQ = calculateCircularity(1, 4);
    expect(squareQ).toBeCloseTo(Math.PI / 4, 3);
  });
});
