import type {
  DevicePlatform,
  MeasurementStatus,
  Plane,
  ScanSession,
  WorldPoint3D,
} from '../types';

export type MeasurementMode = 'ar_depth' | 'standard_ar' | 'camera_fallback' | 'unavailable';

export type CapabilityAvailability = 'available' | 'unavailable' | 'unknown';

export type MeasurementCapabilities = {
  arSupported: boolean;
  depthSupported: boolean;
  fallbackMeasurementAvailable: boolean;
  lidarSupported: boolean;
  nativeMeasurementAvailable: boolean;
  platform: DevicePlatform;
};

export type MeasurementCapabilityReport = MeasurementCapabilities & {
  detectionSource: 'native' | 'mock_unavailable' | 'platform_fallback';
  mode: MeasurementMode;
  reason?: string;
};

export type NativeMeasurementSessionState = {
  active: boolean;
  error?: string;
  measurementMode: MeasurementMode;
  reason?: string;
  selectedPointsCount?: number;
  trackingState: TrackingState['status'];
};

export type TrackingState = {
  reason?: string;
  status: 'not_available' | 'idle' | 'tracking' | 'limited' | 'stopped';
};

export type ScreenPoint = {
  x: number;
  y: number;
};

export type NativeWorldPoint3D = {
  x: number;
  xMeters?: number;
  y: number;
  yMeters?: number;
  z: number;
  zMeters?: number;
};

export type HitTestResult = {
  distanceMeters?: number;
  planeId?: string;
  reason?: string;
  simulated?: boolean;
  trackableType?: string;
  worldPoint?: WorldPoint3D & Partial<NativeWorldPoint3D>;
};

export type DepthSample = {
  confidence?: number;
  depthAvailable?: boolean;
  depthConfidence?: number;
  depthMeters?: number;
  frameTimestamp?: number;
  reason?: string;
  validFrameCount?: number;
};

export type NativePointQuality = {
  depthAvailable?: boolean;
  depthConfidence?: number;
  depthMeters?: number;
  hitDistanceMeters?: number;
  hitStabilityMeters?: number;
  measurementConfidence?: number;
  planeId?: string;
  qualityLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  sampleCount?: number;
  source?: 'depth_point' | 'plane' | 'feature_point' | 'unknown';
  trackableType?: string;
  trackingQuality?: number;
  validDepthFrameCount?: number;
};

export type WorldPointResult = {
  point?: WorldPoint3D;
  quality?: NativePointQuality;
  reason?: string;
};

export type NativeSessionResult = {
  reason?: string;
  session?: ScanSession;
  started: boolean;
};

export type CurrentNativeMeasurement = {
  confidence: number;
  depthAvailable?: boolean;
  depthConfidence?: number;
  depthFrameCount?: number;
  distanceBetweenLastTwoMeters?: number;
  heightMeters: number;
  hitStabilityMeters?: number;
  latestPoint?: WorldPoint3D & Partial<NativeWorldPoint3D>;
  lengthMeters: number;
  measurementConfidence?: number;
  measurementMode: MeasurementMode;
  selectedPointsCount?: number;
  simulated?: boolean;
  trackingQuality?: number;
  trackingState: TrackingState['status'];
  validDepthFrameCount?: number;
  volumeCubicMeters: number;
  widthMeters: number;
};

export type MeasurementState = {
  capabilities: MeasurementCapabilityReport;
  currentMeasurement?: CurrentNativeMeasurement;
  reason?: string;
  sessionId?: string;
  status: MeasurementStatus | 'unavailable';
};

export type NativeMeasurementModule = {
  estimateWorldPoint: (screenPoint: ScreenPoint) => Promise<WorldPointResult>;
  getCapabilities: () => Promise<MeasurementCapabilityReport>;
  getCurrentMeasurement: () => Promise<CurrentNativeMeasurement | undefined>;
  getDepthAtPoint: (screenPoint: ScreenPoint) => Promise<DepthSample>;
  getDetectedPlanes: () => Promise<Plane[]>;
  getMeasurementState: () => Promise<MeasurementState>;
  getTrackingState: () => Promise<TrackingState>;
  getWorldPoint: (screenPoint: ScreenPoint) => Promise<WorldPointResult>;
  hitTest: (screenPoint: ScreenPoint) => Promise<HitTestResult[]>;
  isSupported: () => Promise<boolean>;
  resetSession: () => Promise<void>;
  setMeasurementMode: (mode: MeasurementMode) => Promise<void>;
  startSession: () => Promise<NativeSessionResult>;
  stopSession: () => Promise<void>;
  undoLastPoint: () => Promise<void>;
};

export type VolumeMeasurementNativeEventMap = {
  onMeasurementCompleted: (measurement: CurrentNativeMeasurement) => void;
  onMeasurementError: (event: { code?: string; message: string }) => void;
  onMeasurementUpdated: (measurement: CurrentNativeMeasurement) => void;
  onPlaneDetected: (plane: {
    alignment: Plane['alignment'];
    center: WorldPoint3D;
    id: string;
    simulated?: boolean;
  }) => void;
  onTrackingStateChanged: (event: {
    measurementMode: MeasurementMode;
    trackingState: TrackingState['status'];
  }) => void;
};

export type VolumeMeasurementNativeEventName = keyof VolumeMeasurementNativeEventMap;

export type VolumeMeasurementNativeModule = {
  addListener: <TEventName extends VolumeMeasurementNativeEventName>(
    eventName: TEventName,
    listener: VolumeMeasurementNativeEventMap[TEventName],
  ) => { remove: () => void };
  getCapabilities: () => Promise<MeasurementCapabilities & {
    arAvailability?: string;
    googlePlayServicesForArInstalled?: boolean;
    measurementMode?: MeasurementMode;
    nativeModule?: string;
    reason?: string;
  }>;
  getCurrentMeasurement: () => Promise<CurrentNativeMeasurement>;
  getDepthAtPoint?: (screenX: number, screenY: number) => Promise<DepthSample>;
  getDetectedPlanes: () => Promise<{
    alignment: Plane['alignment'];
    center: NativeWorldPoint3D;
    extentX?: number;
    extentZ?: number;
    id: string;
    simulated?: boolean;
    trackingState?: TrackingState['status'];
  }[]>;
  getMeasurementState: () => Promise<{
    distanceBetweenLastTwoMeters?: number;
    latestPoint?: NativeWorldPoint3D;
    planes?: {
      alignment: Plane['alignment'];
      center: NativeWorldPoint3D;
      extentX?: number;
      extentZ?: number;
      id: string;
      simulated?: boolean;
      trackingState?: TrackingState['status'];
    }[];
    selectedPointsCount?: number;
    status: MeasurementState['status'];
    trackingState?: TrackingState['status'];
  }>;
  getTrackingState: () => Promise<TrackingState>;
  estimateWorldPoint?: (
    screenX: number,
    screenY: number,
  ) => Promise<(NativeWorldPoint3D & NativePointQuality & { reason?: never; simulated?: boolean }) | { reason: string }>;
  getWorldPoint: (
    screenX: number,
    screenY: number,
  ) => Promise<(NativeWorldPoint3D & NativePointQuality & { simulated?: boolean }) | { reason: string }>;
  performHitTest: (screenX: number, screenY: number) => Promise<HitTestResult[]>;
  resetSession: () => Promise<NativeMeasurementSessionState>;
  recordWorldPoint?: (
    xMeters: number,
    yMeters: number,
    zMeters: number,
  ) => Promise<NativeMeasurementSessionState | { reason: string }>;
  setMeasurementMode: (mode: MeasurementMode) => Promise<NativeMeasurementSessionState>;
  startSession: () => Promise<NativeMeasurementSessionState>;
  stopSession: () => Promise<NativeMeasurementSessionState>;
  undoLastPoint?: () => Promise<NativeMeasurementSessionState>;
};
