import { describe, expect, it } from 'vitest';

import {
  getBoundingBoxCornerKeypoints,
  normalizedBoxToPixels,
  normalizeBoundingBox,
} from '../imageGeometry';

describe('image geometry utilities', () => {
  it('clamps normalized bounding boxes to the image bounds', () => {
    const box = normalizeBoundingBox({
      height: 0.9,
      width: 0.8,
      x: 0.4,
      y: -0.2,
    });

    expect(box).toEqual({
      height: 0.9,
      width: 0.6,
      x: 0.4,
      y: 0,
    });
  });

  it('converts normalized boxes to pixels', () => {
    const box = normalizedBoxToPixels(
      {
        height: 0.25,
        width: 0.5,
        x: 0.1,
        y: 0.2,
      },
      {
        height: 800,
        width: 400,
      },
    );

    expect(box).toEqual({
      height: 200,
      width: 200,
      x: 40,
      y: 160,
    });
  });

  it('derives corner keypoints from a bounding box', () => {
    const keypoints = getBoundingBoxCornerKeypoints({
      height: 0.4,
      width: 0.5,
      x: 0.2,
      y: 0.3,
    });

    expect(keypoints).toEqual([
      { id: 'top_left', x: 0.2, y: 0.3 },
      { id: 'top_right', x: 0.7, y: 0.3 },
      { id: 'bottom_right', x: 0.7, y: 0.7 },
      { id: 'bottom_left', x: 0.2, y: 0.7 },
    ]);
  });
});
