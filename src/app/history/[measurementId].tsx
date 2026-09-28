import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { MetricCard, PrimaryButton, Screen, SectionHeader } from '@/components';
import { routes } from '@/constants/routes';
import { fromCubicMeters, fromMeters } from '@/features/measurement';
import { useAppStore } from '@/store';
import { colors, spacing, typography } from '@/theme';
import { formatMeasurement } from '@/utils/formatMeasurement';
import { historyRecordToMeasurement } from '@/features/history';
import { ModelPreview } from '@/features/measurement/smart/ModelPreview';
import { shapeLabels } from '@/features/measurement/smart/geometry';

function getParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatBoolean(value: boolean) {
  return value ? 'Yes' : 'No';
}

function formatTitle(value: string) {
  return value.replace(/_/g, ' ');
}

export default function MeasurementHistoryDetailScreen() {
  const params = useLocalSearchParams<{ measurementId?: string | string[] }>();
  const measurementId = getParamValue(params.measurementId);
  const { deleteMeasurement, getHistoryRecord, isHydrated } = useAppStore();
  const measurement = measurementId ? getHistoryRecord(measurementId) : undefined;
  const [failedSnapshotUri, setFailedSnapshotUri] = useState<string | undefined>();
  const snapshotFailed = Boolean(
    measurement?.snapshotUri && failedSnapshotUri === measurement.snapshotUri,
  );

  const displayed = useMemo(() => {
    if (!measurement) {
      return undefined;
    }

    return {
      height: fromMeters(measurement.heightMeters, measurement.preferredLengthUnit),
      length: fromMeters(measurement.lengthMeters, measurement.preferredLengthUnit),
      volume: fromCubicMeters(
        measurement.volumeCubicMeters,
        measurement.preferredVolumeUnit,
      ),
      width: fromMeters(measurement.widthMeters, measurement.preferredLengthUnit),
    };
  }, [measurement]);

  async function handleDelete() {
    if (!measurementId) {
      return;
    }

    await deleteMeasurement(measurementId);
    router.replace(routes.history);
  }

  if (!isHydrated) {
    return (
      <Screen>
        <SectionHeader title="Measurement Details" subtitle="Loading saved measurement..." />
      </Screen>
    );
  }

  if (!measurement || !displayed) {
    return (
      <Screen>
        <SectionHeader
          title="Measurement Details"
          subtitle="This saved measurement is no longer available on this device."
        />
        <PrimaryButton label="Back to History" onPress={() => router.replace(routes.history)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <SectionHeader
        title="Measurement Details"
        subtitle={`${shapeLabels[measurement.shape ?? 'cuboid']} saved ${new Date(
          measurement.createdAt,
        ).toLocaleString()}`}
      />

      <ModelPreview measurement={historyRecordToMeasurement(measurement)} />
      {measurement.model ? <View style={styles.section}>
        <Text style={styles.sectionTitle}>{measurement.model.formula}</Text>
        {measurement.model.assumptions.map(text => <Text key={text} style={styles.mutedText}>{text}</Text>)}
      </View> : null}

      <View style={styles.metricGrid}>
        <MetricCard
          label="Length"
          value={formatMeasurement(displayed.length, measurement.preferredLengthUnit)}
        />
        <MetricCard
          label="Width"
          value={formatMeasurement(displayed.width, measurement.preferredLengthUnit)}
        />
        <MetricCard
          label="Height"
          value={formatMeasurement(displayed.height, measurement.preferredLengthUnit)}
        />
        <MetricCard
          label="Volume"
          value={formatMeasurement(displayed.volume, measurement.preferredVolumeUnit)}
        />
      </View>

      {measurement.snapshotUri ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Snapshot</Text>
          {snapshotFailed ? (
            <Text style={styles.mutedText}>Snapshot file is missing or can no longer be opened.</Text>
          ) : (
            <Image
              onError={() => setFailedSnapshotUri(measurement.snapshotUri)}
              source={{ uri: measurement.snapshotUri }}
              style={styles.snapshot}
            />
          )}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Stored Data</Text>
        <DetailRow label="ID" value={measurement.id} />
        <DetailRow label="Created" value={new Date(measurement.createdAt).toLocaleString()} />
        <DetailRow label="Object type" value={formatTitle(measurement.objectType)} />
        <DetailRow label="Length meters" value={`${measurement.lengthMeters}`} />
        <DetailRow label="Width meters" value={`${measurement.widthMeters}`} />
        <DetailRow label="Height meters" value={`${measurement.heightMeters}`} />
        <DetailRow label="Volume cubic meters" value={`${measurement.volumeCubicMeters}`} />
        <DetailRow label="Preferred length unit" value={measurement.preferredLengthUnit} />
        <DetailRow label="Preferred volume unit" value={measurement.preferredVolumeUnit} />
        <DetailRow label="Tracking quality (not accuracy)" value={measurement.model && measurement.model.source !== 'ar_points' ? 'Not independently verified' : `${Math.round(measurement.confidence.score * 100)}%`} />
        <DetailRow label="Confidence level" value={measurement.confidence.level} />
        <DetailRow label="Measurement method" value={measurement.measurementMethod} />
        <DetailRow label="Platform" value={measurement.platform} />
        <DetailRow label="Depth supported" value={formatBoolean(measurement.depthSupported)} />
        <DetailRow label="LiDAR supported" value={formatBoolean(measurement.lidarSupported)} />
      </View>

      <PrimaryButton label="Delete Measurement" onPress={handleDelete} variant="danger" />
    </Screen>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  detailLabel: {
    color: colors.mutedText,
    flex: 1,
    fontSize: typography.body,
    fontWeight: '700',
  },
  detailRow: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  detailValue: {
    color: colors.text,
    flexWrap: 'wrap',
    fontSize: typography.body,
    lineHeight: 22,
  },
  metricGrid: {
    gap: spacing.sm,
  },
  mutedText: {
    color: colors.mutedText,
    fontSize: typography.body,
    lineHeight: 22,
  },
  section: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: typography.subtitle,
    fontWeight: '800',
    marginBottom: spacing.sm,
  },
  snapshot: {
    aspectRatio: 4 / 3,
    backgroundColor: colors.border,
    borderRadius: 8,
    width: '100%',
  },
});
