import { normalizeBoundingBox } from '@/features/geometry';

import type { CameraFrameInput, ObjectDetectionResult, ObjectDetector } from './types';

function getMockConfidence(frame: CameraFrameInput) {
  const trackingFactor = frame.hints?.trackingState === 'tracking' ? 0.24 : -0.16;
  const planeFactor = Math.min(frame.hints?.planeCount ?? 0, 3) * 0.04;
  const frameSizeFactor = frame.width > 0 && frame.height > 0 ? 0.42 : 0;

  return Math.min(0.86, Math.max(0.18, frameSizeFactor + trackingFactor + planeFactor));
}

export const mockBoxObjectDetector: ObjectDetector = {
  async detect(frame) {
    if (frame.width <= 0 || frame.height <= 0) {
      return undefined;
    }

    const confidence = getMockConfidence(frame);
    const boundingBox = normalizeBoundingBox({
      height: 0.42,
      width: 0.58,
      x: 0.21,
      y: 0.3,
    });

    const result: ObjectDetectionResult = {
      boundingBox,
      category: 'box',
      confidence,
      detectedAt: new Date(frame.timestamp).toISOString(),
      detectorName: mockBoxObjectDetector.name,
      frameId: frame.id,
      id: `mock-box-${frame.id}`,
      keypoints: [
        { id: 'front_top_left', x: 0.27, y: 0.34 },
        { id: 'front_top_right', x: 0.7, y: 0.34 },
        { id: 'front_bottom_left', x: 0.27, y: 0.68 },
        { id: 'front_bottom_right', x: 0.7, y: 0.68 },
        { id: 'back_top_left', x: 0.38, y: 0.26 },
        { id: 'back_top_right', x: 0.78, y: 0.29 },
        { id: 'back_bottom_left', x: 0.38, y: 0.58 },
        { id: 'back_bottom_right', x: 0.78, y: 0.61 },
      ].map((keypoint) => ({
        ...keypoint,
        confidence,
      })),
      source: 'mock',
    };

    return result;
  },
  async isAvailable() {
    return true;
  },
  name: 'MockBoxObjectDetector',
  runsOn: 'js',
};
