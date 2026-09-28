import { createUnavailableMeasurementCapabilities, toDeviceCapabilities } from './capabilities';
import { getCurrentDevicePlatform } from './platform';
import type {
  DepthSample,
  HitTestResult,
  MeasurementState,
  NativeMeasurementModule,
  NativeSessionResult,
  ScreenPoint,
  TrackingState,
  WorldPointResult,
} from './types';

const nativeUnavailableMessage =
  'Native AR APIs are unavailable in the current POC build. Use the camera fallback flow.';

function createUnavailableDepthSample(_screenPoint: ScreenPoint): DepthSample {
  return {
    reason: nativeUnavailableMessage,
  };
}

function createUnavailableWorldPoint(_screenPoint: ScreenPoint): WorldPointResult {
  return {
    reason: nativeUnavailableMessage,
  };
}

function createUnavailableHitTest(_screenPoint: ScreenPoint): HitTestResult[] {
  return [];
}

export const mockNativeMeasurementModule: NativeMeasurementModule = {
  async estimateWorldPoint(screenPoint) {
    return createUnavailableWorldPoint(screenPoint);
  },
  async getCapabilities() {
    return createUnavailableMeasurementCapabilities(getCurrentDevicePlatform());
  },
  async getCurrentMeasurement() {
    return undefined;
  },
  async getDepthAtPoint(screenPoint) {
    return createUnavailableDepthSample(screenPoint);
  },
  async getDetectedPlanes() {
    return [];
  },
  async getMeasurementState(): Promise<MeasurementState> {
    const capabilities = createUnavailableMeasurementCapabilities(getCurrentDevicePlatform());

    return {
      capabilities,
      reason: nativeUnavailableMessage,
      status: 'unavailable',
    };
  },
  async getTrackingState(): Promise<TrackingState> {
    return {
      reason: nativeUnavailableMessage,
      status: 'not_available',
    };
  },
  async getWorldPoint(screenPoint) {
    return createUnavailableWorldPoint(screenPoint);
  },
  async hitTest(screenPoint) {
    return createUnavailableHitTest(screenPoint);
  },
  async isSupported() {
    return false;
  },
  async resetSession() {
    return undefined;
  },
  async setMeasurementMode() {
    return undefined;
  },
  async startSession(): Promise<NativeSessionResult> {
    const capabilities = createUnavailableMeasurementCapabilities(getCurrentDevicePlatform());
    const now = new Date().toISOString();

    return {
      reason: nativeUnavailableMessage,
      session: {
        deviceCapabilities: toDeviceCapabilities(capabilities),
        id: `native-unavailable-session-${Date.now()}`,
        method: 'camera',
        planes: [],
        points: [],
        startedAt: now,
        status: 'idle',
      },
      started: false,
    };
  },
  async stopSession() {
    return undefined;
  },
  async undoLastPoint() {
    return undefined;
  },
};
