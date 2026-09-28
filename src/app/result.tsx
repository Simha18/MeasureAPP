import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { MetricCard, OptionSelector, PrimaryButton, Screen, SectionHeader } from '@/components';
import { routes } from '@/constants/routes';
import {
  getDisplayedDimensions,
  getDisplayedVolume,
  measurementUnitOptions,
  type Measurement,
  volumeUnitLabels,
  volumeUnitOptions,
  type MeasurementUnit,
  type VolumeUnit,
} from '@/features/measurement';
import { useAppStore } from '@/store';
import { colors, spacing, typography } from '@/theme';
import { formatMeasurement } from '@/utils/formatMeasurement';
import { ModelPreview } from '@/features/measurement/smart/ModelPreview';
import { shapeLabels } from '@/features/measurement/smart/geometry';

export default function MeasurementResultScreen() {
  const { currentMeasurement, isHydrated } = useAppStore();
  if (!currentMeasurement) return <Screen><SectionHeader title={isHydrated ? 'No measurement yet' : 'Loading measurement…'}
    subtitle="Measure an object to see its volume here." /><PrimaryButton label="Start Measurement" onPress={() => router.replace(routes.measure)} /></Screen>;
  return <MeasurementResult measurement={currentMeasurement} />;
}

function MeasurementResult({ measurement }: { measurement: Measurement }) {
  const {
    clearCurrentMeasurement,
    deleteMeasurement,
    measurements,
    saveMeasurement,
    settings,
  } = useAppStore();
  const [lengthUnit, setLengthUnit] = useState<MeasurementUnit>(settings.preferredLengthUnit);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState('');
  const [volumeUnit, setVolumeUnit] = useState<VolumeUnit>(settings.preferredVolumeUnit);
  const dimensions = getDisplayedDimensions(measurement, lengthUnit);
  const preferredVolume = getDisplayedVolume(measurement, volumeUnit);
  const liters = getDisplayedVolume(measurement, 'liter');
  const isSaved = useMemo(
    () => measurements.some((item) => item.id === measurement.id),
    [measurement.id, measurements],
  );

  async function handleSave() {
    setSaveState('saving'); setError('');
    try { await saveMeasurement(measurement); setSaveState('saved'); }
    catch { setSaveState('idle'); setError('Could not save this measurement. Please try again.'); }
  }

  async function handleDelete() {
    await deleteMeasurement(measurement.id);
    await clearCurrentMeasurement();
    router.replace(routes.home);
  }

  async function handleMeasureAgain() {
    await clearCurrentMeasurement();
    router.replace(routes.measure);
  }

  return (
    <Screen>
      <SectionHeader
        title="Measurement Result"
        subtitle={`Review this ${shapeLabels[measurement.shape].toLowerCase()} estimate before saving it locally.`}
      />

      <MetricCard label="Estimated volume" value={formatMeasurement(preferredVolume.value, preferredVolume.unit, { maximumSignificantDigits: 5 })} />
      <ModelPreview measurement={measurement} />
      {measurement.model ? <View style={styles.metaCard}>
        <Text style={styles.metaText}>{measurement.model.formula}</Text>
        {measurement.model.assumptions.map(text => <Text key={text} style={styles.metaText}>{text}</Text>)}
        <Text style={styles.metaText}>Dimensions below describe full extents; outline scans show world-axis bounds.</Text>
      </View> : null}

      <View style={styles.grid}>
        <MetricCard
          label="Length"
          value={formatMeasurement(dimensions.length, dimensions.unit, {
            maximumSignificantDigits: 5,
          })}
        />
        <MetricCard
          label="Width"
          value={formatMeasurement(dimensions.width, dimensions.unit, {
            maximumSignificantDigits: 5,
          })}
        />
        <MetricCard
          label="Height"
          value={formatMeasurement(dimensions.height, dimensions.unit, {
            maximumSignificantDigits: 5,
          })}
        />
        <MetricCard
          label="Volume"
          value={formatMeasurement(measurement.volume.valueCubicMeters, 'cubic_meter', {
            maximumSignificantDigits: 5,
          })}
        />
        <MetricCard
          label={`Converted Volume (${volumeUnitLabels[volumeUnit]})`}
          value={formatMeasurement(preferredVolume.value, preferredVolume.unit, {
            maximumSignificantDigits: 5,
          })}
        />
        <MetricCard
          label="Volume in Liters"
          value={formatMeasurement(liters.value, liters.unit, { maximumSignificantDigits: 5 })}
        />
      </View>

      <View style={styles.metaCard}>
        <Text style={styles.metaText}>{measurement.model && measurement.model.source !== 'ar_points' ? 'Accuracy: not independently verified' : `Tracking quality score: ${Math.round(measurement.confidence.score * 100)}% (not measurement accuracy)`}</Text>
        <Text style={styles.metaText}>Measurement method: {measurement.method}</Text>
        <Text style={styles.metaText}>Date/time: {new Date(measurement.measuredAt).toLocaleString()}</Text>
        <Text style={styles.metaText}>
          Device capability: camera {measurement.deviceCapabilities.hasCamera ? 'available' : 'unavailable'},
          ARCore {measurement.deviceCapabilities.hasARCore ? 'available' : 'not available'}
        </Text>
      </View>

      <View style={styles.unitCard}>
        <Text style={styles.unitTitle}>Change units</Text>
        <OptionSelector
          label="Length unit"
          onChange={setLengthUnit}
          options={measurementUnitOptions}
          value={lengthUnit}
        />
        <OptionSelector
          label="Volume unit"
          onChange={setVolumeUnit}
          options={volumeUnitOptions}
          value={volumeUnit}
        />
      </View>

      {saveState === 'saved' || isSaved ? (
        <Text style={styles.savedText}>Measurement saved locally.</Text>
      ) : null}

      <View style={styles.actions}>
        {error ? <Text style={styles.metaText}>{error}</Text> : null}
        <PrimaryButton
          disabled={isSaved || saveState === 'saving'}
          label={isSaved ? 'Saved' : saveState === 'saving' ? 'Saving…' : 'Save Measurement'}
          onPress={handleSave}
        />
        {measurement.shape === 'cuboid' ? <PrimaryButton
          label="Use for Calibration Test"
          onPress={() => router.push(routes.calibration as Href)}
          variant="secondary"
        /> : null}
        <PrimaryButton label="Measure Again" onPress={handleMeasureAgain} variant="secondary" />
        <PrimaryButton label="Delete" onPress={handleDelete} variant="danger" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: spacing.sm,
  },
  grid: {
    gap: spacing.sm,
  },
  metaCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  metaText: {
    color: colors.mutedText,
    fontSize: typography.body,
    lineHeight: 22,
  },
  savedText: {
    color: colors.success,
    fontSize: typography.body,
    fontWeight: '800',
  },
  unitCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.md,
  },
  unitTitle: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '800',
  },
});
