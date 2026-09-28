import type { NormalizedBoundingBox, ObjectKeypoint } from '@/features/geometry';
import type { SegmentationMask } from '@/features/segmentation';

import type { DevicePlatform } from '../measurement/types';

export type ObjectDetectionCategory = 'box' | 'parcel' | 'carton';

export type CameraFrameInput = {
  height: number;
  id: string;
  imageUri?: string;
  nativeFrameHandle?: string;
  orientation: 'portrait' | 'portrait_upside_down' | 'landscape_left' | 'landscape_right';
  platform: DevicePlatform;
  source: 'ar_preview' | 'camera_preview' | 'snapshot';
  timestamp: number;
  width: number;
  hints?: {
    planeCount?: number;
    trackingState?: string;
  };
};

export type ObjectDetectionResult = {
  boundingBox: NormalizedBoundingBox;
  category: ObjectDetectionCategory;
  confidence: number;
  detectedAt: string;
  detectorName?: string;
  frameId: string;
  id: string;
  keypoints?: ObjectKeypoint[];
  mask?: SegmentationMask;
  source: 'mock' | 'native' | 'unavailable';
};

export type ObjectDetectionStatus = 'idle' | 'detecting' | 'ready' | 'low_confidence' | 'unavailable' | 'error';

export type ObjectDetectionState = {
  error?: string;
  lastRunAt?: number;
  result?: ObjectDetectionResult;
  status: ObjectDetectionStatus;
};

export type ObjectDetectionOptions = {
  minConfidence?: number;
};

export type ObjectDetector = {
  detect: (
    frame: CameraFrameInput,
    options?: ObjectDetectionOptions,
  ) => Promise<ObjectDetectionResult | undefined>;
  dispose?: () => void;
  isAvailable: () => Promise<boolean>;
  readonly name: string;
  readonly notes?: string[];
  readonly runsOn: 'js' | 'native';
};
