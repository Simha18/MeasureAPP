export const measurementUnits = ['millimeter', 'centimeter', 'meter', 'inch', 'foot'] as const;
export const volumeUnits = [
  'cubic_centimeter',
  'liter',
  'cubic_meter',
  'cubic_inch',
  'cubic_foot',
] as const;

export type MeasurementShape =
  | 'cuboid'
  | 'cylinder'
  | 'sphere'
  | 'cone'
  | 'ellipsoid'
  | 'polygon_prism'
  | 'sectioned'
  | 'square'
  | 'rectangle'
  | 'circle'
  | 'polygon';
export type MeasurementObjectType = 'box' | 'parcel' | 'carton' | 'object';
export type MeasurementUnit = (typeof measurementUnits)[number];
export type VolumeUnit = (typeof volumeUnits)[number];

export type MeasurementConfidenceLevel = 'low' | 'medium' | 'high';

export type MeasurementConfidence = {
  factors?: string[];
  level: MeasurementConfidenceLevel;
  score: number;
};

export type MeasurementMethod = 'mock' | 'manual' | 'camera' | 'arcore' | 'arkit';

export type DevicePlatform = 'android' | 'ios' | 'web' | 'unknown';

export type DeviceCapabilities = {
  hasARCore: boolean;
  hasARKit: boolean;
  hasCamera: boolean;
  hasDepthSensor: boolean;
  hasLiDAR: boolean;
  platform: DevicePlatform;
  supportsWorldTracking: boolean;
};

export type WorldPoint3D = {
  xMeters: number;
  yMeters: number;
  zMeters: number;
};

export type ScanPoint = {
  capturedAt: string;
  confidence: MeasurementConfidence;
  id: string;
  position: WorldPoint3D;
};

export type Plane = {
  alignment: 'horizontal' | 'vertical' | 'unknown';
  center: WorldPoint3D;
  confidence: MeasurementConfidence;
  detectedAt: string;
  id: string;
  normal: WorldPoint3D;
};

export type MeasurementStatus = 'idle' | 'scanning' | 'processing' | 'completed' | 'failed';

export type MeasurementDimensions = {
  heightMeters: number;
  lengthMeters: number;
  unit: 'meter';
  widthMeters: number;
  radiusMeters?: number;
  diameterMeters?: number;
  perimeterMeters?: number;
  areaSquareMeters?: number;
  surfaceAreaSquareMeters?: number;
  basePerimeterMeters?: number;
  baseAreaSquareMeters?: number;
};

export type VolumeMeasurement = {
  unit: 'cubic_meter';
  valueCubicMeters: number;
};

export type MeasurementSnapshot = {
  capturedAt: string;
  height?: number;
  uri: string;
  width?: number;
};

export type Measurement = {
  model?: MeasurementModel;
  confidence: MeasurementConfidence;
  deviceCapabilities: DeviceCapabilities;
  dimensions: MeasurementDimensions;
  id: string;
  measuredAt: string;
  measurementUnit: MeasurementUnit;
  method: MeasurementMethod;
  objectType: MeasurementObjectType;
  scanSessionId?: string;
  shape: MeasurementShape;
  snapshot?: MeasurementSnapshot;
  status: MeasurementStatus;
  volume: VolumeMeasurement;
  detectedShapeConfidence?: number;
  identifiedShapeLabel?: string;
  shapeCategory?: '2d_planar' | '3d_volumetric';
};

export type MeasurementModel = {
  assumptions: string[];
  formula: string;
  source: 'ar_points' | 'reference_photo' | 'entered_dimensions';
  sections?: WorldPoint3D[][];
};

export type ScanSession = {
  completedAt?: string;
  deviceCapabilities: DeviceCapabilities;
  id: string;
  measurementId?: string;
  method: MeasurementMethod;
  planes: Plane[];
  points: ScanPoint[];
  startedAt: string;
  status: MeasurementStatus;
};

export type CuboidMeasurementInput = {
  confidence?: MeasurementConfidence;
  deviceCapabilities: DeviceCapabilities;
  height: number;
  id: string;
  length: number;
  measuredAt: string;
  measurementUnit: MeasurementUnit;
  method: MeasurementMethod;
  objectType?: MeasurementObjectType;
  scanSessionId?: string;
  snapshot?: MeasurementSnapshot;
  status?: MeasurementStatus;
  width: number;
};
