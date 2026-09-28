import { requireOptionalNativeModule } from 'expo-modules-core';

import { getBoundingBoxCornerKeypoints, normalizeBoundingBox } from '@/features/geometry';

import { mockBoxObjectDetector } from './mockBoxObjectDetector';
import { defaultObjectDetectionMinConfidence } from './objectDetectionService';
import type {
  CameraFrameInput,
  ObjectDetectionCategory,
  ObjectDetectionResult,
  ObjectDetector,
} from './types';

type NativeObjectDetectorCapabilities = {
  onDevice: boolean;
  platform?: CameraFrameInput['platform'];
  reason?: string;
  supported: boolean;
};

type NativeObjectDetectionResponse = {
  detections?: ObjectDetectionResult[];
  elapsedMs?: number;
  reason?: string;
  source?: ObjectDetectionResult['source'];
};

type BoxObjectDetectionNativeModule = {
  detectObjectsFromImage?: (
    imageUri: string,
    width: number,
    height: number,
    minConfidence: number,
  ) => Promise<NativeObjectDetectionResponse>;
  detectObjectsInCurrentFrame?: (minConfidence: number) => Promise<NativeObjectDetectionResponse>;
  getObjectDetectorCapabilities?: () => Promise<NativeObjectDetectorCapabilities>;
};

const nativeObjectDetectionModule =
  requireOptionalNativeModule<BoxObjectDetectionNativeModule>('VolumeMeasurementModule');
let nativeDetectorAvailability: boolean | undefined;
let nativeDetectorAvailabilityPromise: Promise<boolean> | undefined;

function normalizeCategory(category: string | undefined): ObjectDetectionCategory {
  if (category === 'parcel' || category === 'carton' || category === 'box') {
    return category;
  }

  return 'box';
}

function normalizeNativeDetection(
  detection: ObjectDetectionResult,
  frame: CameraFrameInput,
): ObjectDetectionResult {
  const boundingBox = normalizeBoundingBox(detection.boundingBox);

  return {
    ...detection,
    boundingBox,
    category: normalizeCategory(detection.category),
    detectorName: detection.detectorName ?? nativeBoxObjectDetector.name,
    frameId: detection.frameId ?? frame.id,
    keypoints: detection.keypoints ?? getBoundingBoxCornerKeypoints(boundingBox),
    source: 'native',
  };
}

export const nativeBoxObjectDetector: ObjectDetector = {
  async detect(frame, options) {
    const minConfidence = options?.minConfidence ?? defaultObjectDetectionMinConfidence;
    const response =
      frame.imageUri && nativeObjectDetectionModule?.detectObjectsFromImage
        ? await nativeObjectDetectionModule.detectObjectsFromImage(
            frame.imageUri,
            frame.width,
            frame.height,
            minConfidence,
          )
        : await nativeObjectDetectionModule?.detectObjectsInCurrentFrame?.(minConfidence);
    const detection = response?.detections
      ?.filter((item) => item.confidence >= minConfidence)
      .sort((first, second) => second.confidence - first.confidence)[0];

    return detection ? normalizeNativeDetection(detection, frame) : undefined;
  },
  async isAvailable() {
    if (nativeDetectorAvailability !== undefined) {
      return nativeDetectorAvailability;
    }

    if (nativeDetectorAvailabilityPromise) {
      return nativeDetectorAvailabilityPromise;
    }

    nativeDetectorAvailabilityPromise = resolveNativeDetectorAvailability().then(
      (available) => {
        nativeDetectorAvailability = available;
        return available;
      },
      (error: unknown) => {
        nativeDetectorAvailabilityPromise = undefined;
        throw error;
      },
    );

    return nativeDetectorAvailabilityPromise;
  },
  name: 'NativeBoxObjectDetector',
  notes: [
    'Runs on-device through the native module.',
    'Returns image-space boxes/keypoints only; AR/depth remains responsible for measurement.',
  ],
  runsOn: 'native',
};

async function resolveNativeDetectorAvailability() {
  if (!nativeObjectDetectionModule) {
    return false;
  }

  if (!nativeObjectDetectionModule.detectObjectsFromImage && !nativeObjectDetectionModule.detectObjectsInCurrentFrame) {
    return false;
  }

  const capabilities = await nativeObjectDetectionModule.getObjectDetectorCapabilities?.();

  return capabilities?.supported ?? true;
}

export function createDefaultBoxObjectDetector(): ObjectDetector {
  return {
    async detect(frame, options) {
      if (await nativeBoxObjectDetector.isAvailable()) {
        return nativeBoxObjectDetector.detect(frame, options);
      }

      return mockBoxObjectDetector.detect(frame, options);
    },
    async isAvailable() {
      return nativeBoxObjectDetector.isAvailable().then(
        (available) => available || mockBoxObjectDetector.isAvailable(),
        () => mockBoxObjectDetector.isAvailable(),
      );
    },
    name: 'DefaultBoxObjectDetector',
    notes: [
      'Prefers native on-device detection.',
      'Falls back to the mock detector only when native detection is unavailable.',
    ],
    runsOn: 'native',
  };
}

export const defaultBoxObjectDetector = createDefaultBoxObjectDetector();
