import { Link, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton, Screen, SectionHeader } from '@/components';
import { routes } from '@/constants/routes';
import { fromCubicMeters, fromMeters } from '@/features/measurement';
import { useAppStore } from '@/store';
import { colors, spacing, typography } from '@/theme';
import { formatMeasurement } from '@/utils/formatMeasurement';
import { shapeLabels } from '@/features/measurement/smart/geometry';

export default function MeasurementHistoryScreen() {
  const { clearHistory, history } = useAppStore();

  return (
    <Screen>
      <SectionHeader
        title="Measurement History"
        subtitle="Saved scans are stored locally on this device for the POC."
      />

      {history.length > 0 ? (
        <View style={styles.actions}>
          <PrimaryButton label="Clear History" onPress={clearHistory} variant="secondary" />
        </View>
      ) : null}

      <View style={styles.list}>
        {history.length > 0 ? (
          history.map((measurement) => {
            const length = fromMeters(measurement.lengthMeters, measurement.preferredLengthUnit);
            const width = fromMeters(measurement.widthMeters, measurement.preferredLengthUnit);
            const height = fromMeters(measurement.heightMeters, measurement.preferredLengthUnit);
            const volume = fromCubicMeters(
              measurement.volumeCubicMeters,
              measurement.preferredVolumeUnit,
            );

            return (
              <Link
                key={measurement.id}
                href={`/history/${measurement.id}` as Href}
                asChild
              >
                <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressedRow]}>
                  <Text style={styles.rowTitle}>{shapeLabels[measurement.shape ?? 'cuboid']} measurement</Text>
                  <Text style={styles.rowMeta}>
                    {formatMeasurement(length, measurement.preferredLengthUnit)} x{' '}
                    {formatMeasurement(width, measurement.preferredLengthUnit)} x{' '}
                    {formatMeasurement(height, measurement.preferredLengthUnit)}
                  </Text>
                  <Text style={styles.rowMeta}>
                    Volume: {formatMeasurement(volume, measurement.preferredVolumeUnit)}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {measurement.model && measurement.model.source !== 'ar_points' ? 'Accuracy not independently verified' : `Tracking quality: ${Math.round(measurement.confidence.score * 100)}%`}
                  </Text>
                  <Text style={styles.rowMeta}>{new Date(measurement.createdAt).toLocaleString()}</Text>
                </Pressable>
              </Link>
            );
          })
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No saved scans yet</Text>
            <Text style={styles.emptyText}>
              Measure an object and save its result to build local history.
            </Text>
            <Link href={routes.measure} asChild>
              <PrimaryButton label="Start Measurement" />
            </Link>
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    alignItems: 'stretch',
    marginBottom: spacing.md,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  emptyText: {
    color: colors.mutedText,
    fontSize: typography.body,
    lineHeight: 22,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: typography.subtitle,
    fontWeight: '800',
  },
  list: {
    gap: spacing.sm,
  },
  pressedRow: {
    opacity: 0.82,
  },
  row: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: spacing.md,
  },
  rowMeta: {
    color: colors.mutedText,
    fontSize: typography.body,
    lineHeight: 22,
    marginTop: spacing.xs,
  },
  rowTitle: {
    color: colors.text,
    fontSize: typography.subtitle,
    fontWeight: '700',
  },
});
