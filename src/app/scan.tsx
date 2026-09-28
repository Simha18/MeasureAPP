import { Redirect, router, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import { MetricCard, OptionSelector, PrimaryButton, Screen, SectionHeader } from '@/components';
import { routes } from '@/constants/routes';
import { CameraPreview, CameraProvider, useCameraContext, type CameraPreviewHandle } from '@/features/camera';
import {
  createSimulatedCuboidMeasurement,
  createEmptyManualCuboidWorkflowState,
  createCuboidMeasurement,
  createManualArCuboidMeasurement,
  calculatePointDistanceMeters,
  convertLength,
  convertVolume,
  getCapabilityIssue,
  getDimensionValidation,
  getDisplayedDimensions,
  getDisplayedVolume,
  getNativeMeasurementModule,
  getTrackingIssue,
  getUserFacingMeasurementIssue,
  isVolumeMeasurementArViewAvailable,
  isManualCuboidWorkflowComplete,
  initialMeasurementWorkflowState,
  logTechnicalMeasurementError,
  manualCuboidSteps,
  measurementWorkflowReducer,
  MeasurementInstructions,
  MeasurementOverlay,
  MeasurementQualityIndicator,
  mockCuboidMeasurement,
  scanStages,
  subscribeToVolumeMeasurementEvents,
  useMeasurementCapabilities,
  VolumeMeasurementArView,
  toDeviceCapabilities,
  useAssistedCuboidEstimation,
  type AssistedCuboidEstimationState,
  type Measurement,
  type MeasurementConfidence,
  type MeasurementUnit,
  type ManualCuboidDimensionKey,
  type ManualCuboidWorkflowState,
  type MeasurementMode,
  type NativePointQuality,
  type TrackingState,
  type UserFacingMeasurementIssue,
  type WorldPoint3D,
} from '@/features/measurement';
import {
  createCameraFrameDescriptor,
  defaultObjectDetectionMinConfidence,
  defaultBoxObjectDetector,
  ObjectDetectionOverlay,
  useObjectDetection,
  type ObjectDetectionState,
} from '@/features/objectDetection';
import { useAppStore } from '@/store';
import { colors, spacing, typography } from '@/theme';
import { formatMeasurement } from '@/utils/formatMeasurement';

const finalStageIndex = scanStages.length - 1;
const objectDetectionIntervalMs = 1200;
const planePollingIntervalMs = 2000;

type MeasurementInteractionMode = 'manual' | 'auto_assist';

const measurementModeOptions: {
  label: string;
  value: MeasurementInteractionMode;
}[] = [
  { label: 'Manual', value: 'manual' },
  { label: 'Auto Assist', value: 'auto_assist' },
];

type ArDebugState = {
  depthAvailable?: boolean;
  depthConfidence?: number;
  hitStabilityMeters?: number | null;
  measurementConfidence?: number;
  measurementMode?: MeasurementMode;
  qualityLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  distanceBetweenLastTwoMeters?: number | null;
  latestPoint?: WorldPoint3D & {
    x?: number;
    y?: number;
    z?: number;
  };
  planeCount: number;
  selectedPointsCount: number;
  trackingQuality?: number;
  trackingState: TrackingState['status'];
  validDepthFrameCount?: number;
};

type CapturedArPoint = WorldPoint3D & {
  label: string;
  quality?: NativePointQuality;
  screenX: number;
  screenY: number;
};

type ArPointMarker = {
  id: string;
  label: string;
  screenX: number;
  screenY: number;
};

type DisplayedDimensions = ReturnType<typeof getDisplayedDimensions>;
type DisplayedVolume = ReturnType<typeof getDisplayedVolume>;

export default function ScanScreen() {
  const { capabilities, isLoading } = useMeasurementCapabilities();
  if (isLoading) return <Screen><Text>Checking AR support…</Text></Screen>;
  if (!capabilities?.arSupported || !capabilities.nativeMeasurementAvailable || !isVolumeMeasurementArViewAvailable()) {
    return <Redirect href={'/photo-measure?shape=cuboid' as Href} />;
  }
  return (
    <CameraProvider>
      <ScanMeasurementContent />
    </CameraProvider>
  );
}

function ScanMeasurementContent() {
  const params = useLocalSearchParams<{ assist?: string }>();
  const camera = useCameraContext();
  const cameraPreviewRef = useRef<CameraPreviewHandle>(null);
  const { capabilities, error: capabilitiesError, isLoading: areCapabilitiesLoading } = useMeasurementCapabilities();
  const { saveMeasurement, setCurrentMeasurement, settings } = useAppStore();
  const [, dispatchWorkflowEvent] = useReducer(
    measurementWorkflowReducer,
    initialMeasurementWorkflowState,
  );
  const [arDebugState, setArDebugState] = useState<ArDebugState>({
    planeCount: 0,
    selectedPointsCount: 0,
    trackingState: 'idle',
  });
  const [arMarkers, setArMarkers] = useState<ArPointMarker[]>([]);
  const [arSessionError, setArSessionError] = useState<string | undefined>();
  const [arWorkflowState, setArWorkflowState] = useState<ManualCuboidWorkflowState>(
    createEmptyManualCuboidWorkflowState,
  );
  const [currentArStepIndex, setCurrentArStepIndex] = useState(0);
  const [forceCameraFallback, setForceCameraFallback] = useState(false);
  const [isArSessionActive, setIsArSessionActive] = useState(false);
  const [arSessionRestartKey, setArSessionRestartKey] = useState(0);
  const [measurementInteractionMode, setMeasurementInteractionMode] =
    useState<MeasurementInteractionMode>(params.assist === '1' ? 'auto_assist' : 'manual');
  const [previewSize, setPreviewSize] = useState({ height: 0, width: 0 });
  const [cameraError, setCameraError] = useState<string | undefined>();
  const [cameraRestartKey, setCameraRestartKey] = useState(0);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [completedMeasurement, setCompletedMeasurement] = useState<Measurement | undefined>();
  const [stageIndex, setStageIndex] = useState(0);
  const stage = scanStages[stageIndex];
  const currentArStep = manualCuboidSteps[currentArStepIndex];
  const currentArDimension = currentArStep ? arWorkflowState[currentArStep.key] : undefined;
  const currentArDistance = currentArDimension?.distanceMeters;
  const currentArValidation = getDimensionValidation(currentArDistance);
  const isArTrackingPoor =
    isArSessionActive && arDebugState.trackingState !== 'tracking' && arDebugState.trackingState !== 'idle';
  const baseCanUseNativeAr =
    (Platform.OS === 'android' || Platform.OS === 'ios') &&
    isVolumeMeasurementArViewAvailable() &&
    Boolean(capabilities?.arSupported && capabilities.nativeMeasurementAvailable);
  const canUseNativeAr = baseCanUseNativeAr && !forceCameraFallback;
  const nativeArName = capabilities?.platform === 'ios' ? 'ARKit' : 'ARCore';
  const capabilityIssue = getCapabilityIssue(capabilities);
  const trackingIssue = getTrackingIssue(arDebugState.trackingState);
  const surfaceIssue =
    canUseNativeAr && arDebugState.trackingState === 'tracking' && arDebugState.planeCount === 0
      ? getUserFacingMeasurementIssue({ message: 'no surface detected' })
      : undefined;
  const cameraIssue = cameraError
    ? getUserFacingMeasurementIssue({ message: cameraError })
    : undefined;
  const arIssue = arSessionError
    ? getUserFacingMeasurementIssue({ message: arSessionError })
    : undefined;
  const isAutoAssistMode = measurementInteractionMode === 'auto_assist';
  const previewReady = canUseNativeAr ? isArSessionActive : isCameraReady;
  const canAdvanceMeasurement =
    !canUseNativeAr && camera.isCameraActive && isCameraReady && !cameraError;
  const dimensions =
    !canUseNativeAr && stageIndex >= 4
      ? getDisplayedDimensions(completedMeasurement ?? mockCuboidMeasurement, settings.preferredLengthUnit)
      : undefined;
  const arCompletedDimensions = completedMeasurement
    ? getDisplayedDimensions(completedMeasurement, settings.preferredLengthUnit)
    : undefined;
  const arCompletedVolume = completedMeasurement
    ? getDisplayedVolume(completedMeasurement, settings.preferredVolumeUnit)
    : undefined;
  const arCompletedLiters = completedMeasurement
    ? getDisplayedVolume(completedMeasurement, 'liter')
    : undefined;
  const canConfirmArDimension =
    Boolean(currentArDimension && currentArDimension.points.length === 2) &&
    currentArValidation.isValid &&
    arDebugState.trackingState === 'tracking' &&
    arDebugState.qualityLevel !== 'LOW';
  const currentStepMarkers = useMemo(() => {
    if (!currentArStep) {
      return [];
    }

    return arMarkers.filter((marker) => currentArStep.pointLabels.includes(marker.label));
  }, [arMarkers, currentArStep]);
  const objectDetectionFrame = useMemo(() => {
    if (previewSize.width <= 0 || previewSize.height <= 0) {
      return undefined;
    }

    const frame = createCameraFrameDescriptor({
      height: previewSize.height,
      id: 'native-ar-preview',
      planeCount: arDebugState.planeCount,
      platform: capabilities?.platform,
      source: 'ar_preview',
      trackingState: arDebugState.trackingState,
      width: previewSize.width,
    });

    return canUseNativeAr
      ? {
          ...frame,
          nativeFrameHandle: 'current-ar-frame',
        }
      : frame;
  }, [
    arDebugState.planeCount,
    arDebugState.trackingState,
    capabilities?.platform,
    canUseNativeAr,
    previewSize.height,
    previewSize.width,
  ]);
  const captureObjectDetectionFrame = useCallback(async () => {
    const snapshot = await cameraPreviewRef.current?.captureFrame();

    return snapshot
      ? {
          height: snapshot.height,
          imageUri: snapshot.uri,
          source: 'snapshot' as const,
          width: snapshot.width,
        }
      : undefined;
  }, []);
  const objectDetectionState = useObjectDetection({
    captureFrame: canUseNativeAr ? undefined : captureObjectDetectionFrame,
    detector: defaultBoxObjectDetector,
    enabled: canUseNativeAr && isAutoAssistMode && camera.isCameraActive && isArSessionActive && !completedMeasurement,
    frame: objectDetectionFrame,
    intervalMs: objectDetectionIntervalMs,
    minConfidence: defaultObjectDetectionMinConfidence,
  });
  const assistedCuboid = useAssistedCuboidEstimation({
    enabled: canUseNativeAr && isAutoAssistMode && camera.isCameraActive && isArSessionActive && !completedMeasurement,
    frameSize: previewSize,
    minDetectionConfidence: defaultObjectDetectionMinConfidence,
    objectDetectionState,
    trackingState: arDebugState.trackingState,
  });

  useEffect(() => {
    dispatchWorkflowEvent({ type: 'START' });
  }, []);

  useEffect(() => {
    if (areCapabilitiesLoading) {
      return;
    }

    if (capabilitiesError) {
      const issue = getUserFacingMeasurementIssue({ message: capabilitiesError });
      dispatchWorkflowEvent({ reason: issue.message, type: 'FAIL' });
      return;
    }

    dispatchWorkflowEvent({ canUseNativeAr, type: 'CAPABILITIES_CHECKED' });
  }, [areCapabilitiesLoading, canUseNativeAr, capabilitiesError]);

  useEffect(() => {
    if (objectDetectionState.status === 'ready' && objectDetectionState.result) {
      dispatchWorkflowEvent({
        confidence: objectDetectionState.result.confidence,
        type: 'OBJECT_DETECTED',
      });
    }
  }, [objectDetectionState.result, objectDetectionState.status]);

  const assistedCuboidFailureReason =
    assistedCuboid.estimate.reasons[0] ??
    'Assisted cuboid fit is not confident enough. Continue scanning or switch to Manual Mode.';

  useEffect(() => {
    if (!isAutoAssistMode) {
      return;
    }

    dispatchWorkflowEvent({
      acceptedObservationCount: assistedCuboid.estimate.acceptedObservationCount,
      progress: assistedCuboid.estimate.scanProgress,
      requiredObservationCount: assistedCuboid.estimate.requiredObservationCount,
      type: 'SCAN_PROGRESS',
    });

    if (assistedCuboid.estimate.status === 'insufficient_confidence') {
      dispatchWorkflowEvent({
        reason: assistedCuboidFailureReason,
        type: 'VALIDATION_FAILURE',
      });
    }
  }, [
    assistedCuboid.estimate.acceptedObservationCount,
    assistedCuboidFailureReason,
    assistedCuboid.estimate.requiredObservationCount,
    assistedCuboid.estimate.scanProgress,
    assistedCuboid.estimate.status,
    isAutoAssistMode,
  ]);

  useEffect(() => {
    if (!camera.isCameraActive) {
      const timeout = setTimeout(() => {
        setIsCameraReady(false);
      }, 0);

      return () => clearTimeout(timeout);
    }

    return undefined;
  }, [camera.isCameraActive]);

  useEffect(() => {
    if (!canUseNativeAr || !camera.isCameraActive) {
      return undefined;
    }

    let isMounted = true;

    async function startArSession() {
      try {
        setArSessionError(undefined);
        const result = await getNativeMeasurementModule().startSession();

        if (isMounted) {
          setIsArSessionActive(result.started);
          if (!result.started) {
            const issue = getUserFacingMeasurementIssue({
              message: result.reason,
            });
            setArSessionError(issue.message);
            dispatchWorkflowEvent({
              reason: issue.message,
              type: 'FAIL',
            });
          } else {
            dispatchWorkflowEvent({ type: 'CAMERA_READY' });
          }
        }
      } catch (error) {
        if (isMounted) {
          logTechnicalMeasurementError(`${nativeArName} session failed to start`, error);
          const issue = getUserFacingMeasurementIssue({
            message: error instanceof Error ? error.message : undefined,
          });
          setIsArSessionActive(false);
          setArSessionError(issue.message);
          dispatchWorkflowEvent({
            reason: issue.message,
            type: 'FAIL',
          });
        }
      }
    }

    void startArSession();

    return () => {
      isMounted = false;
      setIsArSessionActive(false);
      void getNativeMeasurementModule().stopSession();
    };
  }, [arSessionRestartKey, camera.isCameraActive, canUseNativeAr, nativeArName]);

  useEffect(() => {
    if (!canUseNativeAr) {
      return undefined;
    }

    const cleanup = subscribeToVolumeMeasurementEvents({
      onMeasurementUpdated: (measurement) => {
        setArDebugState((currentState) => mergeArDebugState(currentState, {
          distanceBetweenLastTwoMeters: measurement.distanceBetweenLastTwoMeters,
          depthAvailable: measurement.depthAvailable,
          depthConfidence: measurement.depthConfidence,
          hitStabilityMeters: measurement.hitStabilityMeters,
          latestPoint: measurement.latestPoint,
          measurementConfidence: measurement.measurementConfidence ?? measurement.confidence,
          measurementMode: measurement.measurementMode,
          qualityLevel: getQualityLevel(measurement.measurementConfidence ?? measurement.confidence),
          selectedPointsCount: measurement.selectedPointsCount ?? currentState.selectedPointsCount,
          trackingQuality: measurement.trackingQuality,
          trackingState: measurement.trackingState,
          validDepthFrameCount: measurement.validDepthFrameCount,
        }));
      },
      onMeasurementError: (event) => {
        logTechnicalMeasurementError('native measurement event error', event);
        const issue = getUserFacingMeasurementIssue({
          code: event.code,
          message: event.message,
        });

        setArSessionError(issue.message);
        dispatchWorkflowEvent({ reason: issue.message, type: 'FAIL' });
      },
      onPlaneDetected: () => {
        dispatchWorkflowEvent({ type: 'PLANE_DETECTED' });
        setArDebugState((currentState) => ({
          ...currentState,
          planeCount: currentState.planeCount + 1,
        }));
      },
      onTrackingStateChanged: (event) => {
        setArDebugState((currentState) => mergeArDebugState(currentState, {
          measurementMode: event.measurementMode,
          trackingState: event.trackingState,
        }));
      },
    });

    const intervalId = setInterval(() => {
      void getNativeMeasurementModule().getDetectedPlanes().then((planes) => {
        if (planes.length > 0) {
          dispatchWorkflowEvent({ type: 'PLANE_DETECTED' });
        }

        setArDebugState((currentState) => mergeArDebugState(currentState, {
          planeCount: planes.length,
        }));
      });
    }, planePollingIntervalMs);

    return () => {
      cleanup();
      clearInterval(intervalId);
    };
  }, [canUseNativeAr]);

  useEffect(() => {
    if (!canAdvanceMeasurement) {
      return undefined;
    }

    if (stageIndex < finalStageIndex) {
      const timeout = setTimeout(() => {
        setStageIndex((currentIndex) => currentIndex + 1);
        dispatchWorkflowEvent({
          progress: scanStages[Math.min(stageIndex + 1, finalStageIndex)].progress,
          type: 'SCAN_PROGRESS',
        });
      }, 1100);

      return () => clearTimeout(timeout);
    }

    if (!completedMeasurement) {
      const timeout = setTimeout(() => {
        const measurement = createSimulatedCuboidMeasurement();

        setCompletedMeasurement(measurement);
        void setCurrentMeasurement(measurement);
        dispatchWorkflowEvent({ type: 'VALIDATION_SUCCESS' });
      }, 0);

      return () => clearTimeout(timeout);
    }

    return undefined;
  }, [canAdvanceMeasurement, completedMeasurement, setCurrentMeasurement, stageIndex]);

  const handleCameraReady = useCallback(() => {
    setCameraError(undefined);
    setIsCameraReady(true);
    dispatchWorkflowEvent({ type: 'CAMERA_READY' });
  }, []);

  const handleCameraMountError = useCallback((message: string) => {
    logTechnicalMeasurementError('camera preview mount failed', message);
    setCameraError(getUserFacingMeasurementIssue({ message }).message);
    setIsCameraReady(false);
    dispatchWorkflowEvent({
      reason: getUserFacingMeasurementIssue({ message }).message,
      type: 'FAIL',
    });
  }, []);

  const handleMeasurementModeChange = useCallback((mode: MeasurementInteractionMode) => {
    setMeasurementInteractionMode(mode);
    dispatchWorkflowEvent({ mode, type: 'MODE_CHANGED' });
  }, []);

  const handlePreviewLayout = useCallback((event: LayoutChangeEvent) => {
    const { height, width } = event.nativeEvent.layout;

    setPreviewSize((currentSize) => {
      if (currentSize.height === height && currentSize.width === width) {
        return currentSize;
      }

      return { height, width };
    });
  }, []);

  const handleArTap = useCallback(
    async (screenX: number, screenY: number) => {
      if (!currentArStep || completedMeasurement) {
        return;
      }

      const existingPoints = arWorkflowState[currentArStep.key].points;
      if (existingPoints.length >= 2) {
        setArSessionError('Confirm or retry this dimension before adding another point.');
        return;
      }

      if (arDebugState.trackingState !== 'tracking') {
        setArSessionError('AR tracking is not ready yet. Move slowly until tracking is stable.');
        return;
      }

      try {
        setArSessionError(undefined);
        const result = await getNativeMeasurementModule().getWorldPoint({
          x: screenX,
          y: screenY,
        });

        if (!result.point) {
          setArSessionError(
            getUserFacingMeasurementIssue({
              message: result.reason ?? 'no surface detected',
            }).message,
          );
          return;
        }

        const pointLabel = currentArStep.pointLabels[existingPoints.length];
        const capturedPoint: CapturedArPoint = {
          ...result.point,
          label: pointLabel,
          quality: result.quality,
          screenX,
          screenY,
        };
        const nextPoints = [...existingPoints, capturedPoint];
        const nextDistance =
          nextPoints.length === 2
            ? calculatePointDistanceMeters(nextPoints[0], nextPoints[1])
            : undefined;

        setArWorkflowState((currentState) => ({
          ...currentState,
          [currentArStep.key]: {
            ...currentState[currentArStep.key],
            distanceMeters: nextDistance,
            points: nextPoints,
          },
        }));
        setArMarkers((currentMarkers) => [
          ...currentMarkers,
          {
            id: `${currentArStep.key}-${pointLabel}`,
            label: pointLabel,
            screenX,
            screenY,
          },
        ]);
        dispatchWorkflowEvent({
          dimension: currentArStep.key,
          type: 'POINT_SELECTED',
        });

        const measurement = await getNativeMeasurementModule().getCurrentMeasurement();
        setArDebugState((currentState) => ({
          ...currentState,
          distanceBetweenLastTwoMeters: measurement?.distanceBetweenLastTwoMeters,
          depthAvailable: measurement?.depthAvailable ?? result.quality?.depthAvailable,
          depthConfidence: measurement?.depthConfidence ?? result.quality?.depthConfidence,
          hitStabilityMeters: measurement?.hitStabilityMeters ?? result.quality?.hitStabilityMeters,
          latestPoint: measurement?.latestPoint ?? result.point,
          measurementConfidence:
            measurement?.measurementConfidence ?? measurement?.confidence ?? result.quality?.measurementConfidence,
          measurementMode:
            measurement?.measurementMode ??
            (result.quality?.source === 'depth_point' ? 'ar_depth' : currentState.measurementMode),
          qualityLevel:
            result.quality?.qualityLevel ??
            getQualityLevel(measurement?.measurementConfidence ?? measurement?.confidence),
          selectedPointsCount: measurement?.selectedPointsCount ?? currentState.selectedPointsCount + 1,
          trackingQuality: measurement?.trackingQuality ?? result.quality?.trackingQuality,
          trackingState: measurement?.trackingState ?? currentState.trackingState,
          validDepthFrameCount: measurement?.validDepthFrameCount ?? result.quality?.validDepthFrameCount,
        }));
      } catch (error) {
        logTechnicalMeasurementError('AR world point capture failed', error);
        setArSessionError(
          getUserFacingMeasurementIssue({
            message: error instanceof Error ? error.message : undefined,
          }).message,
        );
      }
    },
    [arDebugState.trackingState, arWorkflowState, completedMeasurement, currentArStep],
  );

  const handleRetryCamera = useCallback(() => {
    setCameraError(undefined);
    setIsCameraReady(false);
    setCameraRestartKey((currentKey) => currentKey + 1);
  }, []);

  const handleRetryArSession = useCallback(async () => {
    setArSessionError(undefined);
    setIsArSessionActive(false);
    await getNativeMeasurementModule().stopSession();
    await getNativeMeasurementModule().resetSession();
    setForceCameraFallback(false);
    setArSessionRestartKey((currentKey) => currentKey + 1);
  }, []);

  const handleUseCameraFallback = useCallback(async () => {
    await getNativeMeasurementModule().stopSession();
    setForceCameraFallback(true);
    setIsArSessionActive(false);
    setArSessionError(undefined);
    setCameraError(undefined);
    setIsCameraReady(false);
    dispatchWorkflowEvent({ mode: 'manual', type: 'MODE_CHANGED' });
  }, []);

  const handleUndoArPoint = useCallback(async () => {
    if (!currentArStep) {
      return;
    }

    const existingPoints = arWorkflowState[currentArStep.key].points;
    if (existingPoints.length === 0) {
      return;
    }

    await getNativeMeasurementModule().undoLastPoint();
    setArSessionError(undefined);
    setArWorkflowState((currentState) => {
      const nextPoints = currentState[currentArStep.key].points.slice(0, -1);

      return {
        ...currentState,
        [currentArStep.key]: {
          ...currentState[currentArStep.key],
          distanceMeters:
            nextPoints.length === 2
              ? calculatePointDistanceMeters(nextPoints[0], nextPoints[1])
              : undefined,
          points: nextPoints,
        },
      };
    });
    setArMarkers((currentMarkers) => currentMarkers.slice(0, -1));
    const measurement = await getNativeMeasurementModule().getCurrentMeasurement();
    setArDebugState((currentState) => ({
      ...currentState,
      distanceBetweenLastTwoMeters: measurement?.distanceBetweenLastTwoMeters,
      depthAvailable: measurement?.depthAvailable,
      depthConfidence: measurement?.depthConfidence,
      hitStabilityMeters: measurement?.hitStabilityMeters,
      latestPoint: measurement?.latestPoint,
      measurementConfidence: measurement?.measurementConfidence ?? measurement?.confidence,
      measurementMode: measurement?.measurementMode,
      qualityLevel: getQualityLevel(measurement?.measurementConfidence ?? measurement?.confidence),
      selectedPointsCount: measurement?.selectedPointsCount ?? Math.max(currentState.selectedPointsCount - 1, 0),
      trackingQuality: measurement?.trackingQuality,
      trackingState: measurement?.trackingState ?? currentState.trackingState,
      validDepthFrameCount: measurement?.validDepthFrameCount,
    }));
  }, [arWorkflowState, currentArStep]);

  const handleRetryArDimension = useCallback(async () => {
    if (!currentArStep) {
      return;
    }

    const currentPointCount = arWorkflowState[currentArStep.key].points.length;
    for (let index = 0; index < currentPointCount; index += 1) {
      await getNativeMeasurementModule().undoLastPoint();
    }

    setArSessionError(undefined);
    setArWorkflowState((currentState) => ({
      ...currentState,
      [currentArStep.key]: {
        confirmed: false,
        points: [],
      },
    }));
    setArMarkers((currentMarkers) =>
      currentMarkers.filter((marker) => !currentArStep.pointLabels.includes(marker.label)),
    );
  }, [arWorkflowState, currentArStep]);

  const handleResetArWorkflow = useCallback(async () => {
    await getNativeMeasurementModule().resetSession();
    dispatchWorkflowEvent({ type: 'RESET' });
    dispatchWorkflowEvent({ type: 'START' });
    dispatchWorkflowEvent({ canUseNativeAr, type: 'CAPABILITIES_CHECKED' });
    dispatchWorkflowEvent({ mode: measurementInteractionMode, type: 'MODE_CHANGED' });
    if (previewReady) {
      dispatchWorkflowEvent({ type: 'CAMERA_READY' });
    }
    setArDebugState({
      planeCount: 0,
      selectedPointsCount: 0,
      trackingState: 'idle',
    });
    setArMarkers([]);
    setArSessionError(undefined);
    setArWorkflowState(createEmptyManualCuboidWorkflowState());
    setCurrentArStepIndex(0);
    setCompletedMeasurement(undefined);
    setForceCameraFallback(false);
    assistedCuboid.reset();
  }, [assistedCuboid, canUseNativeAr, measurementInteractionMode, previewReady]);

  const handleConfirmArDimension = useCallback(async () => {
    if (!currentArStep || !currentArDimension || !capabilities || !currentArValidation.isValid) {
      return;
    }

    const nextWorkflowState = {
      ...arWorkflowState,
      [currentArStep.key]: {
        ...currentArDimension,
        confirmed: true,
      },
    };

    setArWorkflowState(nextWorkflowState);
    dispatchWorkflowEvent({
      dimension: currentArStep.key,
      type: 'DIMENSION_CONFIRMED',
    });

    if (!isManualCuboidWorkflowComplete(nextWorkflowState)) {
      setCurrentArStepIndex((currentIndex) => currentIndex + 1);
      setArSessionError(undefined);
      return;
    }

    const measurement = createManualArCuboidMeasurement({
      deviceCapabilities: toDeviceCapabilities(capabilities),
      dimensions: {
        heightMeters: nextWorkflowState.height.distanceMeters ?? 0,
        lengthMeters: nextWorkflowState.length.distanceMeters ?? 0,
        widthMeters: nextWorkflowState.width.distanceMeters ?? 0,
      },
      confidence: createConfidenceFromWorkflow(nextWorkflowState),
      id: `native-ar-measurement-${Date.now()}`,
      measurementUnit: 'meter',
      scanSessionId: `native-ar-session-${Date.now()}`,
    });

    setCompletedMeasurement(measurement);
    setCurrentArStepIndex(manualCuboidSteps.length);
    await setCurrentMeasurement(measurement);
    await saveMeasurement(measurement);
    dispatchWorkflowEvent({ type: 'VALIDATION_SUCCESS' });
    setArSessionError(undefined);
  }, [
    arWorkflowState,
    capabilities,
    currentArDimension,
    currentArStep,
    currentArValidation.isValid,
    saveMeasurement,
    setCurrentMeasurement,
  ]);

  const handleUseAssistedCuboidResult = useCallback(async () => {
    if (!capabilities || assistedCuboid.estimate.status !== 'ready' || !assistedCuboid.estimate.dimensions) {
      return;
    }

    const method = capabilities.platform === 'ios' ? 'arkit' : capabilities.platform === 'android' ? 'arcore' : 'camera';
    const measurement = createCuboidMeasurement({
      confidence: assistedCuboid.estimate.confidence,
      deviceCapabilities: toDeviceCapabilities(capabilities),
      height: assistedCuboid.estimate.dimensions.heightMeters,
      id: `assisted-ar-measurement-${Date.now()}`,
      length: assistedCuboid.estimate.dimensions.lengthMeters,
      measuredAt: new Date().toISOString(),
      measurementUnit: 'meter',
      method,
      scanSessionId: `assisted-ar-session-${Date.now()}`,
      status: 'completed',
      width: assistedCuboid.estimate.dimensions.widthMeters,
    });

    setCompletedMeasurement(measurement);
    setCurrentArStepIndex(manualCuboidSteps.length);
    await setCurrentMeasurement(measurement);
    await saveMeasurement(measurement);
    dispatchWorkflowEvent({ type: 'VALIDATION_SUCCESS' });
    setArSessionError(undefined);
  }, [
    assistedCuboid.estimate.confidence,
    assistedCuboid.estimate.dimensions,
    assistedCuboid.estimate.status,
    capabilities,
    saveMeasurement,
    setCurrentMeasurement,
  ]);

  const progressPercentage = Math.round(stage.progress * 100);

  if (forceCameraFallback) return <Redirect href={'/photo-measure?shape=cuboid' as Href} />;

  if (camera.permissionState === 'loading') {
    return (
      <Screen>
        <SectionHeader title="Measurement Screen" subtitle="Preparing camera permissions." />
        <View style={styles.statusCard}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.statusText}>Checking camera access...</Text>
        </View>
      </Screen>
    );
  }

  if (camera.permissionState !== 'granted') {
    return (
      <Screen>
        <SectionHeader title="Camera Access" subtitle="The camera is required for the measurement preview." />
        <View style={styles.permissionCard}>
          <Text style={styles.permissionTitle}>Camera permission needed</Text>
          <Text style={styles.permissionText}>
            POC Volume Finder uses the rear camera preview so the cuboid overlay can be shown on top of the
            object. Stable AR surface points provide the physical scale.
          </Text>
          <Text style={styles.permissionText}>
            {camera.permissionState === 'blocked'
              ? 'Camera access is blocked for this app. Open system settings, allow camera access, then retry.'
              : 'Tap allow camera to continue. Permission will only be requested from this button.'}
          </Text>
          {camera.permissionState === 'blocked' ? (
            <>
              <PrimaryButton
                label="Open Settings"
                onPress={() => {
                  void camera.openAppSettings();
                }}
              />
              <PrimaryButton
                label="Retry"
                onPress={() => {
                  void camera.refreshPermission();
                }}
                variant="secondary"
              />
              <PrimaryButton
                label="Return Home"
                onPress={() => router.replace(routes.home)}
                variant="secondary"
              />
            </>
          ) : (
            <>
              <PrimaryButton
                label="Allow Camera"
                onPress={() => {
                  void camera.requestPermission();
                }}
              />
              <PrimaryButton
                label="Return Home"
                onPress={() => router.replace(routes.home)}
                variant="secondary"
              />
            </>
          )}
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <SectionHeader
        title="Measurement Screen"
        subtitle={
          canUseNativeAr
            ? `${nativeArName} preview for manual point capture.`
            : 'Live Expo camera preview with a mocked cuboid measurement engine.'
        }
      />

      {!baseCanUseNativeAr && capabilityIssue ? (
        <MeasurementIssueCard
          issue={capabilityIssue}
          onPrimary={handleUseCameraFallback}
          primaryLabel="Continue with Camera Fallback"
        />
      ) : null}

      {forceCameraFallback && baseCanUseNativeAr ? (
        <MeasurementIssueCard
          issue={{
            action: 'Continue with Camera Fallback or retry AR measurement.',
            message: 'Camera Fallback is active for this scan.',
            title: 'Camera Fallback active',
            type: 'session_failure',
          }}
          onPrimary={handleRetryArSession}
          primaryLabel={`Retry ${nativeArName}`}
        />
      ) : null}

      {canUseNativeAr &&
      capabilityIssue &&
      (capabilityIssue.type === 'depth_unsupported' || capabilityIssue.type === 'lidar_unsupported') ? (
        <MeasurementIssueNotice issue={capabilityIssue} />
      ) : null}

      {canUseNativeAr ? (
        <OptionSelector
          label="Measurement mode"
          onChange={handleMeasurementModeChange}
          options={measurementModeOptions}
          value={measurementInteractionMode}
        />
      ) : null}

      {canUseNativeAr ? (
        <Pressable
          onLayout={handlePreviewLayout}
          onPress={(event) => {
            void handleArTap(event.nativeEvent.locationX, event.nativeEvent.locationY);
          }}
          style={styles.arPreview}
        >
          <VolumeMeasurementArView
            active={camera.isCameraActive && canUseNativeAr}
            style={StyleSheet.absoluteFill}
          />
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {isAutoAssistMode ? (
              <ObjectDetectionOverlay
                minConfidence={defaultObjectDetectionMinConfidence}
                result={objectDetectionState.result}
                status={objectDetectionState.status}
              />
            ) : null}
            <ManualMeasurementOverlay
              currentDistanceMeters={currentArDistance}
              isComplete={Boolean(completedMeasurement)}
              isReady={previewReady}
              markers={arMarkers}
              measurementLineMarkers={currentStepMarkers}
              stepTitle={currentArStep?.title ?? 'Measurement Complete'}
            />
          </View>
        </Pressable>
      ) : (
        <CameraPreview
          facing={camera.facing}
          isActive={camera.isCameraActive}
          key={cameraRestartKey}
          onCameraReady={handleCameraReady}
          onMountError={handleCameraMountError}
          ref={cameraPreviewRef}
        >
          <MeasurementOverlay
            isComplete={stageIndex === finalStageIndex}
            isReady={isCameraReady}
            progress={stage.progress}
          />
        </CameraPreview>
      )}

      {canUseNativeAr && arIssue && !completedMeasurement ? (
        <MeasurementIssueCard
          issue={arIssue}
          onPrimary={handleUseCameraFallback}
          onSecondary={handleRetryArSession}
          primaryLabel="Try Camera Fallback"
          secondaryLabel={`Retry ${nativeArName}`}
        />
      ) : null}

      {!canUseNativeAr && cameraIssue ? (
        <MeasurementIssueCard
          issue={cameraIssue}
          onPrimary={handleRetryCamera}
          onSecondary={() => router.replace(routes.home)}
          primaryLabel="Retry Camera"
          secondaryLabel="Return Home"
        />
      ) : null}

      {canUseNativeAr && currentArStep && !completedMeasurement ? (
        <>
          {trackingIssue ? <MeasurementIssueNotice issue={trackingIssue} /> : null}
          {surfaceIssue ? <MeasurementIssueNotice issue={surfaceIssue} /> : null}
          <GuidedArStepPanel
            canConfirm={canConfirmArDimension}
            currentDistanceMeters={currentArDistance}
            dimensionKey={currentArStep.key}
            isTrackingPoor={isArTrackingPoor}
            onConfirm={handleConfirmArDimension}
            onReset={handleResetArWorkflow}
            onRetry={handleRetryArDimension}
            onUndo={handleUndoArPoint}
            pointCount={currentArDimension?.points.length ?? 0}
            pointLabels={currentArStep.pointLabels}
            preferredLengthUnit={settings.preferredLengthUnit}
            quality={arDebugState}
            stepInstruction={currentArStep.instruction}
            stepTitle={currentArStep.title}
            validationMessage={currentArValidation.message}
          />
          {isAutoAssistMode ? (
            <>
              <ObjectDetectionStatusPanel nativeArName={nativeArName} state={objectDetectionState} />
              <AssistedCuboidStatusPanel
                nativeArName={nativeArName}
                onAccept={handleUseAssistedCuboidResult}
                onReset={assistedCuboid.reset}
                onSwitchToManual={() => handleMeasurementModeChange('manual')}
                preferredLengthUnit={settings.preferredLengthUnit}
                state={assistedCuboid}
              />
            </>
          ) : null}
          <ArDebugPanel state={arDebugState} />
        </>
      ) : canUseNativeAr && completedMeasurement ? (
        <>
          <CompletedArMeasurementPanel
            liters={arCompletedLiters}
            measurement={completedMeasurement}
            preferredDimensions={arCompletedDimensions}
            preferredVolume={arCompletedVolume}
          />
          <ArDebugPanel state={arDebugState} />
        </>
      ) : (
        <>
          <MeasurementInstructions progressPercentage={progressPercentage} stage={stage} />
          <MeasurementQualityIndicator
            cameraError={cameraError}
            isCameraReady={previewReady}
            quality={stage.quality}
          />
        </>
      )}

      {dimensions ? (
        <View style={styles.grid}>
          <MetricCard
            label="Length"
            value={formatMeasurement(dimensions.length, dimensions.unit, {
              maximumFractionDigits: 2,
              minimumFractionDigits: 2,
            })}
          />
          <MetricCard
            label="Width"
            value={formatMeasurement(dimensions.width, dimensions.unit, {
              maximumFractionDigits: 2,
              minimumFractionDigits: 2,
            })}
          />
          <MetricCard
            label="Height"
            value={formatMeasurement(dimensions.height, dimensions.unit, {
              maximumFractionDigits: 2,
              minimumFractionDigits: 2,
            })}
          />
        </View>
      ) : null}

      <PrimaryButton
        disabled={!completedMeasurement}
        label={completedMeasurement ? 'View Result' : canUseNativeAr ? 'Capture all dimensions' : 'Scanning...'}
        onPress={() => router.replace(routes.result)}
      />
    </Screen>
  );
}

function ManualMeasurementOverlay({
  currentDistanceMeters,
  isComplete,
  isReady,
  markers,
  measurementLineMarkers,
  stepTitle,
}: {
  currentDistanceMeters?: number;
  isComplete: boolean;
  isReady: boolean;
  markers: ArPointMarker[];
  measurementLineMarkers: ArPointMarker[];
  stepTitle: string;
}) {
  const lineStyle = getMeasurementLineStyle(measurementLineMarkers);

  return (
    <View style={styles.overlay}>
      <View style={[styles.surfaceLine, { opacity: isReady ? 0.42 : 0.2 }]} />
      <View style={styles.reticleHorizontal} />
      <View style={styles.reticleVertical} />
      {lineStyle ? <View style={[styles.measurementLine, lineStyle]} /> : null}
      {markers.map((marker) => (
        <View
          key={marker.id}
          style={[
            styles.pointMarker,
            {
              left: marker.screenX - 14,
              top: marker.screenY - 14,
            },
          ]}
        >
          <Text style={styles.pointMarkerText}>{marker.label}</Text>
        </View>
      ))}
      <View style={styles.overlayStatus}>
        <Text style={styles.overlayTitle}>{isComplete ? 'Measurement Complete' : stepTitle.toUpperCase()}</Text>
        <Text style={styles.overlayText}>
          {currentDistanceMeters === undefined
            ? isReady
              ? 'Tap two points'
              : 'Starting native AR...'
            : formatMeasurement(currentDistanceMeters, 'meter', {
                maximumFractionDigits: 3,
                minimumFractionDigits: 3,
              })}
        </Text>
      </View>
    </View>
  );
}

function MeasurementIssueCard({
  issue,
  onPrimary,
  onSecondary,
  primaryLabel,
  secondaryLabel = 'Return Home',
}: {
  issue: UserFacingMeasurementIssue;
  onPrimary?: () => void;
  onSecondary?: () => void;
  primaryLabel: string;
  secondaryLabel?: string;
}) {
  return (
    <View style={styles.issueCard}>
      <Text style={styles.issueTitle}>{issue.title}</Text>
      <Text style={styles.issueText}>{issue.message}</Text>
      <Text style={styles.issueText}>{issue.action}</Text>
      <View style={styles.actionRow}>
        <PrimaryButton
          label={primaryLabel}
          onPress={onPrimary ?? (() => undefined)}
          style={styles.compactButton}
          variant="secondary"
        />
        <PrimaryButton
          label={secondaryLabel}
          onPress={onSecondary ?? (() => router.replace(routes.home))}
          style={styles.compactButton}
          variant="secondary"
        />
      </View>
    </View>
  );
}

function MeasurementIssueNotice({ issue }: { issue: UserFacingMeasurementIssue }) {
  return (
    <View style={styles.issueNotice}>
      <Text style={styles.issueTitle}>{issue.title}</Text>
      <Text style={styles.issueText}>{issue.message}</Text>
      <Text style={styles.issueText}>{issue.action}</Text>
    </View>
  );
}

function ObjectDetectionStatusPanel({
  nativeArName,
  state,
}: {
  nativeArName: string;
  state: ObjectDetectionState;
}) {
  const confidence = state.result ? `${Math.round(state.result.confidence * 100)}%` : 'Waiting';
  const category = state.result?.category ?? 'box';
  const detectorName = state.result?.detectorName ?? 'Waiting';
  const detectorSource = state.result?.source ?? 'unavailable';
  const objectNotDetectedIssue = getUserFacingMeasurementIssue({ message: 'object not detected' });
  const statusText = (() => {
    if (state.status === 'detecting') {
      return 'Scanning preview for a box-like object.';
    }

    if (state.status === 'ready') {
      return `Detected ${category}. Use the suggested outline to tap ${nativeArName} corner points.`;
    }

    if (state.status === 'low_confidence') {
      return 'Detection confidence is low. Continue with manual AR point selection.';
    }

    if (state.status === 'unavailable') {
      return 'Auto detection is unavailable. Manual AR point selection remains available.';
    }

    if (state.status === 'error') {
      return state.error ?? 'Auto detection failed. Manual AR point selection remains available.';
    }

    return `${objectNotDetectedIssue.message} ${objectNotDetectedIssue.action}`;
  })();

  return (
    <View style={styles.detectionCard}>
      <View style={styles.debugRow}>
        <Text style={styles.debugLabel}>Object detection</Text>
        <Text style={styles.debugValue}>{state.status.replace('_', ' ')}</Text>
      </View>
      <View style={styles.debugRow}>
        <Text style={styles.debugLabel}>Detected object</Text>
        <Text style={styles.debugValue}>
          {state.result ? `${category} ${confidence}` : confidence}
        </Text>
      </View>
      <View style={styles.debugRow}>
        <Text style={styles.debugLabel}>Detector</Text>
        <Text style={styles.debugValue}>
          {state.result ? `${detectorName} (${detectorSource})` : detectorName}
        </Text>
      </View>
      <Text style={styles.detectionText}>{statusText}</Text>
    </View>
  );
}

function AssistedCuboidStatusPanel({
  nativeArName,
  onAccept,
  onReset,
  onSwitchToManual,
  preferredLengthUnit,
  state,
}: {
  nativeArName: string;
  onAccept: () => void;
  onReset: () => void;
  onSwitchToManual: () => void;
  preferredLengthUnit: MeasurementUnit;
  state: AssistedCuboidEstimationState & { reset: () => void };
}) {
  const { estimate } = state;
  const dimensions = estimate.dimensions;
  const latestObservation = state.latestObservation;
  const convertedDimensions = dimensions
    ? {
        height: convertLength(dimensions.heightMeters, 'meter', preferredLengthUnit),
        length: convertLength(dimensions.lengthMeters, 'meter', preferredLengthUnit),
        width: convertLength(dimensions.widthMeters, 'meter', preferredLengthUnit),
      }
    : undefined;
  const liters =
    estimate.volumeCubicMeters === undefined
      ? undefined
      : convertVolume(estimate.volumeCubicMeters, 'cubic_meter', 'liter');
  const progress = Math.round(estimate.scanProgress * 100);
  const statusText = (() => {
    if (state.isCollecting) {
      return 'Projecting detected corners into AR/depth space. Hold steady.';
    }

    if (estimate.status === 'ready') {
      return 'Assisted cuboid fit is ready. Review the result before saving.';
    }

    if (estimate.status === 'insufficient_confidence') {
      return 'Assisted fit is not confident enough. Continue scanning or switch to Manual Mode.';
    }

    if (estimate.status === 'collecting') {
      return `Move slowly around the box so ${nativeArName} can see stable edges and corners.`;
    }

    return 'Waiting for a confident detected box and stable tracking.';
  })();

  return (
    <View style={styles.assistedCard}>
      <View style={styles.debugRow}>
        <Text style={styles.debugLabel}>Assisted cuboid</Text>
        <Text style={styles.debugValue}>{state.isCollecting ? 'sampling' : estimate.status.replace('_', ' ')}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>
      <View style={styles.debugRow}>
        <Text style={styles.debugLabel}>Scan progress</Text>
        <Text style={styles.debugValue}>
          {estimate.acceptedObservationCount}/{estimate.requiredObservationCount} observations
        </Text>
      </View>
      <View style={styles.debugRow}>
        <Text style={styles.debugLabel}>Rejected observations</Text>
        <Text style={styles.debugValue}>{String(estimate.rejectedObservationCount)}</Text>
      </View>
      <View style={styles.debugRow}>
        <Text style={styles.debugLabel}>Projected corners</Text>
        <Text style={styles.debugValue}>
          {latestObservation
            ? `${latestObservation.projectedCandidateCount} (${latestObservation.inferredCandidateCount} inferred)`
            : 'Waiting'}
        </Text>
      </View>
      <View style={styles.debugRow}>
        <Text style={styles.debugLabel}>Geometry score</Text>
        <Text style={styles.debugValue}>{formatPercent(latestObservation?.geometry.score)}</Text>
      </View>
      <View style={styles.debugRow}>
        <Text style={styles.debugLabel}>Confidence</Text>
        <Text style={styles.debugValue}>
          {estimate.confidence.level.toUpperCase()} {formatPercent(estimate.confidence.score)}
        </Text>
      </View>
      {convertedDimensions && liters !== undefined ? (
        <View style={styles.assistedMetrics}>
          <Text style={styles.assistedMetricText}>
            L {formatMeasurement(convertedDimensions.length, preferredLengthUnit, { maximumFractionDigits: 3 })}
          </Text>
          <Text style={styles.assistedMetricText}>
            W {formatMeasurement(convertedDimensions.width, preferredLengthUnit, { maximumFractionDigits: 3 })}
          </Text>
          <Text style={styles.assistedMetricText}>
            H {formatMeasurement(convertedDimensions.height, preferredLengthUnit, { maximumFractionDigits: 3 })}
          </Text>
          <Text style={styles.assistedMetricText}>
            {formatMeasurement(liters, 'liter', { maximumFractionDigits: 2 })}
          </Text>
        </View>
      ) : null}
      <Text style={styles.detectionText}>{statusText}</Text>
      {state.lastError ? <Text style={styles.warningText}>{state.lastError}</Text> : null}
      {estimate.reasons.map((reason) => (
        <Text key={reason} style={styles.warningText}>
          {reason}
        </Text>
      ))}
      {estimate.status !== 'ready' ? (
        <View style={styles.guidanceBox}>
          {assistedGuidance.map((guidance) => (
            <Text key={guidance} style={styles.guidanceText}>
              {guidance}
            </Text>
          ))}
        </View>
      ) : null}
      <View style={styles.actionRow}>
        <PrimaryButton
          label="Manual Mode"
          onPress={onSwitchToManual}
          style={styles.compactButton}
          variant="secondary"
        />
        <PrimaryButton
          label="Reset Assist"
          onPress={onReset}
          style={styles.compactButton}
          variant="secondary"
        />
      </View>
      <PrimaryButton
        disabled={estimate.status !== 'ready'}
        label="Use Assisted Result"
        onPress={onAccept}
      />
    </View>
  );
}

function GuidedArStepPanel({
  canConfirm,
  currentDistanceMeters,
  dimensionKey,
  isTrackingPoor,
  onConfirm,
  onReset,
  onRetry,
  onUndo,
  pointCount,
  pointLabels,
  preferredLengthUnit,
  quality,
  stepInstruction,
  stepTitle,
  validationMessage,
}: {
  canConfirm: boolean;
  currentDistanceMeters?: number;
  dimensionKey: ManualCuboidDimensionKey;
  isTrackingPoor: boolean;
  onConfirm: () => void;
  onReset: () => void;
  onRetry: () => void;
  onUndo: () => void;
  pointCount: number;
  pointLabels: [string, string];
  preferredLengthUnit: MeasurementUnit;
  quality: ArDebugState;
  stepInstruction: string;
  stepTitle: string;
  validationMessage?: string;
}) {
  const convertedDistance =
    currentDistanceMeters === undefined
      ? undefined
      : convertLength(currentDistanceMeters, 'meter', preferredLengthUnit);

  return (
    <View style={styles.workflowCard}>
      <Text style={styles.workflowEyebrow}>{stepTitle.toUpperCase()}</Text>
      <Text style={styles.workflowInstruction}>{stepInstruction}</Text>
      <View style={styles.pointChecklist}>
        {pointLabels.map((label, index) => (
          <Text key={label} style={styles.pointChecklistText}>
            Point {label} {pointCount > index ? '\u2713' : '\u25CB'}
          </Text>
        ))}
      </View>
      <Text style={styles.currentDimensionText}>
        {dimensionKey[0].toUpperCase() + dimensionKey.slice(1)}:{' '}
        {convertedDistance === undefined
          ? 'waiting for two points'
          : formatMeasurement(convertedDistance, preferredLengthUnit, {
              maximumFractionDigits: 3,
              minimumFractionDigits: 3,
            })}
      </Text>
      <View style={styles.qualityRow}>
        <Text style={styles.qualityText}>Mode: {formatMeasurementMode(quality.measurementMode)}</Text>
        <Text style={styles.qualityText}>
          Quality: {quality.qualityLevel ?? 'WAITING'} {formatPercent(quality.measurementConfidence ?? quality.trackingQuality)}
        </Text>
      </View>
      <View style={styles.qualityRow}>
        <Text style={styles.qualityText}>Depth: {quality.depthAvailable ? 'Available' : 'Not active'}</Text>
        <Text style={styles.qualityText}>Depth confidence: {formatPercent(quality.depthConfidence)}</Text>
      </View>
      {validationMessage && pointCount === 2 ? (
        <Text style={styles.warningText}>{validationMessage}</Text>
      ) : null}
      {isTrackingPoor ? (
        <Text style={styles.warningText}>Tracking quality is limited. Move slowly and keep the box visible.</Text>
      ) : null}
      {quality.qualityLevel === 'LOW' ? (
        <View style={styles.guidanceBox}>
          {qualityGuidance.map((guidance) => (
            <Text key={guidance} style={styles.guidanceText}>
              {guidance}
            </Text>
          ))}
        </View>
      ) : null}
      <View style={styles.actionRow}>
        <PrimaryButton
          disabled={pointCount === 0}
          label="Undo Point"
          onPress={onUndo}
          style={styles.compactButton}
          variant="secondary"
        />
        <PrimaryButton
          disabled={pointCount === 0}
          label="Retry"
          onPress={onRetry}
          style={styles.compactButton}
          variant="secondary"
        />
      </View>
      <View style={styles.actionRow}>
        <PrimaryButton label="Reset" onPress={onReset} style={styles.compactButton} variant="danger" />
        <PrimaryButton
          disabled={!canConfirm}
          label="Confirm"
          onPress={onConfirm}
          style={styles.compactButton}
        />
      </View>
    </View>
  );
}

function CompletedArMeasurementPanel({
  liters,
  measurement,
  preferredDimensions,
  preferredVolume,
}: {
  liters?: DisplayedVolume;
  measurement: Measurement;
  preferredDimensions?: DisplayedDimensions;
  preferredVolume?: DisplayedVolume;
}) {
  if (!preferredDimensions || !preferredVolume || !liters) {
    return null;
  }

  return (
    <View style={styles.workflowCard}>
      <Text style={styles.workflowEyebrow}>CUBOID MEASUREMENT COMPLETE</Text>
      <View style={styles.summaryGrid}>
        <MetricCard
          label="Length"
          value={formatMeasurement(preferredDimensions.length, preferredDimensions.unit, {
            maximumFractionDigits: 3,
          })}
        />
        <MetricCard
          label="Width"
          value={formatMeasurement(preferredDimensions.width, preferredDimensions.unit, {
            maximumFractionDigits: 3,
          })}
        />
        <MetricCard
          label="Height"
          value={formatMeasurement(preferredDimensions.height, preferredDimensions.unit, {
            maximumFractionDigits: 3,
          })}
        />
        <MetricCard
          label="Volume"
          value={formatMeasurement(preferredVolume.value, preferredVolume.unit, {
            maximumFractionDigits: 3,
          })}
        />
        <MetricCard
          label="Liters"
          value={formatMeasurement(liters.value, liters.unit, {
            maximumFractionDigits: 2,
          })}
        />
        <MetricCard
          label="Confidence"
          value={`${Math.round(measurement.confidence.score * 100)}%`}
        />
      </View>
      <Text style={styles.savedText}>Measurement saved locally.</Text>
    </View>
  );
}

function ArDebugPanel({ state }: { state: ArDebugState }) {
  return (
    <View style={styles.debugCard}>
      <Text style={styles.debugTitle}>AR Debug</Text>
      <DebugRow label="Mode" value={formatMeasurementMode(state.measurementMode)} />
      <DebugRow label="Tracking" value={state.trackingState} />
      <DebugRow label="Tracking quality" value={formatPercent(state.trackingQuality)} />
      <DebugRow label="Depth available" value={state.depthAvailable ? 'Yes' : 'No'} />
      <DebugRow label="Depth confidence" value={formatPercent(state.depthConfidence)} />
      <DebugRow label="Measurement confidence" value={formatPercent(state.measurementConfidence)} />
      <DebugRow label="Quality level" value={state.qualityLevel ?? 'Waiting'} />
      <DebugRow
        label="Hit stability"
        value={formatMeters(state.hitStabilityMeters, 'Waiting')}
      />
      <DebugRow label="Valid depth frames" value={String(state.validDepthFrameCount ?? 0)} />
      <DebugRow label="Detected planes" value={String(state.planeCount)} />
      <DebugRow label="Selected points" value={String(state.selectedPointsCount)} />
      <DebugRow label="Latest point" value={formatPoint(state.latestPoint)} />
      <DebugRow
        label="Last distance"
        value={formatMeters(state.distanceBetweenLastTwoMeters, 'Select two points')}
      />
    </View>
  );
}

function createConfidenceFromWorkflow(state: ManualCuboidWorkflowState): MeasurementConfidence {
  const qualities = [state.length, state.width, state.height]
    .flatMap((dimension) => dimension.points)
    .map((point) => (point as CapturedArPoint).quality)
    .filter((quality): quality is NativePointQuality => Boolean(quality));
  const scores = qualities
    .map((quality) => quality.measurementConfidence)
    .filter((score): score is number => score !== undefined && Number.isFinite(score));
  const score =
    scores.length === 0 ? 0 : scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const hasDepth = qualities.some((quality) => quality.depthAvailable);
  const stabilitySamples = qualities.filter((quality) => quality.hitStabilityMeters !== undefined).length;
  const lowQualitySamples = qualities.filter((quality) => quality.qualityLevel === 'LOW').length;
  const hasArKit = qualities.some((quality) => quality.trackableType?.startsWith('AR'));
  const nativeArName = hasArKit ? 'ARKit' : 'ARCore';

  return {
    factors: [
      `Manual ${nativeArName} point selection`,
      hasDepth ? 'Depth-assisted hit testing' : `Standard ${nativeArName} hit testing`,
      `${stabilitySamples} points include temporal stability samples`,
      `${lowQualitySamples} low-quality points`,
    ],
    level: score >= 0.8 ? 'high' : score >= 0.5 ? 'medium' : 'low',
    score,
  };
}

function DebugRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.debugRow}>
      <Text style={styles.debugLabel}>{label}</Text>
      <Text style={styles.debugValue}>{value}</Text>
    </View>
  );
}

function formatPoint(point?: ArDebugState['latestPoint']) {
  if (!point) {
    return 'None';
  }

  const x = point.x ?? point.xMeters;
  const y = point.y ?? point.yMeters;
  const z = point.z ?? point.zMeters;

  return `x ${x.toFixed(3)}, y ${y.toFixed(3)}, z ${z.toFixed(3)}`;
}

function formatMeasurementMode(mode?: MeasurementMode) {
  if (mode === 'ar_depth') {
    return 'AR Depth';
  }

  if (mode === 'standard_ar') {
    return 'Standard AR';
  }

  if (mode === 'camera_fallback') {
    return 'Camera fallback';
  }

  return 'Checking';
}

function formatPercent(value?: number) {
  if (value === undefined || !Number.isFinite(value)) {
    return 'Waiting';
  }

  return `${Math.round(value * 100)}%`;
}

function formatMeters(value: number | null | undefined, fallback: string) {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value.toFixed(3)} m`
    : fallback;
}

function getQualityLevel(score?: number): ArDebugState['qualityLevel'] {
  if (score === undefined || !Number.isFinite(score)) {
    return undefined;
  }

  if (score >= 0.78) {
    return 'HIGH';
  }

  if (score >= 0.5) {
    return 'MEDIUM';
  }

  return 'LOW';
}

function mergeArDebugState(
  currentState: ArDebugState,
  nextState: Partial<ArDebugState>,
): ArDebugState {
  let hasChanged = false;

  Object.entries(nextState).forEach(([key, value]) => {
    const currentValue = currentState[key as keyof ArDebugState];
    if (!Object.is(currentValue, value)) {
      hasChanged = true;
    }
  });

  return hasChanged ? { ...currentState, ...nextState } : currentState;
}

const qualityGuidance = [
  'Move device slowly',
  'Improve lighting',
  'Move closer',
  'Keep object fully visible',
  'Hold camera steady',
];

const assistedGuidance = [
  'Move slowly around the box',
  'Keep visible corners inside the outline',
  'Hold steady when the outline appears',
  'Switch to Manual Mode if corners are unclear',
];

function getMeasurementLineStyle(markers: ArPointMarker[]) {
  if (markers.length !== 2) {
    return undefined;
  }

  const [firstMarker, secondMarker] = markers;
  const dx = secondMarker.screenX - firstMarker.screenX;
  const dy = secondMarker.screenY - firstMarker.screenY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  return {
    left: firstMarker.screenX + dx / 2 - distance / 2,
    top: firstMarker.screenY + dy / 2,
    transform: [{ rotate: `${angle}deg` }],
    width: distance,
  };
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  arPreview: {
    aspectRatio: 3 / 4,
    backgroundColor: colors.cameraPreview,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  assistedCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  assistedMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  assistedMetricText: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.caption,
    fontWeight: '800',
    lineHeight: 18,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
  },
  compactButton: {
    flex: 1,
    minHeight: 46,
  },
  currentDimensionText: {
    color: colors.text,
    fontSize: typography.subtitle,
    fontWeight: '800',
    lineHeight: 24,
  },
  debugCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  debugLabel: {
    color: colors.mutedText,
    flex: 1,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  debugRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  debugTitle: {
    color: colors.text,
    fontSize: typography.subtitle,
    fontWeight: '800',
  },
  debugValue: {
    color: colors.text,
    flex: 1,
    fontSize: typography.caption,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'right',
  },
  detectionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  detectionText: {
    color: colors.mutedText,
    fontSize: typography.caption,
    fontWeight: '700',
    lineHeight: 18,
  },
  errorText: {
    color: colors.danger,
    fontSize: typography.body,
    fontWeight: '700',
    lineHeight: 22,
  },
  grid: {
    gap: spacing.sm,
  },
  guidanceBox: {
    backgroundColor: '#FFF8EB',
    borderColor: '#FEDF89',
    borderRadius: 8,
    borderWidth: 1,
    gap: 2,
    padding: spacing.sm,
  },
  guidanceText: {
    color: colors.warning,
    fontSize: typography.caption,
    fontWeight: '700',
    lineHeight: 18,
  },
  issueCard: {
    backgroundColor: '#FFF8EB',
    borderColor: '#FEDF89',
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  issueNotice: {
    backgroundColor: '#FFF8EB',
    borderColor: '#FEDF89',
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.sm,
  },
  issueText: {
    color: colors.mutedText,
    fontSize: typography.body,
    lineHeight: 22,
  },
  issueTitle: {
    color: colors.warning,
    fontSize: typography.subtitle,
    fontWeight: '800',
  },
  measurementLine: {
    backgroundColor: colors.success,
    height: 3,
    position: 'absolute',
  },
  overlay: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  overlayStatus: {
    alignSelf: 'center',
    backgroundColor: 'rgba(17,24,39,0.72)',
    borderRadius: 8,
    bottom: spacing.md,
    gap: 2,
    maxWidth: '88%',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    position: 'absolute',
  },
  overlayText: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: typography.caption,
    fontWeight: '700',
    textAlign: 'center',
  },
  overlayTitle: {
    color: colors.inverseText,
    fontSize: typography.caption,
    fontWeight: '900',
    textAlign: 'center',
  },
  permissionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  permissionText: {
    color: colors.mutedText,
    fontSize: typography.body,
    lineHeight: 22,
  },
  permissionTitle: {
    color: colors.text,
    fontSize: typography.subtitle,
    fontWeight: '700',
  },
  pointChecklist: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  pointChecklistText: {
    color: colors.text,
    flex: 1,
    fontSize: typography.body,
    fontWeight: '700',
    lineHeight: 22,
  },
  pointMarker: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderColor: colors.inverseText,
    borderRadius: 14,
    borderWidth: 2,
    height: 28,
    justifyContent: 'center',
    position: 'absolute',
    width: 28,
  },
  pointMarkerText: {
    color: colors.inverseText,
    fontSize: typography.caption,
    fontWeight: '900',
  },
  progressFill: {
    backgroundColor: colors.success,
    borderRadius: 999,
    height: '100%',
  },
  progressTrack: {
    backgroundColor: colors.border,
    borderRadius: 999,
    height: 8,
    overflow: 'hidden',
  },
  qualityRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  qualityText: {
    color: colors.mutedText,
    flex: 1,
    fontSize: typography.caption,
    fontWeight: '700',
    lineHeight: 18,
  },
  reticleHorizontal: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    height: 1,
    position: 'absolute',
    top: '50%',
    width: 72,
  },
  reticleVertical: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    height: 72,
    position: 'absolute',
    top: '42%',
    width: 1,
  },
  savedText: {
    color: colors.success,
    fontSize: typography.body,
    fontWeight: '800',
  },
  statusCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  statusText: {
    color: colors.mutedText,
    fontSize: typography.body,
  },
  summaryGrid: {
    gap: spacing.sm,
  },
  surfaceLine: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.32)',
    bottom: '24%',
    height: 2,
    position: 'absolute',
    transform: [{ rotate: '-5deg' }],
    width: '115%',
  },
  warningText: {
    color: colors.warning,
    fontSize: typography.caption,
    fontWeight: '700',
    lineHeight: 18,
  },
  workflowCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  workflowEyebrow: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: '900',
    letterSpacing: 0,
  },
  workflowInstruction: {
    color: colors.mutedText,
    fontSize: typography.body,
    lineHeight: 22,
  },
});
