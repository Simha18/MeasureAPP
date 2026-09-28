import type {
  DevicePlatform,
  Measurement,
  MeasurementMethod,
  MeasurementObjectType,
  MeasurementShape,
  MeasurementModel,
  MeasurementUnit,
  VolumeUnit,
} from '../measurement';

import type { MeasurementHistoryRecord } from './types';

const defaultConfidence = {
  level: 'low',
  score: 0,
} satisfies MeasurementHistoryRecord['confidence'];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toBoolean(value: unknown): boolean {
  return value === true;
}

function normalizeObjectType(value: unknown): MeasurementObjectType {
  return value === 'parcel' || value === 'carton' || value === 'object' ? value : 'box';
}

function normalizeShape(value: unknown): MeasurementShape {
  return value === 'cylinder' || value === 'sphere' || value === 'cone' || value === 'ellipsoid' ||
    value === 'polygon_prism' || value === 'sectioned' ? value : 'cuboid';
}

function normalizeModel(value: unknown): MeasurementModel | undefined {
  if (!isObject(value) || !Array.isArray(value.assumptions) || !value.assumptions.every(v => typeof v === 'string') ||
    typeof value.formula !== 'string' || !['ar_points', 'reference_photo', 'entered_dimensions'].includes(String(value.source))) return undefined;
  const sections = Array.isArray(value.sections) && value.sections.length <= 16 && value.sections.every(section =>
    Array.isArray(section) && section.length >= 3 && section.length <= 64 && section.every(point => isObject(point) &&
      ['xMeters', 'yMeters', 'zMeters'].every(key => toFiniteNumber(point[key]) !== undefined)))
    ? value.sections as NonNullable<MeasurementModel['sections']> : undefined;
  return { assumptions: value.assumptions, formula: value.formula, source: value.source as MeasurementModel['source'], sections };
}

function normalizePlatform(value: unknown): DevicePlatform {
  return value === 'android' || value === 'ios' || value === 'web' ? value : 'unknown';
}

function normalizeMeasurementMethod(value: unknown): MeasurementMethod {
  return value === 'mock' ||
    value === 'manual' ||
    value === 'camera' ||
    value === 'arcore' ||
    value === 'arkit'
    ? value
    : 'manual';
}

function normalizeLengthUnit(value: unknown): MeasurementUnit {
  return value === 'millimeter' ||
    value === 'centimeter' ||
    value === 'meter' ||
    value === 'inch' ||
    value === 'foot'
    ? value
    : 'meter';
}

function normalizeVolumeUnit(value: unknown): VolumeUnit {
  return value === 'cubic_centimeter' ||
    value === 'liter' ||
    value === 'cubic_meter' ||
    value === 'cubic_inch' ||
    value === 'cubic_foot'
    ? value
    : 'liter';
}

export function parseHistoryJsonArray(value: string | null): unknown[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function sortHistoryNewestFirst(records: MeasurementHistoryRecord[]) {
  return [...records].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

export function measurementToHistoryRecord(
  measurement: Measurement,
  preferredUnits: Pick<MeasurementHistoryRecord, 'preferredLengthUnit' | 'preferredVolumeUnit'>,
): MeasurementHistoryRecord {
  return {
    shape: measurement.shape,
    model: measurement.model,
    confidence: measurement.confidence,
    createdAt: measurement.measuredAt,
    depthSupported: measurement.deviceCapabilities.hasDepthSensor,
    heightMeters: measurement.dimensions.heightMeters,
    id: measurement.id,
    lengthMeters: measurement.dimensions.lengthMeters,
    lidarSupported: measurement.deviceCapabilities.hasLiDAR,
    measurementMethod: measurement.method,
    objectType: measurement.objectType,
    platform: measurement.deviceCapabilities.platform,
    preferredLengthUnit: preferredUnits.preferredLengthUnit,
    preferredVolumeUnit: preferredUnits.preferredVolumeUnit,
    snapshotHeight: measurement.snapshot?.height,
    snapshotUri: measurement.snapshot?.uri,
    snapshotWidth: measurement.snapshot?.width,
    volumeCubicMeters: measurement.volume.valueCubicMeters,
    widthMeters: measurement.dimensions.widthMeters,
  };
}

export function historyRecordToMeasurement(record: MeasurementHistoryRecord): Measurement {
  const supportsWorldTracking =
    record.measurementMethod === 'arkit' ||
    record.measurementMethod === 'arcore' ||
    (record.measurementMethod === 'manual' && !record.model);

  return {
    confidence: record.confidence,
    deviceCapabilities: {
      hasARCore: supportsWorldTracking && record.platform === 'android',
      hasARKit: supportsWorldTracking && record.platform === 'ios',
      hasCamera: true,
      hasDepthSensor: record.depthSupported,
      hasLiDAR: record.lidarSupported,
      platform: record.platform,
      supportsWorldTracking,
    },
    dimensions: {
      heightMeters: record.heightMeters,
      lengthMeters: record.lengthMeters,
      unit: 'meter',
      widthMeters: record.widthMeters,
    },
    id: record.id,
    measuredAt: record.createdAt,
    measurementUnit: record.preferredLengthUnit,
    method: record.measurementMethod,
    objectType: record.objectType,
    shape: record.shape ?? 'cuboid',
    model: record.model,
    snapshot: record.snapshotUri
      ? {
          capturedAt: record.createdAt,
          height: record.snapshotHeight,
          uri: record.snapshotUri,
          width: record.snapshotWidth,
        }
      : undefined,
    status: 'completed',
    volume: {
      unit: 'cubic_meter',
      valueCubicMeters: record.volumeCubicMeters,
    },
  };
}

export function normalizeHistoryRecord(value: unknown): MeasurementHistoryRecord | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const id = typeof value.id === 'string' ? value.id : undefined;
  const createdAt = typeof value.createdAt === 'string' ? value.createdAt : undefined;
  const lengthMeters = toFiniteNumber(value.lengthMeters);
  const widthMeters = toFiniteNumber(value.widthMeters);
  const heightMeters = toFiniteNumber(value.heightMeters);
  const volumeCubicMeters = toFiniteNumber(value.volumeCubicMeters);

  if (!id || !createdAt || !lengthMeters || !widthMeters || !heightMeters || !volumeCubicMeters) {
    return undefined;
  }

  const confidence = isObject(value.confidence)
    ? (value.confidence as MeasurementHistoryRecord['confidence'])
    : defaultConfidence;

  return {
    shape: normalizeShape(value.shape),
    model: normalizeModel(value.model),
    confidence,
    createdAt,
    depthSupported: toBoolean(value.depthSupported),
    heightMeters,
    id,
    lengthMeters,
    lidarSupported: toBoolean(value.lidarSupported),
    measurementMethod: normalizeMeasurementMethod(value.measurementMethod),
    objectType: normalizeObjectType(value.objectType),
    platform: normalizePlatform(value.platform),
    preferredLengthUnit: normalizeLengthUnit(value.preferredLengthUnit),
    preferredVolumeUnit: normalizeVolumeUnit(value.preferredVolumeUnit),
    snapshotHeight: toFiniteNumber(value.snapshotHeight),
    snapshotUri: typeof value.snapshotUri === 'string' ? value.snapshotUri : undefined,
    snapshotWidth: toFiniteNumber(value.snapshotWidth),
    volumeCubicMeters,
    widthMeters,
  };
}

export function normalizeHistoryRecords(values: unknown[]) {
  return sortHistoryNewestFirst(values.flatMap((value) => normalizeHistoryRecord(value) ?? []));
}

export function migrateLegacyMeasurements(values: unknown[]) {
  return sortHistoryNewestFirst(
    values.flatMap((value) => {
      if (!isObject(value)) {
        return [];
      }

      const dimensions = isObject(value.dimensions) ? value.dimensions : undefined;
      const volume = isObject(value.volume) ? value.volume : undefined;
      const id = typeof value.id === 'string' ? value.id : undefined;
      const lengthMeters = dimensions ? toFiniteNumber(dimensions.lengthMeters) : undefined;
      const widthMeters = dimensions ? toFiniteNumber(dimensions.widthMeters) : undefined;
      const heightMeters = dimensions ? toFiniteNumber(dimensions.heightMeters) : undefined;
      const volumeCubicMeters = volume ? toFiniteNumber(volume.valueCubicMeters) : undefined;

      if (!id || !lengthMeters || !widthMeters || !heightMeters || !volumeCubicMeters) {
        return [];
      }

      const deviceCapabilities = isObject(value.deviceCapabilities) ? value.deviceCapabilities : {};
      const snapshot = isObject(value.snapshot) ? value.snapshot : undefined;
      const platform = normalizePlatform(deviceCapabilities.platform);

      const legacyMeasurement = {
        confidence: isObject(value.confidence)
          ? (value.confidence as Measurement['confidence'])
          : defaultConfidence,
        deviceCapabilities: {
          hasARCore: toBoolean(deviceCapabilities.hasARCore),
          hasARKit: toBoolean(deviceCapabilities.hasARKit),
          hasCamera: toBoolean(deviceCapabilities.hasCamera),
          hasDepthSensor: toBoolean(deviceCapabilities.hasDepthSensor),
          hasLiDAR: toBoolean(deviceCapabilities.hasLiDAR),
          platform,
          supportsWorldTracking: toBoolean(deviceCapabilities.supportsWorldTracking),
        },
        dimensions: {
          heightMeters,
          lengthMeters,
          unit: 'meter',
          widthMeters,
        },
        id,
        measuredAt: typeof value.measuredAt === 'string' ? value.measuredAt : new Date().toISOString(),
        measurementUnit: normalizeLengthUnit(value.measurementUnit),
        method: normalizeMeasurementMethod(value.method),
        objectType: normalizeObjectType(value.objectType),
        shape: 'cuboid',
        snapshot:
          snapshot && typeof snapshot.uri === 'string'
            ? {
                capturedAt:
                  typeof snapshot.capturedAt === 'string'
                    ? snapshot.capturedAt
                    : typeof value.measuredAt === 'string'
                      ? value.measuredAt
                      : new Date().toISOString(),
                height: toFiniteNumber(snapshot.height),
                uri: snapshot.uri,
                width: toFiniteNumber(snapshot.width),
              }
            : undefined,
        status: 'completed',
        volume: {
          unit: 'cubic_meter',
          valueCubicMeters: volumeCubicMeters,
        },
      } as Measurement;

      return measurementToHistoryRecord(legacyMeasurement, {
        preferredLengthUnit: legacyMeasurement.measurementUnit ?? 'meter',
        preferredVolumeUnit: 'liter',
      });
    }),
  );
}
