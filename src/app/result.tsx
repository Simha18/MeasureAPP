import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { MetricCard, OptionSelector, PrimaryButton, Screen, SectionHeader } from '@/components';
import { routes } from '@/constants/routes';
import {
  getDisplayedArea,
  getDisplayedBaseArea,
  getDisplayedDiameter,
  getDisplayedDimensions,
  getDisplayedPerimeter,
  getDisplayedRadius,
  getDisplayedSurfaceArea,
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
  const displayedRadius = getDisplayedRadius(measurement, lengthUnit);
  const displayedDiameter = getDisplayedDiameter(measurement, lengthUnit);
  const displayedPerimeter = getDisplayedPerimeter(measurement, lengthUnit);
  const displayedArea = getDisplayedArea(measurement, lengthUnit);
  const displayedBaseArea = getDisplayedBaseArea(measurement, lengthUnit);
  const displayedSurfaceArea = getDisplayedSurfaceArea(measurement, lengthUnit);
  const preferredVolume = getDisplayedVolume(measurement, volumeUnit);
  const liters = getDisplayedVolume(measurement, 'liter');
  const isSaved = useMemo(
    () => measurements.some((item) => item.id === measurement.id),
    [measurement.id, measurements],
  );

  const confidenceScore = measurement.detectedShapeConfidence ?? measurement.confidence.score;
  const isPlanar = measurement.shapeCategory === '2d_planar' || measurement.shape === 'square' || measurement.shape === 'rectangle' || measurement.shape === 'circle' || measurement.shape === 'polygon';

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
        subtitle={`Identified: ${shapeLabels[measurement.shape]} (${Math.round(confidenceScore * 100)}% confidence)`}
      />

      {/* Shape Identification Card */}
      <View style={styles.shapeBadgeCard}>
        <View style={styles.badgeRow}>
          <Text style={styles.shapeBadge}>{shapeLabels[measurement.shape].toUpperCase()}</Text>
          <Text style={styles.confidenceBadge}>{Math.round(confidenceScore * 100)}% Confidence</Text>
          <Text style={styles.categoryBadge}>{isPlanar ? '2D Planar' : '3D Solid'}</Text>
        </View>
        <Text style={styles.formulaText}>{measurement.model?.formula ?? 'Geometric Model'}</Text>
      </View>

      <ModelPreview measurement={measurement} />

      {/* Primary Highlights: Volume or Area */}
      {!isPlanar ? (
        <MetricCard label="Estimated Volume" value={formatMeasurement(preferredVolume.value, preferredVolume.unit, { maximumSignificantDigits: 5 })} />
      ) : displayedArea ? (
        <MetricCard label="Calculated Surface Area" value={`${displayedArea.value.toFixed(2)} ${displayedArea.symbol}`} />
      ) : null}

      {/* Comprehensive Metric Grids */}
      <Text style={styles.sectionTitle}>Physical Dimensions</Text>
      <View style={styles.grid}>
        <MetricCard
          label="Length / Extent"
          value={formatMeasurement(dimensions.length, dimensions.unit, {
            maximumSignificantDigits: 5,
          })}
        />
        <MetricCard
          label="Width / Span"
          value={formatMeasurement(dimensions.width, dimensions.unit, {
            maximumSignificantDigits: 5,
          })}
        />
        {!isPlanar && dimensions.height > 0 ? (
          <MetricCard
            label="Height"
            value={formatMeasurement(dimensions.height, dimensions.unit, {
              maximumSignificantDigits: 5,
            })}
          />
        ) : null}
      </View>

      {/* Circular & Boundary Metrics */}
      {(displayedPerimeter || displayedRadius || displayedDiameter) ? (
        <>
          <Text style={styles.sectionTitle}>Perimeter & Radial Metrics</Text>
          <View style={styles.grid}>
            {displayedPerimeter ? (
              <MetricCard
                label={displayedRadius ? 'Circumference (Perimeter)' : 'Boundary Perimeter'}
                value={`${displayedPerimeter.value.toFixed(2)} ${displayedPerimeter.symbol}`}
              />
            ) : null}
            {displayedRadius ? (
              <MetricCard
                label="Radius (r)"
                value={`${displayedRadius.value.toFixed(2)} ${displayedRadius.symbol}`}
              />
            ) : null}
            {displayedDiameter ? (
              <MetricCard
                label="Diameter (2r)"
                value={`${displayedDiameter.value.toFixed(2)} ${displayedDiameter.symbol}`}
              />
            ) : null}
          </View>
        </>
      ) : null}

      {/* Surface & Area Metrics */}
      {(displayedArea || displayedBaseArea || displayedSurfaceArea) ? (
        <>
          <Text style={styles.sectionTitle}>Area & Surface Metrics</Text>
          <View style={styles.grid}>
            {displayedBaseArea ? (
              <MetricCard
                label="Base / Cross-Section Area"
                value={`${displayedBaseArea.value.toFixed(2)} ${displayedBaseArea.symbol}`}
              />
            ) : null}
            {displayedSurfaceArea && !isPlanar ? (
              <MetricCard
                label="Total Surface Area"
                value={`${displayedSurfaceArea.value.toFixed(2)} ${displayedSurfaceArea.symbol}`}
              />
            ) : null}
          </View>
        </>
      ) : null}

      {/* Volumetric Metrics */}
      {!isPlanar ? (
        <>
          <Text style={styles.sectionTitle}>Volumetric Capacity</Text>
          <View style={styles.grid}>
            <MetricCard
              label="Volume in Liters"
              value={formatMeasurement(liters.value, liters.unit, { maximumSignificantDigits: 5 })}
            />
            <MetricCard
              label={`Converted Volume (${volumeUnitLabels[volumeUnit]})`}
              value={formatMeasurement(preferredVolume.value, preferredVolume.unit, {
                maximumSignificantDigits: 5,
              })}
            />
          </View>
        </>
      ) : null}

      {measurement.model ? (
        <View style={styles.metaCard}>
          <Text style={styles.metaTitle}>Geometric Model & Rationale</Text>
          <Text style={styles.metaFormula}>{measurement.model.formula}</Text>
          {measurement.model.assumptions.map(text => <Text key={text} style={styles.metaText}>• {text}</Text>)}
        </View>
      ) : null}

      <View style={styles.metaCard}>
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
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  categoryBadge: {
    backgroundColor: '#E0E7FF',
    borderColor: '#C7D2FE',
    borderRadius: 6,
    borderWidth: 1,
    color: '#3730A3',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  confidenceBadge: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
    borderRadius: 6,
    borderWidth: 1,
    color: '#15803D',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  formulaText: {
    color: colors.mutedText,
    fontSize: typography.caption,
    fontWeight: '600',
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
  metaFormula: {
    color: colors.accent,
    fontSize: typography.body,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  metaText: {
    color: colors.mutedText,
    fontSize: typography.body,
    lineHeight: 22,
  },
  metaTitle: {
    color: colors.text,
    fontSize: typography.subtitle,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  savedText: {
    color: colors.success,
    fontSize: typography.body,
    fontWeight: '800',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: typography.subtitle,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  shapeBadge: {
    backgroundColor: colors.accent,
    borderRadius: 6,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  shapeBadgeCard: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
    borderRadius: 12,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
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
