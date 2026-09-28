import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ObjectDetectionState } from '@/features/objectDetection';

import {
  getNativeMeasurementModule,
  getUserFacingMeasurementIssue,
  logTechnicalMeasurementError,
} from '../native';
import {
  createAssistedCuboidObservation,
  estimateAssistedCuboidFromObservations,
  getAssistedCuboidCornerScreenPoints,
  type AssistedCuboidCornerCandidate,
  type AssistedCuboidEstimate,
  type AssistedCuboidEstimationOptions,
  type AssistedCuboidObservation,
} from './assistedCuboidEstimation';
import type { ScreenPoint, TrackingState, WorldPointResult } from '../native/types';

export type AssistedCuboidEstimationState = {
  estimate: AssistedCuboidEstimate;
  isCollecting: boolean;
  lastError?: string;
  latestObservation?: AssistedCuboidObservation;
  observations: AssistedCuboidObservation[];
};

export type AssistedCuboidWorldPointEstimator = (screenPoint: ScreenPoint) => Promise<WorldPointResult>;

const maxObservationCount = 8;

const defaultEstimateWorldPoint: AssistedCuboidWorldPointEstimator = (screenPoint) =>
  getNativeMeasurementModule().estimateWorldPoint(screenPoint);

export function useAssistedCuboidEstimation({
  enabled,
  estimateWorldPoint = defaultEstimateWorldPoint,
  frameSize,
  minDetectionConfidence,
  objectDetectionState,
  trackingState,
}: {
  enabled: boolean;
  estimateWorldPoint?: AssistedCuboidWorldPointEstimator;
  frameSize: { height: number; width: number };
  minDetectionConfidence: number;
  objectDetectionState: ObjectDetectionState;
  trackingState: TrackingState['status'];
}) {
  const options = useMemo<AssistedCuboidEstimationOptions>(
    () => ({
      minDetectionConfidence,
    }),
    [minDetectionConfidence],
  );
  const [state, setState] = useState<AssistedCuboidEstimationState>(() =>
    createInitialState(options),
  );
  const frameHeight = frameSize.height;
  const frameWidth = frameSize.width;
  const processedDetectionIdsRef = useRef(new Set<string>());

  const reset = useCallback(() => {
    processedDetectionIdsRef.current = new Set();
    setState(createInitialState(options));
  }, [options]);

  useEffect(() => {
    if (enabled) {
      return undefined;
    }

    const resetTimeoutId = setTimeout(reset, 0);

    return () => clearTimeout(resetTimeoutId);
  }, [enabled, reset]);

  useEffect(() => {
    if (
      !enabled ||
      objectDetectionState.status !== 'ready' ||
      !objectDetectionState.result ||
      frameWidth <= 0 ||
      frameHeight <= 0 ||
      processedDetectionIdsRef.current.has(objectDetectionState.result.id)
    ) {
      return undefined;
    }

    let cancelled = false;
    const detection = objectDetectionState.result;
    processedDetectionIdsRef.current.add(detection.id);

    async function collectObservation() {
      setState((currentState) => ({
        ...currentState,
        isCollecting: true,
        lastError: undefined,
      }));

      const screenPoints = getAssistedCuboidCornerScreenPoints(detection, {
        height: frameHeight,
        width: frameWidth,
      });
      const candidates: AssistedCuboidCornerCandidate[] = [];

      for (const corner of screenPoints) {
        const worldPointResult = await estimateWorldPoint(corner.screenPoint);

        if (cancelled) {
          return;
        }

        if (worldPointResult.point) {
          candidates.push({
            ...corner,
            pointQuality: worldPointResult.quality,
            worldPoint: worldPointResult.point,
          });
        }
      }

      if (cancelled) {
        return;
      }

      const observation = createAssistedCuboidObservation({
        candidates,
        detectionConfidence: detection.confidence,
        detectionId: detection.id,
        trackingState,
      });

      setState((currentState) => {
        const nextObservations = [...currentState.observations, observation].slice(-maxObservationCount);

        return {
          estimate: estimateAssistedCuboidFromObservations(nextObservations, options),
          isCollecting: false,
          lastError:
            candidates.length === 0
              ? 'No AR/depth world points could be estimated for the detected box corners.'
              : undefined,
          latestObservation: observation,
          observations: nextObservations,
        };
      });
    }

    void collectObservation().catch((error) => {
      if (!cancelled) {
        logTechnicalMeasurementError('assisted cuboid estimation failed', error);
        setState((currentState) => ({
          ...currentState,
          isCollecting: false,
          lastError: getUserFacingMeasurementIssue({
            message: error instanceof Error ? error.message : undefined,
          }).message,
        }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    estimateWorldPoint,
    frameHeight,
    frameWidth,
    objectDetectionState.result,
    objectDetectionState.status,
    options,
    trackingState,
  ]);

  return {
    ...state,
    reset,
  };
}

function createInitialState(options: AssistedCuboidEstimationOptions): AssistedCuboidEstimationState {
  return {
    estimate: estimateAssistedCuboidFromObservations([], options),
    isCollecting: false,
    observations: [],
  };
}
