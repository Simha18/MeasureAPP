import type {
  NormalizedBoundingBox,
  ObjectKeypoint,
  PixelBoundingBox,
  PixelPoint2D,
} from './types';

export function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

export function normalizeBoundingBox(box: NormalizedBoundingBox): NormalizedBoundingBox {
  const x = clamp01(box.x);
  const y = clamp01(box.y);
  const width = Math.min(clamp01(box.width), 1 - x);
  const height = Math.min(clamp01(box.height), 1 - y);

  return {
    height,
    width,
    x,
    y,
  };
}

export function normalizedBoxToPixels(
  box: NormalizedBoundingBox,
  frameSize: { height: number; width: number },
): PixelBoundingBox {
  const normalizedBox = normalizeBoundingBox(box);

  return {
    height: normalizedBox.height * frameSize.height,
    width: normalizedBox.width * frameSize.width,
    x: normalizedBox.x * frameSize.width,
    y: normalizedBox.y * frameSize.height,
  };
}

export function normalizedPointToPixels(
  point: { x: number; y: number },
  frameSize: { height: number; width: number },
): PixelPoint2D {
  return {
    x: clamp01(point.x) * frameSize.width,
    y: clamp01(point.y) * frameSize.height,
  };
}

export function getBoundingBoxCornerKeypoints(box: NormalizedBoundingBox): ObjectKeypoint[] {
  const normalizedBox = normalizeBoundingBox(box);
  const right = normalizedBox.x + normalizedBox.width;
  const bottom = normalizedBox.y + normalizedBox.height;

  return [
    { id: 'top_left', x: normalizedBox.x, y: normalizedBox.y },
    { id: 'top_right', x: right, y: normalizedBox.y },
    { id: 'bottom_right', x: right, y: bottom },
    { id: 'bottom_left', x: normalizedBox.x, y: bottom },
  ];
}

export function isValidNormalizedBoundingBox(box: NormalizedBoundingBox) {
  const normalizedBox = normalizeBoundingBox(box);

  return normalizedBox.width > 0 && normalizedBox.height > 0;
}
