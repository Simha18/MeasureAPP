import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  migrateLegacyMeasurements,
  normalizeHistoryRecords,
  parseHistoryJsonArray,
  sortHistoryNewestFirst,
} from './measurementHistoryMappers';
import type { MeasurementHistoryRecord, MeasurementHistoryRepository } from './types';

const historyStorageKey = 'poc-volume-finder/measurement-history';
const legacyMeasurementsStorageKey = 'poc-volume-finder/measurements';

async function readStoredHistory() {
  const storedHistory = normalizeHistoryRecords(
    parseHistoryJsonArray(await AsyncStorage.getItem(historyStorageKey)),
  );

  if (storedHistory.length > 0) {
    return storedHistory;
  }

  const migratedHistory = migrateLegacyMeasurements(
    parseHistoryJsonArray(await AsyncStorage.getItem(legacyMeasurementsStorageKey)),
  );

  if (migratedHistory.length > 0) {
    await AsyncStorage.setItem(historyStorageKey, JSON.stringify(migratedHistory));
    await AsyncStorage.removeItem(legacyMeasurementsStorageKey);
  }

  return migratedHistory;
}

export const measurementHistoryRepository: MeasurementHistoryRepository = {
  async clear() {
    await AsyncStorage.removeItem(historyStorageKey);
    await AsyncStorage.removeItem(legacyMeasurementsStorageKey);
  },
  async delete(measurementId: string) {
    const nextRecords = (await readStoredHistory()).filter((record) => record.id !== measurementId);
    await AsyncStorage.setItem(historyStorageKey, JSON.stringify(nextRecords));
    return nextRecords;
  },
  async getById(measurementId: string) {
    return (await readStoredHistory()).find((record) => record.id === measurementId);
  },
  async list() {
    return readStoredHistory();
  },
  async save(record: MeasurementHistoryRecord) {
    const records = await readStoredHistory();
    const nextRecords = sortHistoryNewestFirst([
      record,
      ...records.filter((item) => item.id !== record.id),
    ]);

    await AsyncStorage.setItem(historyStorageKey, JSON.stringify(nextRecords));
    return nextRecords;
  },
};
