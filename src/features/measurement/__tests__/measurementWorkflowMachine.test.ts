import { describe, expect, it } from 'vitest';

import {
  initialMeasurementWorkflowState,
  measurementWorkflowReducer,
  type MeasurementWorkflowEvent,
  type MeasurementWorkflowState,
} from '../measurementWorkflowMachine';

function applyEvents(events: MeasurementWorkflowEvent[]): MeasurementWorkflowState {
  return events.reduce(measurementWorkflowReducer, initialMeasurementWorkflowState);
}

describe('measurement workflow machine', () => {
  it('moves through the manual AR dimension sequence explicitly', () => {
    const state = applyEvents([
      { type: 'START' },
      { canUseNativeAr: true, type: 'CAPABILITIES_CHECKED' },
      { type: 'CAMERA_READY' },
      { type: 'PLANE_DETECTED' },
      { dimension: 'length', type: 'POINT_SELECTED' },
      { dimension: 'length', type: 'DIMENSION_CONFIRMED' },
      { dimension: 'width', type: 'DIMENSION_CONFIRMED' },
      { dimension: 'height', type: 'DIMENSION_CONFIRMED' },
      { type: 'VALIDATION_SUCCESS' },
    ]);

    expect(state).toMatchObject({
      activeDimension: undefined,
      confirmedDimensions: ['length', 'width', 'height'],
      mode: 'manual',
      scanProgress: 1,
      status: 'COMPLETED',
    });
  });

  it('prevents confirming dimensions out of order', () => {
    const state = applyEvents([
      { type: 'START' },
      { canUseNativeAr: true, type: 'CAPABILITIES_CHECKED' },
      { type: 'CAMERA_READY' },
      { type: 'PLANE_DETECTED' },
      { dimension: 'width', type: 'DIMENSION_CONFIRMED' },
    ]);

    expect(state.status).toBe('MEASURING_LENGTH');
    expect(state.confirmedDimensions).toEqual([]);
  });

  it('routes fallback camera flow into scan collection without requiring a plane', () => {
    const state = applyEvents([
      { type: 'START' },
      { canUseNativeAr: false, type: 'CAPABILITIES_CHECKED' },
      { type: 'CAMERA_READY' },
      { progress: 0.5, type: 'SCAN_PROGRESS' },
    ]);

    expect(state.status).toBe('COLLECTING_SCAN_DATA');
    expect(state.scanProgress).toBe(0.5);
  });

  it('records auto-assist mode while still searching for a plane', () => {
    const state = applyEvents([
      { type: 'START' },
      { canUseNativeAr: true, type: 'CAPABILITIES_CHECKED' },
      { type: 'CAMERA_READY' },
      { mode: 'auto_assist', type: 'MODE_CHANGED' },
      { type: 'PLANE_DETECTED' },
    ]);

    expect(state.mode).toBe('auto_assist');
    expect(state.status).toBe('PLANE_FOUND');
  });

  it('collects multiple auto-assist observations before validation succeeds', () => {
    const state = applyEvents([
      { type: 'START' },
      { canUseNativeAr: true, type: 'CAPABILITIES_CHECKED' },
      { type: 'CAMERA_READY' },
      { type: 'PLANE_DETECTED' },
      { mode: 'auto_assist', type: 'MODE_CHANGED' },
      { confidence: 0.82, type: 'OBJECT_DETECTED' },
      {
        acceptedObservationCount: 1,
        progress: 1 / 3,
        requiredObservationCount: 3,
        type: 'SCAN_PROGRESS',
      },
      {
        acceptedObservationCount: 3,
        progress: 1,
        requiredObservationCount: 3,
        type: 'SCAN_PROGRESS',
      },
      { type: 'VALIDATION_SUCCESS' },
    ]);

    expect(state).toMatchObject({
      mode: 'auto_assist',
      objectConfidence: 0.82,
      requiredObservationCount: 3,
      scanProgress: 1,
      status: 'COMPLETED',
    });
  });

  it('keeps auto assist collectable when validation confidence is insufficient', () => {
    const state = applyEvents([
      { type: 'START' },
      { canUseNativeAr: true, type: 'CAPABILITIES_CHECKED' },
      { type: 'CAMERA_READY' },
      { type: 'PLANE_DETECTED' },
      { mode: 'auto_assist', type: 'MODE_CHANGED' },
      { confidence: 0.6, type: 'OBJECT_DETECTED' },
      { progress: 1, type: 'SCAN_PROGRESS' },
      { reason: 'Continue scanning or switch to Manual Mode.', type: 'VALIDATION_FAILURE' },
    ]);

    expect(state.status).toBe('COLLECTING_SCAN_DATA');
    expect(state.error).toBe('Continue scanning or switch to Manual Mode.');
  });

  it('ignores duplicate auto-assist workflow updates', () => {
    const collecting = applyEvents([
      { type: 'START' },
      { canUseNativeAr: true, type: 'CAPABILITIES_CHECKED' },
      { type: 'CAMERA_READY' },
      { type: 'PLANE_DETECTED' },
      { mode: 'auto_assist', type: 'MODE_CHANGED' },
      { confidence: 0.72, type: 'OBJECT_DETECTED' },
      {
        progress: 0.5,
        requiredObservationCount: 4,
        type: 'SCAN_PROGRESS',
      },
    ]);

    expect(
      measurementWorkflowReducer(collecting, {
        progress: 0.5,
        requiredObservationCount: 4,
        type: 'SCAN_PROGRESS',
      }),
    ).toBe(collecting);

    const failedValidation = measurementWorkflowReducer(collecting, {
      reason: 'Continue scanning.',
      type: 'VALIDATION_FAILURE',
    });

    expect(
      measurementWorkflowReducer(failedValidation, {
        reason: 'Continue scanning.',
        type: 'VALIDATION_FAILURE',
      }),
    ).toBe(failedValidation);
  });

  it('supports reset, cancel, and failed terminal states', () => {
    const cancelled = measurementWorkflowReducer(
      initialMeasurementWorkflowState,
      { type: 'CANCEL' },
    );
    const failed = measurementWorkflowReducer(
      initialMeasurementWorkflowState,
      { reason: 'Camera failed.', type: 'FAIL' },
    );
    const reset = measurementWorkflowReducer(failed, { type: 'RESET' });
    const impossible = measurementWorkflowReducer(cancelled, { type: 'START' });

    expect(cancelled.status).toBe('CANCELLED');
    expect(failed.status).toBe('FAILED');
    expect(reset).toEqual(initialMeasurementWorkflowState);
    expect(impossible.status).toBe('CANCELLED');
  });
});
