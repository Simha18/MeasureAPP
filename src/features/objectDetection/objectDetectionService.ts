import type { DevicePlatform } from '../measurement/types';
import type { CameraFrameInput, ObjectDetectionResult, ObjectDetectionStatus } from './types';

export const defaultObjectDetectionIntervalMs = 1200;
export const defaultObjectDetectionMinConfidence = 0.55;

export function shouldRunObjectDetection(input: {
  intervalMs?: number;
  isDetecting: boolean;
  lastRunAt?: number;
  now: number;
}) {
  if (input.isDetecting) {
    return false;
  }

  if (input.lastRunAt === undefined) {
    return true;
  }

  return input.now - input.lastRunAt >= (input.intervalMs ?? defaultObjectDetectionIntervalMs);
}

export function getObjectDetectionStatus(
  result: ObjectDetectionResult | undefined,
  minConfidence = defaultObjectDetectionMinConfidence,
): ObjectDetectionStatus {
  if (!result) {
    return 'idle';
  }

  return result.confidence >= minConfidence ? 'ready' : 'low_confidence';
}

export function createCameraFrameDescriptor(input: {
  height: number;
  id?: string;
  planeCount?: number;
  platform?: DevicePlatform;
  source: CameraFrameInput['source'];
  trackingState?: string;
  width: number;
}): CameraFrameInput {
  const timestamp = Date.now();

  return {
    height: input.height,
    hints: {
      planeCount: input.planeCount,
      trackingState: input.trackingState,
    },
    id: input.id ?? `preview-${timestamp}`,
    orientation: 'portrait',
    platform: input.platform ?? 'unknown',
    source: input.source,
    timestamp,
    width: input.width,
  };
}
