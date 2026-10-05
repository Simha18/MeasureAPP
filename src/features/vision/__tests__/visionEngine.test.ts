import jpeg from 'jpeg-js';
import { describe, expect, it } from 'vitest';

import { computePhysicalMetricsFromBox } from '../cameraOptics';
import { analyzeCameraFrame } from '../imageProcessor';
import { detectAndMeasureFromImage, uint8ArrayToBase64 } from '../index';

function createSyntheticTestJpeg(
  width: number,
  height: number,
  drawShape: (x: number, y: number) => boolean,
): string {
  const frame = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const isForeground = drawShape(x, y);
      if (isForeground) {
        frame[idx] = 200; // R
        frame[idx + 1] = 30; // G
        frame[idx + 2] = 30; // B
      } else {
        frame[idx] = 245; // Background light
        frame[idx + 1] = 245;
        frame[idx + 2] = 245;
      }
      frame[idx + 3] = 255;
    }
  }
  const encoded = jpeg.encode({ data: frame, height, width }, 75);
  return uint8ArrayToBase64(encoded.data);
}

describe('Vision Engine - On-Device Image Processing & Shape Detection', () => {
  it('detects a circular shape and calculates physical circular metrics', () => {
    // Generate synthetic circular disc at center
    const base64 = createSyntheticTestJpeg(160, 120, (x, y) => {
      const dist = Math.hypot(x - 80, y - 60);
      return dist <= 25;
    });

    const analysis = analyzeCameraFrame(base64);
    expect(analysis.shape === 'circle' || analysis.shape === 'sphere' || analysis.shape === 'cylinder').toBe(true);
    expect(analysis.confidence).toBeGreaterThan(0.8);
    expect(analysis.boundingBox.width).toBeGreaterThan(0.1);
    expect(analysis.boundingBox.height).toBeGreaterThan(0.1);

    const metrics = computePhysicalMetricsFromBox(analysis.boundingBox, 'circle', { distanceMeters: 0.40 });
    expect(metrics.diameterMeters).toBeGreaterThan(0.02);
    expect(metrics.radiusMeters).toBeCloseTo((metrics.diameterMeters ?? 0) / 2, 4);
    expect(metrics.perimeterMeters).toBeGreaterThan(0.05);
    expect(metrics.baseAreaSquareMeters).toBeGreaterThan(0.0001);
  });

  it('detects a rectangular box and computes volumetric dimensions', () => {
    // Generate synthetic rectangular box in center
    const base64 = createSyntheticTestJpeg(160, 120, (x, y) => {
      return x >= 45 && x <= 115 && y >= 35 && y <= 85;
    });

    const analysis = analyzeCameraFrame(base64);
    expect(analysis.boundingBox.width).toBeGreaterThan(0.2);
    expect(analysis.boundingBox.height).toBeGreaterThan(0.2);

    const metrics = computePhysicalMetricsFromBox(analysis.boundingBox, 'cuboid', { distanceMeters: 0.50 });
    expect(metrics.shapeCategory).toBe('3d_volumetric');
    expect(metrics.dimensions.widthMeters).toBeGreaterThan(0.03);
    expect(metrics.dimensions.lengthMeters).toBeGreaterThan(0.03);
    expect(metrics.volumeCubicMeters).toBeGreaterThan(0.00001);
  });

  it('runs end-to-end detectAndMeasureFromImage pipeline', async () => {
    const base64 = createSyntheticTestJpeg(160, 120, (x, y) => {
      return Math.hypot(x - 80, y - 60) <= 20;
    });

    const result = await detectAndMeasureFromImage(base64, { distanceMeters: 0.45 });
    expect(result.source).toBe('on_device_vision');
    expect(result.dimensions.widthMeters).toBeGreaterThan(0);
    expect(result.perimeterMeters).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('classifies a tall water bottle as cylinder and NOT sphere', () => {
    // Generate synthetic tall water bottle: width 24px, height 70px (aspect ratio ~2.9)
    const base64 = createSyntheticTestJpeg(160, 120, (x, y) => {
      return x >= 68 && x <= 92 && y >= 25 && y <= 95;
    });

    const analysis = analyzeCameraFrame(base64);
    expect(analysis.shape).toBe('cylinder');
    expect(analysis.shape).not.toBe('sphere');
    expect(analysis.shapeLabel).toContain('Cylinder');

    const metrics = computePhysicalMetricsFromBox(analysis.boundingBox, 'cylinder', { distanceMeters: 0.40 });
    expect(metrics.diameterMeters).toBeGreaterThan(0.01);
    expect(metrics.dimensions.heightMeters).toBeGreaterThan(metrics.diameterMeters ?? 0);
    expect(metrics.volumeCubicMeters).toBeGreaterThan(0);
  });

  it('never classifies low-contrast blank images as spheres on fallback', () => {
    // Generate blank uniform frame with no edges (triggers fallback)
    const base64 = createSyntheticTestJpeg(160, 120, () => false);

    const analysis = analyzeCameraFrame(base64);
    expect(analysis.shape).not.toBe('sphere');
    expect(analysis.shape === 'cylinder' || analysis.shape === 'cuboid').toBe(true);
  });

  it('locks to cylinder mode when targetShape is explicitly provided', async () => {
    const base64 = createSyntheticTestJpeg(160, 120, (x, y) => {
      return Math.hypot(x - 80, y - 60) <= 20;
    });

    const result = await detectAndMeasureFromImage(base64, {
      distanceMeters: 0.40,
      targetShape: 'cylinder',
    });

    expect(result.shape).toBe('cylinder');
    expect(result.shapeLabel).toBe('Cylinder / Bottle');
    expect(result.dimensions.heightMeters).toBeGreaterThan(0);
    expect(result.volumeCubicMeters).toBeGreaterThan(0);
  });
});
