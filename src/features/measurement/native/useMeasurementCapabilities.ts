import { useCallback, useEffect, useState } from 'react';

import {
  getUserFacingMeasurementIssue,
  logTechnicalMeasurementError,
} from './errorMessages';
import { getNativeMeasurementModule } from './nativeMeasurement';
import type { MeasurementCapabilityReport } from './types';

type CapabilityState = {
  capabilities?: MeasurementCapabilityReport;
  error?: string;
  isLoading: boolean;
};

export function useMeasurementCapabilities() {
  const [state, setState] = useState<CapabilityState>({ isLoading: true });

  const refresh = useCallback(async () => {
    setState((currentState) => ({
      ...currentState,
      error: undefined,
      isLoading: true,
    }));

    try {
      const capabilities = await getNativeMeasurementModule().getCapabilities();

      setState({
        capabilities,
        isLoading: false,
      });
    } catch (error) {
      logTechnicalMeasurementError('capability refresh failed', error);
      setState({
        error: getUserFacingMeasurementIssue({
          message: error instanceof Error ? error.message : undefined,
        }).message,
        isLoading: false,
      });
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadCapabilities() {
      try {
        const capabilities = await getNativeMeasurementModule().getCapabilities();

        if (isMounted) {
          setState({
            capabilities,
            isLoading: false,
          });
        }
      } catch (error) {
        if (isMounted) {
          logTechnicalMeasurementError('capability load failed', error);
          setState({
            error: getUserFacingMeasurementIssue({
              message: error instanceof Error ? error.message : undefined,
            }).message,
            isLoading: false,
          });
        }
      }
    }

    void loadCapabilities();

    return () => {
      isMounted = false;
    };
  }, []);

  return {
    ...state,
    refresh,
  };
}
