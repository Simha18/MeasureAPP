import { createCuboidMeasurement } from './measurementService';
import type {
  DeviceCapabilities,
  Measurement,
  MeasurementConfidence,
  MeasurementMethod,
  MeasurementUnit,
  WorldPoint3D,
} from './types';

export type ManualCuboidDimensionKey = 'length' | 'width' | 'height';

export type ManualCuboidDimension = {
  confirmed: boolean;
  distanceMeters?: number;
  points: WorldPoint3D[];
};

export type ManualCuboidWorkflowState = Record<ManualCuboidDimensionKey, ManualCuboidDimension>;

export const manualCuboidSteps: {
  key: ManualCuboidDimensionKey;
  pointLabels: [string, string];
  title: string;
  instruction: string;
}[] = [
  {
    instruction: 'Tap the left and right edges of the box.',
    key: 'length',
    pointLabels: ['A', 'B'],
    title: 'Measure Length',
  },
  {
    instruction: 'Tap the front and back edges of the box.',
    key: 'width',
    pointLabels: ['C', 'D'],
    title: 'Measure Width',
  },
  {
    instruction: 'Tap the bottom and top height points of the box.',
    key: 'height',
    pointLabels: ['E', 'F'],
    title: 'Measure Height',
  },
];

export const emptyManualCuboidWorkflowState: ManualCuboidWorkflowState = {
  height: { confirmed: false, points: [] },
  length: { confirmed: false, points: [] },
  width: { confirmed: false, points: [] },
};

export function createEmptyManualCuboidWorkflowState(): ManualCuboidWorkflowState {
  return {
    height: { confirmed: false, points: [] },
    length: { confirmed: false, points: [] },
    width: { confirmed: false, points: [] },
  };
}

export function calculatePointDistanceMeters(firstPoint: WorldPoint3D, secondPoint: WorldPoint3D) {
  const dx = secondPoint.xMeters - firstPoint.xMeters;
  const dy = secondPoint.yMeters - firstPoint.yMeters;
  const dz = secondPoint.zMeters - firstPoint.zMeters;

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function getDimensionValidation(distanceMeters?: number) {
  if (distanceMeters === undefined) {
    return {
      isValid: false,
      message: 'Select two AR points.',
    };
  }

  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    return {
      isValid: false,
      message: 'Selected points must be different.',
    };
  }

  if (distanceMeters < 0.005) {
    return {
      isValid: false,
      message: 'Distance is too small to be reliable. Retry this dimension.',
    };
  }

  if (distanceMeters > 10) {
    return {
      isValid: false,
      message: 'Distance looks too large for a parcel or carton.',
    };
  }

  return {
    isValid: true,
  };
}

export function isManualCuboidWorkflowComplete(state: ManualCuboidWorkflowState) {
  return state.length.confirmed && state.width.confirmed && state.height.confirmed;
}

export function createManualArCuboidMeasurement(input: {
  deviceCapabilities: DeviceCapabilities;
  dimensions: {
    heightMeters: number;
    lengthMeters: number;
    widthMeters: number;
  };
  id: string;
  confidence?: MeasurementConfidence;
  measurementUnit?: MeasurementUnit;
  scanSessionId?: string;
}): Measurement {
  const method = getManualArMeasurementMethod(input.deviceCapabilities);
  const confidence: MeasurementConfidence = input.confidence ?? {
    factors: [`Manual ${method === 'arkit' ? 'ARKit' : 'ARCore'} point selection`, 'No automatic object detection'],
    level: 'medium',
    score: 0.78,
  };

  return createCuboidMeasurement({
    confidence,
    deviceCapabilities: input.deviceCapabilities,
    height: input.dimensions.heightMeters,
    id: input.id,
    length: input.dimensions.lengthMeters,
    measuredAt: new Date().toISOString(),
    measurementUnit: input.measurementUnit ?? 'meter',
    method,
    scanSessionId: input.scanSessionId,
    status: 'completed',
    width: input.dimensions.widthMeters,
  });
}

function getManualArMeasurementMethod(deviceCapabilities: DeviceCapabilities): MeasurementMethod {
  if (deviceCapabilities.hasARKit) {
    return 'arkit';
  }

  if (deviceCapabilities.hasARCore) {
    return 'arcore';
  }

  return 'camera';
}
