import AsyncStorage from '@react-native-async-storage/async-storage';

import { sortCalibrationResultsNewestFirst } from './calibrationMetrics';
import type { CalibrationRepository, CalibrationTestResult } from './types';

const calibrationStorageKey = 'poc-volume-finder/calibration-tests';

function parseStoredResults(value: string | null): CalibrationTestResult[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? sortCalibrationResultsNewestFirst(parsed as CalibrationTestResult[])
      : [];
  } catch {
    return [];
  }
}

async function readStoredResults() {
  return parseStoredResults(await AsyncStorage.getItem(calibrationStorageKey));
}

export const calibrationRepository: CalibrationRepository = {
  async clear() {
    await AsyncStorage.removeItem(calibrationStorageKey);
  },
  async list() {
    return readStoredResults();
  },
  async save(result: CalibrationTestResult) {
    const results = await readStoredResults();
    const nextResults = sortCalibrationResultsNewestFirst([
      result,
      ...results.filter((item) => item.id !== result.id),
    ]);

    await AsyncStorage.setItem(calibrationStorageKey, JSON.stringify(nextResults));
    return nextResults;
  },
};
