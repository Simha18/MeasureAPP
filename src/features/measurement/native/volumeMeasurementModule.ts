import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';

import { mockNativeMeasurementModule } from './mockNativeMeasurementModule';
import { getCurrentDevicePlatform } from './platform';
import { getMeasurementMode, toDeviceCapabilities } from './capabilities';
import {
  normalizeWorldPointValue,
  smoothWorldPointSamples,
  type WorldPointSample,
} from './sampleSmoothing';
import type { MeasurementMethod } from '../types';
import type {
  CurrentNativeMeasurement,
  DepthSample,
  HitTestResult,
  MeasurementCapabilityReport,
  MeasurementMode,
  NativeMeasurementModule,
  NativePointQuality,
  NativeSessionResult,
  NativeWorldPoint3D,
  ScreenPoint,
  TrackingState,
  VolumeMeasurementNativeEventMap,
  VolumeMeasurementNativeEventName,
  VolumeMeasurementNativeModule,
  WorldPointResult,
} from './types';

const temporalSampleCount = 8;
const temporalSampleDelayMs = 45;
const enableMeasurementDebugLogs = Boolean(
  (globalThis as { __VOLUME_MEASUREMENT_DEBUG__?: boolean }).__VOLUME_MEASUREMENT_DEBUG__,
);

const nativeModule =
  requireOptionalNativeModule<VolumeMeasurementNativeModule>('VolumeMeasurementModule');

function createNoopSubscription(): EventSubscription {
  return {
    remove() {
      return undefined;
    },
  };
}

function normalizeMeasurementMode(mode: string | undefined): MeasurementMode {
  if (mode === 'ar_depth' || mode === 'standard_ar' || mode === 'camera_fallback') {
    return mode;
  }

  return 'camera_fallback';
}

function normalizeTrackingState(status: string | undefined): TrackingState['status'] {
  if (
    status === 'not_available' ||
    status === 'idle' ||
    status === 'tracking' ||
    status === 'limited' ||
    status === 'stopped'
  ) {
    return status;
  }

  return 'idle';
}

function normalizeCapabilities(
  capabilities: Awaited<ReturnType<VolumeMeasurementNativeModule['getCapabilities']>>,
): MeasurementCapabilityReport {
  const base = {
    arSupported: Boolean(capabilities.arSupported),
    depthSupported: Boolean(capabilities.depthSupported),
    fallbackMeasurementAvailable: Boolean(capabilities.fallbackMeasurementAvailable),
    lidarSupported: Boolean(capabilities.lidarSupported),
    nativeMeasurementAvailable: Boolean(capabilities.nativeMeasurementAvailable),
    platform: capabilities.platform ?? getCurrentDevicePlatform(),
  };

  return {
    ...base,
    detectionSource: 'native',
    mode: getMeasurementMode(base),
    reason: capabilities.reason,
  };
}

function createSessionResult(
  sessionState: Awaited<ReturnType<VolumeMeasurementNativeModule['startSession']>>,
  capabilities: MeasurementCapabilityReport,
): NativeSessionResult {
  const now = new Date().toISOString();

  return {
    session: {
      deviceCapabilities: toDeviceCapabilities(capabilities),
      id: `native-session-${Date.now()}`,
      method: getNativeMeasurementMethod(capabilities),
      planes: [],
      points: [],
      startedAt: now,
      status: sessionState.active ? 'scanning' : 'idle',
    },
    reason: sessionState.error ?? sessionState.reason,
    started: sessionState.active,
  };
}

function getNativeMeasurementMethod(capabilities: MeasurementCapabilityReport): MeasurementMethod {
  if (!capabilities.arSupported || !capabilities.nativeMeasurementAvailable) {
    return 'camera';
  }

  if (capabilities.platform === 'ios') {
    return 'arkit';
  }

  if (capabilities.platform === 'android') {
    return 'arcore';
  }

  return 'camera';
}

function normalizeFiniteNumber(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function normalizePointQuality(point: Partial<NativePointQuality>): NativePointQuality {
  return {
    depthAvailable: point.depthAvailable,
    depthConfidence: normalizeFiniteNumber(point.depthConfidence),
    depthMeters: normalizeFiniteNumber(point.depthMeters),
    hitDistanceMeters: normalizeFiniteNumber(point.hitDistanceMeters),
    hitStabilityMeters: normalizeFiniteNumber(point.hitStabilityMeters),
    measurementConfidence: normalizeFiniteNumber(point.measurementConfidence),
    planeId: point.planeId,
    qualityLevel: point.qualityLevel,
    sampleCount: normalizeFiniteNumber(point.sampleCount),
    source: point.source,
    trackableType: point.trackableType,
    trackingQuality: normalizeFiniteNumber(point.trackingQuality),
    validDepthFrameCount: normalizeFiniteNumber(point.validDepthFrameCount),
  };
}

function normalizeWorldPoint(
  point: Awaited<ReturnType<VolumeMeasurementNativeModule['getWorldPoint']>>,
): WorldPointResult {
  if ('reason' in point) {
    return {
      reason: point.reason,
    };
  }

  return {
    point: normalizeWorldPointValue(point),
    quality: normalizePointQuality(point),
  };
}

function normalizeEstimatedWorldPoint(
  point:
    | Awaited<ReturnType<NonNullable<VolumeMeasurementNativeModule['estimateWorldPoint']>>>
    | (NativeWorldPoint3D & Partial<NativePointQuality>)
    | { reason: string },
): WorldPointResult {
  if ('reason' in point) {
    return {
      reason: point.reason,
    };
  }

  return {
    point: normalizeWorldPointValue(point),
    quality: normalizePointQuality(point),
  };
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function normalizeDepthSample(sample: DepthSample): DepthSample {
  return {
    confidence: normalizeFiniteNumber(sample.confidence),
    depthAvailable: sample.depthAvailable,
    depthConfidence: normalizeFiniteNumber(sample.depthConfidence ?? sample.confidence),
    depthMeters: normalizeFiniteNumber(sample.depthMeters),
    frameTimestamp: normalizeFiniteNumber(sample.frameTimestamp),
    reason: sample.reason,
    validFrameCount: normalizeFiniteNumber(sample.validFrameCount),
  };
}

async function getSmoothedWorldPoint(screenPoint: ScreenPoint): Promise<WorldPointResult | undefined> {
  if (!nativeModule?.estimateWorldPoint || !nativeModule.recordWorldPoint) {
    return undefined;
  }

  const rawSamples: WorldPointSample[] = [];
  let lastReason: string | undefined;

  for (let index = 0; index < temporalSampleCount; index += 1) {
    const estimate = await nativeModule.estimateWorldPoint(screenPoint.x, screenPoint.y);

    if ('reason' in estimate) {
      lastReason = estimate.reason;
    } else {
      rawSamples.push(estimate);
    }

    if (index < temporalSampleCount - 1) {
      await sleep(temporalSampleDelayMs);
    }
  }

  const smoothingResult = smoothWorldPointSamples(rawSamples, {
    minimumAcceptedSamples: 3,
  });

  logPointSmoothing({
    rawSamples,
    result: smoothingResult,
    screenPoint,
  });

  if (!smoothingResult) {
    return {
      reason: lastReason ?? 'No stable AR world point was found at this screen point.',
    };
  }

  const point = normalizeWorldPointValue(smoothingResult.finalPoint);
  const quality: NativePointQuality = {
    depthAvailable: smoothingResult.acceptedSamples.some((sample) => sample.depthAvailable),
    depthConfidence: averageFinite(smoothingResult.acceptedSamples.map((sample) => sample.depthConfidence)),
    depthMeters: averageFinite(smoothingResult.acceptedSamples.map((sample) => sample.depthMeters)),
    hitDistanceMeters: averageFinite(smoothingResult.acceptedSamples.map((sample) => sample.hitDistanceMeters)),
    hitStabilityMeters: Math.sqrt(smoothingResult.sampleVarianceMetersSquared),
    measurementConfidence: smoothingResult.qualityScore,
    planeId: getMostCommonPlaneId(smoothingResult.acceptedSamples),
    qualityLevel: smoothingResult.qualityLevel,
    sampleCount: smoothingResult.acceptedSamples.length,
    source: getMostCommonSource(smoothingResult.acceptedSamples),
    trackableType: smoothingResult.acceptedSamples.find((sample) => sample.trackableType)?.trackableType,
    trackingQuality: averageFinite(smoothingResult.acceptedSamples.map((sample) => sample.trackingQuality)),
    validDepthFrameCount: Math.max(
      0,
      ...smoothingResult.acceptedSamples.map((sample) => sample.validDepthFrameCount ?? 0),
    ),
  };
  const recordResult = await nativeModule.recordWorldPoint(point.xMeters, point.yMeters, point.zMeters);

  if ('reason' in recordResult) {
    return {
      reason: recordResult.reason,
    };
  }

  void nativeModule.getCurrentMeasurement().then((measurement) => {
    logPointCommit({
      finalDimensionMeters: measurement.distanceBetweenLastTwoMeters,
      finalPoint: point,
      quality,
    });
  });

  return {
    point,
    quality,
  };
}

function averageFinite(values: (number | undefined)[]) {
  const finiteValues = values.filter((value): value is number => {
    return value !== undefined && Number.isFinite(value);
  });

  if (finiteValues.length === 0) {
    return undefined;
  }

  return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
}

function getMostCommonSource(samples: WorldPointSample[]): NativePointQuality['source'] {
  const sourceCounts = samples.reduce<Record<string, number>>((counts, sample) => {
    const source = sample.source ?? 'unknown';
    counts[source] = (counts[source] ?? 0) + 1;
    return counts;
  }, {});
  const source = Object.entries(sourceCounts).sort((first, second) => second[1] - first[1])[0]?.[0];

  return source as NativePointQuality['source'];
}

function getMostCommonPlaneId(samples: WorldPointSample[]) {
  const planeCounts = samples.reduce<Record<string, number>>((counts, sample) => {
    if (!sample.planeId) {
      return counts;
    }

    counts[sample.planeId] = (counts[sample.planeId] ?? 0) + 1;
    return counts;
  }, {});

  return Object.entries(planeCounts).sort((first, second) => second[1] - first[1])[0]?.[0];
}

function logPointSmoothing(input: {
  rawSamples: WorldPointSample[];
  result?: ReturnType<typeof smoothWorldPointSamples>;
  screenPoint: ScreenPoint;
}) {
  if (!enableMeasurementDebugLogs) {
    return;
  }

  console.info('[VolumeMeasurement] point smoothing', {
    finalPoint: input.result?.finalPoint,
    qualityLevel: input.result?.qualityLevel,
    qualityScore: input.result?.qualityScore,
    acceptedSampleCount: input.result?.acceptedSamples.length ?? 0,
    discardedSampleCount: input.result?.discardedSamples.length ?? 0,
    rawSampleCount: input.rawSamples.length,
    screenPoint: input.screenPoint,
    variance: input.result?.sampleVarianceMetersSquared,
  });
}

function logPointCommit(input: {
  finalDimensionMeters?: number;
  finalPoint: NativeWorldPoint3D;
  quality: NativePointQuality;
}) {
  if (!enableMeasurementDebugLogs) {
    return;
  }

  console.info('[VolumeMeasurement] point committed', input);
}

function normalizeMeasurement(
  measurement: CurrentNativeMeasurement | undefined,
): CurrentNativeMeasurement | undefined {
  if (!measurement) {
    return undefined;
  }

  return {
    confidence: Number(measurement.confidence),
    heightMeters: Number(measurement.heightMeters),
    depthAvailable: measurement.depthAvailable,
    depthConfidence: normalizeFiniteNumber(measurement.depthConfidence),
    depthFrameCount: normalizeFiniteNumber(measurement.depthFrameCount),
    latestPoint: measurement.latestPoint
      ? normalizeWorldPointValue(measurement.latestPoint as NativeWorldPoint3D)
      : undefined,
    lengthMeters: Number(measurement.lengthMeters),
    measurementConfidence: normalizeFiniteNumber(measurement.measurementConfidence),
    measurementMode: normalizeMeasurementMode(measurement.measurementMode),
    distanceBetweenLastTwoMeters:
      measurement.distanceBetweenLastTwoMeters === undefined
        ? undefined
        : Number(measurement.distanceBetweenLastTwoMeters),
    hitStabilityMeters: normalizeFiniteNumber(measurement.hitStabilityMeters),
    selectedPointsCount: measurement.selectedPointsCount,
    simulated: measurement.simulated,
    trackingQuality: normalizeFiniteNumber(measurement.trackingQuality),
    trackingState: normalizeTrackingState(measurement.trackingState),
    validDepthFrameCount: normalizeFiniteNumber(measurement.validDepthFrameCount),
    volumeCubicMeters: Number(measurement.volumeCubicMeters),
    widthMeters: Number(measurement.widthMeters),
  };
}

export function isVolumeMeasurementModuleAvailable() {
  return nativeModule !== null;
}

export function addVolumeMeasurementListener<TEventName extends VolumeMeasurementNativeEventName>(
  eventName: TEventName,
  listener: VolumeMeasurementNativeEventMap[TEventName],
): EventSubscription {
  return nativeModule?.addListener(eventName, listener) ?? createNoopSubscription();
}

export function subscribeToVolumeMeasurementEvents(
  listeners: Partial<VolumeMeasurementNativeEventMap>,
): () => void {
  const subscriptions = Object.entries(listeners).map(([eventName, listener]) => {
    return addVolumeMeasurementListener(
      eventName as VolumeMeasurementNativeEventName,
      listener as VolumeMeasurementNativeEventMap[VolumeMeasurementNativeEventName],
    );
  });

  return () => {
    subscriptions.forEach((subscription) => subscription.remove());
  };
}

export const volumeMeasurementModuleAdapter: NativeMeasurementModule = {
  async estimateWorldPoint(screenPoint: ScreenPoint) {
    if (!nativeModule) {
      return mockNativeMeasurementModule.estimateWorldPoint(screenPoint);
    }

    if (nativeModule.estimateWorldPoint) {
      return normalizeEstimatedWorldPoint(await nativeModule.estimateWorldPoint(screenPoint.x, screenPoint.y));
    }

    const hits = await nativeModule.performHitTest(screenPoint.x, screenPoint.y);
    const firstHitWithPoint = hits.find((hit) => hit.worldPoint);

    if (!firstHitWithPoint?.worldPoint) {
      return {
        reason: 'No stable AR world point was found at this screen point.',
      };
    }

    return normalizeEstimatedWorldPoint({
      ...(firstHitWithPoint.worldPoint as NativeWorldPoint3D),
      hitDistanceMeters: firstHitWithPoint.distanceMeters,
      planeId: firstHitWithPoint.planeId,
      source: firstHitWithPoint.trackableType === 'feature_point' ? 'feature_point' : 'plane',
      trackableType: firstHitWithPoint.trackableType,
    });
  },
  async getCapabilities() {
    if (!nativeModule) {
      return mockNativeMeasurementModule.getCapabilities();
    }

    return normalizeCapabilities(await nativeModule.getCapabilities());
  },
  async getCurrentMeasurement() {
    if (!nativeModule) {
      return mockNativeMeasurementModule.getCurrentMeasurement();
    }

    return normalizeMeasurement(await nativeModule.getCurrentMeasurement());
  },
  async getDepthAtPoint(screenPoint: ScreenPoint) {
    if (!nativeModule) {
      return mockNativeMeasurementModule.getDepthAtPoint(screenPoint);
    }

    return nativeModule.getDepthAtPoint
      ? normalizeDepthSample(await nativeModule.getDepthAtPoint(screenPoint.x, screenPoint.y))
      : mockNativeMeasurementModule.getDepthAtPoint(screenPoint);
  },
  async getDetectedPlanes() {
    if (!nativeModule) {
      return mockNativeMeasurementModule.getDetectedPlanes();
    }

    const planes = await nativeModule.getDetectedPlanes();

    return planes.map((plane) => ({
      alignment: plane.alignment,
      center: normalizeWorldPointValue(plane.center),
      confidence: {
        level: 'medium',
        score: plane.trackingState === 'tracking' ? 0.75 : 0.35,
      },
      detectedAt: new Date().toISOString(),
      id: plane.id,
      normal: { xMeters: 0, yMeters: plane.alignment === 'horizontal' ? 1 : 0, zMeters: 0 },
    }));
  },
  async getMeasurementState() {
    if (!nativeModule) {
      return mockNativeMeasurementModule.getMeasurementState();
    }

    const [capabilities, currentMeasurement, nativeState] = await Promise.all([
      this.getCapabilities(),
      this.getCurrentMeasurement(),
      nativeModule.getMeasurementState(),
    ]);

    return {
      capabilities,
      currentMeasurement,
      status: nativeState.status,
    };
  },
  async getTrackingState() {
    if (!nativeModule) {
      return mockNativeMeasurementModule.getTrackingState();
    }

    return nativeModule.getTrackingState();
  },
  async getWorldPoint(screenPoint: ScreenPoint) {
    if (!nativeModule) {
      return mockNativeMeasurementModule.getWorldPoint(screenPoint);
    }

    const smoothedPoint = await getSmoothedWorldPoint(screenPoint);
    if (smoothedPoint) {
      return smoothedPoint;
    }

    return normalizeWorldPoint(await nativeModule.getWorldPoint(screenPoint.x, screenPoint.y));
  },
  async hitTest(screenPoint: ScreenPoint): Promise<HitTestResult[]> {
    if (!nativeModule) {
      return mockNativeMeasurementModule.hitTest(screenPoint);
    }

    const hits = await nativeModule.performHitTest(screenPoint.x, screenPoint.y);

    return hits.map((hit) => ({
      ...hit,
      worldPoint: hit.worldPoint
        ? normalizeWorldPointValue(hit.worldPoint as NativeWorldPoint3D)
        : undefined,
    }));
  },
  async isSupported() {
    if (!nativeModule) {
      return false;
    }

    const capabilities = await this.getCapabilities();
    return capabilities.arSupported;
  },
  async resetSession() {
    if (!nativeModule) {
      return mockNativeMeasurementModule.resetSession();
    }

    await nativeModule.resetSession();
  },
  async setMeasurementMode(mode) {
    if (!nativeModule) {
      return mockNativeMeasurementModule.setMeasurementMode(mode);
    }

    await nativeModule.setMeasurementMode(mode);
  },
  async startSession() {
    if (!nativeModule) {
      return mockNativeMeasurementModule.startSession();
    }

    const capabilities = await this.getCapabilities();
    return createSessionResult(await nativeModule.startSession(), capabilities);
  },
  async stopSession() {
    if (!nativeModule) {
      return mockNativeMeasurementModule.stopSession();
    }

    await nativeModule.stopSession();
  },
  async undoLastPoint() {
    if (!nativeModule?.undoLastPoint) {
      return mockNativeMeasurementModule.undoLastPoint();
    }

    await nativeModule.undoLastPoint();
  },
};
