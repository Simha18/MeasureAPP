import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import type { Measurement, MeasurementUnit, VolumeUnit } from '@/features/measurement';
import {
  historyRecordToMeasurement,
  measurementHistoryRepository,
  measurementToHistoryRecord,
  type MeasurementHistoryRecord,
} from '@/features/history';

const storageKeys = {
  currentMeasurement: 'poc-volume-finder/current-measurement',
  settings: 'poc-volume-finder/settings',
} as const;

export type AppSettings = {
  preferredLengthUnit: MeasurementUnit;
  preferredVolumeUnit: VolumeUnit;
};

type AppStoreValue = {
  clearCurrentMeasurement: () => Promise<void>;
  clearHistory: () => Promise<void>;
  currentMeasurement?: Measurement;
  deleteMeasurement: (measurementId: string) => Promise<void>;
  getHistoryRecord: (measurementId: string) => MeasurementHistoryRecord | undefined;
  history: MeasurementHistoryRecord[];
  isHydrated: boolean;
  measurements: Measurement[];
  saveMeasurement: (measurement: Measurement) => Promise<void>;
  setCurrentMeasurement: (measurement: Measurement) => Promise<void>;
  settings: AppSettings;
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>;
};

const defaultSettings: AppSettings = {
  preferredLengthUnit: 'meter',
  preferredVolumeUnit: 'liter',
};

const AppStoreContext = createContext<AppStoreValue | undefined>(undefined);

function parseStoredJson<TValue>(value: string | null, fallback: TValue): TValue {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as TValue;
  } catch {
    return fallback;
  }
}

export function AppStoreProvider({ children }: PropsWithChildren) {
  const [currentMeasurement, setCurrentMeasurementState] = useState<Measurement | undefined>();
  const [history, setHistory] = useState<MeasurementHistoryRecord[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);

  useEffect(() => {
    let isMounted = true;

    async function hydrate() {
      const [storedSettings, storedHistory, storedCurrentMeasurement] = await Promise.all([
        AsyncStorage.getItem(storageKeys.settings),
        measurementHistoryRepository.list(),
        AsyncStorage.getItem(storageKeys.currentMeasurement),
      ]);

      if (!isMounted) {
        return;
      }

      setSettings({
        ...defaultSettings,
        ...parseStoredJson<Partial<AppSettings>>(storedSettings, {}),
      });
      setHistory(storedHistory);
      setCurrentMeasurementState(
        parseStoredJson<Measurement | undefined>(storedCurrentMeasurement, undefined),
      );
      setIsHydrated(true);
    }

    hydrate();

    return () => {
      isMounted = false;
    };
  }, []);

  const setCurrentMeasurement = useCallback(async (measurement: Measurement) => {
    setCurrentMeasurementState(measurement);
    await AsyncStorage.setItem(storageKeys.currentMeasurement, JSON.stringify(measurement));
  }, []);

  const clearCurrentMeasurement = useCallback(async () => {
    setCurrentMeasurementState(undefined);
    await AsyncStorage.removeItem(storageKeys.currentMeasurement);
  }, []);

  const saveMeasurement = useCallback(
    async (measurement: Measurement) => {
      const nextHistory = await measurementHistoryRepository.save(
        measurementToHistoryRecord(measurement, settings),
      );

      setHistory(nextHistory);
    },
    [settings],
  );

  const deleteMeasurement = useCallback(
    async (measurementId: string) => {
      const nextHistory = await measurementHistoryRepository.delete(measurementId);

      setHistory(nextHistory);
      if (currentMeasurement?.id === measurementId) {
        setCurrentMeasurementState(undefined);
        await AsyncStorage.removeItem(storageKeys.currentMeasurement);
      }
    },
    [currentMeasurement?.id],
  );

  const clearHistory = useCallback(async () => {
    setHistory([]);
    await measurementHistoryRepository.clear();
  }, []);

  const getHistoryRecord = useCallback(
    (measurementId: string) => history.find((record) => record.id === measurementId),
    [history],
  );

  const measurements = useMemo(
    () => history.map((record) => historyRecordToMeasurement(record)),
    [history],
  );

  const updateSettings = useCallback(
    async (nextSettings: Partial<AppSettings>) => {
      const mergedSettings = {
        ...settings,
        ...nextSettings,
      };

      setSettings(mergedSettings);
      await AsyncStorage.setItem(storageKeys.settings, JSON.stringify(mergedSettings));
    },
    [settings],
  );

  const value = useMemo<AppStoreValue>(
    () => ({
      clearCurrentMeasurement,
      clearHistory,
      currentMeasurement,
      deleteMeasurement,
      getHistoryRecord,
      history,
      isHydrated,
      measurements,
      saveMeasurement,
      setCurrentMeasurement,
      settings,
      updateSettings,
    }),
    [
      clearCurrentMeasurement,
      clearHistory,
      currentMeasurement,
      deleteMeasurement,
      getHistoryRecord,
      history,
      isHydrated,
      measurements,
      saveMeasurement,
      setCurrentMeasurement,
      settings,
      updateSettings,
    ],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore() {
  const context = useContext(AppStoreContext);

  if (!context) {
    throw new Error('useAppStore must be used inside AppStoreProvider.');
  }

  return context;
}
