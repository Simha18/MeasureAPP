import type {
  DevicePlatform,
  MeasurementConfidence,
  MeasurementMethod,
  MeasurementObjectType,
} from '../measurement';

export type CalibrationTestResult = {
  actualHeightMeters: number;
  actualLengthMeters: number;
  actualVolumeCubicMeters: number;
  actualWidthMeters: number;
  confidence: MeasurementConfidence;
  createdAt: string;
  depthSupported: boolean;
  heightAbsoluteErrorMeters: number;
  heightPercentageError: number;
  id: string;
  lengthAbsoluteErrorMeters: number;
  lengthPercentageError: number;
  lidarSupported: boolean;
  measuredHeightMeters: number;
  measuredLengthMeters: number;
  measuredVolumeCubicMeters: number;
  measuredWidthMeters: number;
  measurementId: string;
  measurementMethod: MeasurementMethod;
  objectType: MeasurementObjectType;
  overallMeanPercentageError: number;
  platform: DevicePlatform;
  volumeAbsoluteErrorCubicMeters: number;
  volumePercentageError: number;
  widthAbsoluteErrorMeters: number;
  widthPercentageError: number;
};

export type CalibrationSummary = {
  bestResult?: CalibrationTestResult;
  meanAbsoluteHeightErrorMeters: number;
  meanAbsoluteLengthErrorMeters: number;
  meanAbsoluteVolumeErrorCubicMeters: number;
  meanAbsoluteWidthErrorMeters: number;
  meanPercentageError: number;
  numberOfTests: number;
  worstResult?: CalibrationTestResult;
};

export type CalibrationRepository = {
  clear: () => Promise<void>;
  list: () => Promise<CalibrationTestResult[]>;
  save: (result: CalibrationTestResult) => Promise<CalibrationTestResult[]>;
};
