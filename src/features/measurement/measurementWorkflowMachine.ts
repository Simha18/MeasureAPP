import type { ManualCuboidDimensionKey } from './manualCuboidWorkflow';

export type MeasurementWorkflowMode = 'manual' | 'auto_assist';

export type MeasurementWorkflowStatus =
  | 'IDLE'
  | 'CHECKING_CAPABILITIES'
  | 'WAITING_FOR_CAMERA'
  | 'SEARCHING_FOR_PLANE'
  | 'PLANE_FOUND'
  | 'SEARCHING_FOR_OBJECT'
  | 'OBJECT_FOUND'
  | 'COLLECTING_SCAN_DATA'
  | 'MEASURING_LENGTH'
  | 'MEASURING_WIDTH'
  | 'MEASURING_HEIGHT'
  | 'VALIDATING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type MeasurementWorkflowState = {
  activeDimension?: ManualCuboidDimensionKey;
  canUseNativeAr?: boolean;
  confirmedDimensions: ManualCuboidDimensionKey[];
  error?: string;
  mode: MeasurementWorkflowMode;
  objectConfidence?: number;
  requiredObservationCount?: number;
  scanProgress: number;
  status: MeasurementWorkflowStatus;
};

export type MeasurementWorkflowEvent =
  | { type: 'START' }
  | { type: 'CAPABILITIES_CHECKED'; canUseNativeAr: boolean }
  | { type: 'CAMERA_READY' }
  | { type: 'PLANE_DETECTED' }
  | { type: 'OBJECT_DETECTED'; confidence: number }
  | { type: 'POINT_SELECTED'; dimension: ManualCuboidDimensionKey }
  | { type: 'DIMENSION_CONFIRMED'; dimension: ManualCuboidDimensionKey }
  | {
      acceptedObservationCount?: number;
      progress: number;
      requiredObservationCount?: number;
      type: 'SCAN_PROGRESS';
    }
  | { type: 'VALIDATION_SUCCESS' }
  | { type: 'VALIDATION_FAILURE'; reason: string }
  | { type: 'MODE_CHANGED'; mode: MeasurementWorkflowMode }
  | { type: 'FAIL'; reason: string }
  | { type: 'RESET' }
  | { type: 'CANCEL' };

const dimensionOrder: ManualCuboidDimensionKey[] = ['length', 'width', 'height'];

export const initialMeasurementWorkflowState: MeasurementWorkflowState = {
  confirmedDimensions: [],
  mode: 'manual',
  scanProgress: 0,
  status: 'IDLE',
};

export function measurementWorkflowReducer(
  state: MeasurementWorkflowState,
  event: MeasurementWorkflowEvent,
): MeasurementWorkflowState {
  if (event.type === 'RESET') {
    return initialMeasurementWorkflowState;
  }

  if (event.type === 'CANCEL') {
    return {
      ...state,
      status: 'CANCELLED',
    };
  }

  if (event.type === 'FAIL') {
    return {
      ...state,
      error: event.reason,
      status: 'FAILED',
    };
  }

  if (state.status === 'COMPLETED' || state.status === 'CANCELLED' || state.status === 'FAILED') {
    return state;
  }

  switch (event.type) {
    case 'START':
      return transitionFrom(state, ['IDLE'], {
        ...state,
        error: undefined,
        status: 'CHECKING_CAPABILITIES',
      });

    case 'CAPABILITIES_CHECKED':
      return transitionFrom(state, ['CHECKING_CAPABILITIES', 'IDLE'], {
        ...state,
        canUseNativeAr: event.canUseNativeAr,
        error: undefined,
        status: 'WAITING_FOR_CAMERA',
      });

    case 'CAMERA_READY':
      return transitionFrom(state, ['WAITING_FOR_CAMERA', 'CHECKING_CAPABILITIES'], {
        ...state,
        status: state.canUseNativeAr ? 'SEARCHING_FOR_PLANE' : 'COLLECTING_SCAN_DATA',
      });

    case 'PLANE_DETECTED':
      return transitionFrom(state, ['SEARCHING_FOR_PLANE', 'WAITING_FOR_CAMERA', 'PLANE_FOUND'], {
        ...state,
        activeDimension: state.mode === 'manual' ? 'length' : undefined,
        status: state.mode === 'manual' ? 'MEASURING_LENGTH' : 'PLANE_FOUND',
      });

    case 'MODE_CHANGED':
      return changeMode(state, event.mode);

    case 'OBJECT_DETECTED':
      if (state.status === 'OBJECT_FOUND' && state.objectConfidence === event.confidence) {
        return state;
      }

      return transitionFrom(
        state,
        ['PLANE_FOUND', 'SEARCHING_FOR_OBJECT', 'OBJECT_FOUND', 'COLLECTING_SCAN_DATA'],
        {
          ...state,
          objectConfidence: event.confidence,
          status: 'OBJECT_FOUND',
        },
      );

    case 'POINT_SELECTED':
      return transitionFrom(state, ['MEASURING_LENGTH', 'MEASURING_WIDTH', 'MEASURING_HEIGHT'], {
        ...state,
        activeDimension: event.dimension,
      });

    case 'DIMENSION_CONFIRMED':
      return confirmDimension(state, event.dimension);

    case 'SCAN_PROGRESS':
      return updateScanProgress(state, event);

    case 'VALIDATION_SUCCESS':
      return transitionFrom(state, ['VALIDATING', 'MEASURING_HEIGHT'], {
        ...state,
        activeDimension: undefined,
        error: undefined,
        scanProgress: 1,
        status: 'COMPLETED',
      });

    case 'VALIDATION_FAILURE':
      if (state.status === 'COLLECTING_SCAN_DATA' && state.error === event.reason) {
        return state;
      }

      return transitionFrom(state, ['VALIDATING', 'COLLECTING_SCAN_DATA', 'OBJECT_FOUND'], {
        ...state,
        error: event.reason,
        status: 'COLLECTING_SCAN_DATA',
      });

    default:
      return state;
  }
}

function updateScanProgress(
  state: MeasurementWorkflowState,
  event: Extract<MeasurementWorkflowEvent, { type: 'SCAN_PROGRESS' }>,
) {
  const scanProgress = clampProgress(event.progress);
  const status = event.progress >= 1 ? 'VALIDATING' : 'COLLECTING_SCAN_DATA';

  if (
    state.status === status &&
    state.requiredObservationCount === event.requiredObservationCount &&
    state.scanProgress === scanProgress
  ) {
    return state;
  }

  return transitionFrom(state, ['OBJECT_FOUND', 'COLLECTING_SCAN_DATA', 'VALIDATING'], {
    ...state,
    requiredObservationCount: event.requiredObservationCount,
    scanProgress,
    status,
  });
}

function changeMode(
  state: MeasurementWorkflowState,
  mode: MeasurementWorkflowMode,
): MeasurementWorkflowState {
  if (state.mode === mode) {
    return state;
  }

  if (mode === 'manual') {
    if (state.status === 'WAITING_FOR_CAMERA' || state.status === 'SEARCHING_FOR_PLANE') {
      return {
        ...state,
        mode,
      };
    }

    return {
      ...state,
      mode,
      status: getManualMeasurementStatus(state.activeDimension ?? getNextDimension(state.confirmedDimensions)),
    };
  }

  if (state.status === 'WAITING_FOR_CAMERA' || state.status === 'SEARCHING_FOR_PLANE') {
    return {
      ...state,
      activeDimension: undefined,
      mode,
      scanProgress: 0,
    };
  }

  return transitionFrom(
    state,
    ['PLANE_FOUND', 'SEARCHING_FOR_OBJECT', 'MEASURING_LENGTH', 'MEASURING_WIDTH', 'MEASURING_HEIGHT'],
    {
      ...state,
      activeDimension: undefined,
      mode,
      scanProgress: 0,
      status: 'SEARCHING_FOR_OBJECT',
    },
  );
}

function confirmDimension(
  state: MeasurementWorkflowState,
  dimension: ManualCuboidDimensionKey,
): MeasurementWorkflowState {
  const expectedDimension = getNextDimension(state.confirmedDimensions);

  if (dimension !== expectedDimension || state.status !== getManualMeasurementStatus(dimension)) {
    return state;
  }

  const confirmedDimensions = uniqueDimensions([...state.confirmedDimensions, dimension]);
  const nextDimension = getNextDimension(confirmedDimensions);

  if (!nextDimension) {
    return {
      ...state,
      activeDimension: undefined,
      confirmedDimensions,
      status: 'VALIDATING',
    };
  }

  return {
    ...state,
    activeDimension: nextDimension,
    confirmedDimensions,
    status: getManualMeasurementStatus(nextDimension),
  };
}

function getNextDimension(confirmedDimensions: ManualCuboidDimensionKey[]) {
  return dimensionOrder.find((dimension) => !confirmedDimensions.includes(dimension));
}

function getManualMeasurementStatus(
  dimension: ManualCuboidDimensionKey | undefined,
): MeasurementWorkflowStatus {
  if (dimension === 'width') {
    return 'MEASURING_WIDTH';
  }

  if (dimension === 'height') {
    return 'MEASURING_HEIGHT';
  }

  return 'MEASURING_LENGTH';
}

function transitionFrom(
  state: MeasurementWorkflowState,
  allowedStatuses: MeasurementWorkflowStatus[],
  nextState: MeasurementWorkflowState,
) {
  return allowedStatuses.includes(state.status) ? nextState : state;
}

function uniqueDimensions(dimensions: ManualCuboidDimensionKey[]) {
  return dimensionOrder.filter((dimension) => dimensions.includes(dimension));
}

function clampProgress(progress: number) {
  if (!Number.isFinite(progress)) {
    return 0;
  }

  return Math.min(1, Math.max(0, progress));
}
