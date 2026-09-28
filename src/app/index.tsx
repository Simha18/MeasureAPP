import { Link, type Href } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { PrimaryButton, Screen, SectionHeader } from '@/components';
import { routes } from '@/constants/routes';
import {
  getDisplayedDimensions,
  mockCuboidMeasurement,
  volumeUnitLabels,
} from '@/features/measurement';
import { useAppStore } from '@/store';
import { colors, spacing, typography } from '@/theme';
import { formatMeasurement } from '@/utils/formatMeasurement';
import { shapeLabels } from '@/features/measurement/smart/geometry';

const supportedObjects = ['Boxes', 'Round objects', 'Large outlines', 'Cross-sections'];

export default function HomeScreen() {
  const { measurements, settings } = useAppStore();
  const recentMeasurements = measurements.slice(0, 3);
  const fallbackDimensions = getDisplayedDimensions(
    mockCuboidMeasurement,
    settings.preferredLengthUnit,
  );

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.kicker}>POC Volume Finder</Text>
        <Text style={styles.title}>Find the volume. See the shape.</Text>
        <Text style={styles.description}>
          Measure dimensions with your camera, fix points as you walk around an object,
          or trace horizontal outlines to estimate an irregular shape.
        </Text>
        <Link href={routes.measure} asChild>
          <PrimaryButton label="Start Measurement" />
        </Link>
        <Link href={routes.settings} asChild>
          <PrimaryButton label="Settings" variant="secondary" />
        </Link>
        <Link href={routes.calibration as Href} asChild>
          <PrimaryButton label="Calibration Test" variant="secondary" />
        </Link>
      </View>

      <View style={styles.supportCard}>
        <Text style={styles.cardTitle}>Supported object type</Text>
        <View style={styles.chips}>
          {supportedObjects.map((objectType) => (
            <Text key={objectType} style={styles.chip}>
              {objectType}
            </Text>
          ))}
        </View>
      </View>

      <SectionHeader title="Recent Measurements" />
      {recentMeasurements.length > 0 ? (
        <Link href={routes.history} asChild>
          <PrimaryButton label="View All History" variant="secondary" />
        </Link>
      ) : null}
      <View style={styles.list}>
        {recentMeasurements.length > 0 ? (
          recentMeasurements.map((measurement) => {
            const dimensions = getDisplayedDimensions(measurement, settings.preferredLengthUnit);

            return (
              <View key={measurement.id} style={styles.row}>
                <Text style={styles.rowTitle}>{shapeLabels[measurement.shape]} measurement</Text>
                <Text style={styles.rowMeta}>
                  {formatMeasurement(dimensions.length, dimensions.unit)} x{' '}
                  {formatMeasurement(dimensions.width, dimensions.unit)} x{' '}
                  {formatMeasurement(dimensions.height, dimensions.unit)}
                </Text>
                <Text style={styles.rowMeta}>{new Date(measurement.measuredAt).toLocaleString()}</Text>
              </View>
            );
          })
        ) : (
          <View style={styles.row}>
            <Text style={styles.rowTitle}>No saved measurements yet</Text>
            <Text style={styles.rowMeta}>
              Example POC size: {formatMeasurement(fallbackDimensions.length, fallbackDimensions.unit)} x{' '}
              {formatMeasurement(fallbackDimensions.width, fallbackDimensions.unit)} x{' '}
              {formatMeasurement(fallbackDimensions.height, fallbackDimensions.unit)}
            </Text>
            <Text style={styles.rowMeta}>
              Preferred volume unit: {volumeUnitLabels[settings.preferredVolumeUnit]}
            </Text>
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardTitle: {
    color: colors.text,
    fontSize: typography.subtitle,
    fontWeight: '700',
  },
  chip: {
    backgroundColor: '#EAF2FF',
    borderColor: '#BFD7FF',
    borderRadius: 8,
    borderWidth: 1,
    color: colors.accent,
    fontSize: typography.body,
    fontWeight: '700',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  description: {
    color: colors.mutedText,
    fontSize: typography.body,
    lineHeight: 24,
  },
  hero: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  kicker: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  list: {
    gap: spacing.sm,
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
  supportCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: typography.title,
    fontWeight: '800',
    lineHeight: 34,
  },
});
