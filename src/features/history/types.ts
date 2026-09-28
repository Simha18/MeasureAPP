import type {
  DevicePlatform,
  MeasurementConfidence,
  MeasurementMethod,
  MeasurementObjectType,
  MeasurementModel,
  MeasurementShape,
  MeasurementUnit,
  VolumeUnit,
} from '../measurement';

export type MeasurementHistoryRecord = {
  shape?: MeasurementShape;
  model?: MeasurementModel;
  confidence: MeasurementConfidence;
  createdAt: string;
  depthSupported: boolean;
  heightMeters: number;
  id: string;
  lengthMeters: number;
  lidarSupported: boolean;
  measurementMethod: MeasurementMethod;
  objectType: MeasurementObjectType;
  platform: DevicePlatform;
  preferredLengthUnit: MeasurementUnit;
  preferredVolumeUnit: VolumeUnit;
  snapshotHeight?: number;
  snapshotUri?: string;
  snapshotWidth?: number;
  volumeCubicMeters: number;
  widthMeters: number;
};

export type MeasurementHistoryRepository = {
  clear: () => Promise<void>;
  delete: (measurementId: string) => Promise<MeasurementHistoryRecord[]>;
  getById: (measurementId: string) => Promise<MeasurementHistoryRecord | undefined>;
  list: () => Promise<MeasurementHistoryRecord[]>;
  save: (record: MeasurementHistoryRecord) => Promise<MeasurementHistoryRecord[]>;
};
