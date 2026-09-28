import { useCallback, useEffect, useRef, useState } from 'react';

import { defaultBoxObjectDetector } from './nativeBoxObjectDetector';
import {
  defaultObjectDetectionIntervalMs,
  defaultObjectDetectionMinConfidence,
  getObjectDetectionStatus,
} from './objectDetectionService';
import type { CameraFrameInput, ObjectDetectionState, ObjectDetector } from './types';

export function useObjectDetection({
  captureFrame,
  detector = defaultBoxObjectDetector,
  enabled,
  frame,
  intervalMs = defaultObjectDetectionIntervalMs,
  minConfidence = defaultObjectDetectionMinConfidence,
}: {
  captureFrame?: () => Promise<Partial<CameraFrameInput> | undefined>;
  detector?: ObjectDetector;
  enabled: boolean;
  frame?: CameraFrameInput;
  intervalMs?: number;
  minConfidence?: number;
}) {
  const [state, setState] = useState<ObjectDetectionState>({ status: 'idle' });
  const isDetectingRef = useRef(false);
  const setDetectionState = useCallback((nextState: ObjectDetectionState) => {
    setState((currentState) =>
      areObjectDetectionStatesEquivalent(currentState, nextState) ? currentState : nextState,
    );
  }, []);

  useEffect(() => {
    if (!enabled || !frame) {
      const idleTimeoutId = setTimeout(() => {
        setDetectionState({ status: 'idle' });
      }, 0);
      detector.dispose?.();

      return () => clearTimeout(idleTimeoutId);
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const activeFrame = frame;

    async function runDetectionLoop() {
      if (cancelled || isDetectingRef.current) {
        return;
      }

      const isAvailable = await detector.isAvailable();
      if (cancelled) {
        return;
      }

      if (!isAvailable) {
        setDetectionState({
          error: `${detector.name} is unavailable on this device.`,
          lastRunAt: Date.now(),
          status: 'unavailable',
        });
        return;
      }

      isDetectingRef.current = true;
      setState((currentState) =>
        currentState.result || currentState.status === 'detecting'
          ? currentState
          : { ...currentState, status: 'detecting' },
      );

      try {
        const capturedFrame = await captureFrame?.();

        if (cancelled) {
          return;
        }

        const currentFrame = {
          ...activeFrame,
          ...capturedFrame,
          id: `${activeFrame.id}-${Date.now()}`,
          timestamp: Date.now(),
        };
        const result = await detector.detect(currentFrame, { minConfidence });

        if (!cancelled) {
          setDetectionState({
            lastRunAt: Date.now(),
            result,
            status: getObjectDetectionStatus(result, minConfidence),
          });
        }
      } catch (error) {
        if (!cancelled) {
          setDetectionState({
            error: error instanceof Error ? error.message : 'Object detection failed.',
            lastRunAt: Date.now(),
            status: 'error',
          });
        }
      } finally {
        isDetectingRef.current = false;
      }

      if (!cancelled) {
        timeoutId = setTimeout(runDetectionLoop, intervalMs);
      }
    }

    void runDetectionLoop();

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      detector.dispose?.();
      isDetectingRef.current = false;
    };
  }, [captureFrame, detector, enabled, frame, intervalMs, minConfidence, setDetectionState]);

  return state;
}

function areObjectDetectionStatesEquivalent(
  first: ObjectDetectionState,
  second: ObjectDetectionState,
) {
  return (
    first.error === second.error &&
    first.result?.id === second.result?.id &&
    first.status === second.status
  );
}
