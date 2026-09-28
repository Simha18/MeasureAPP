import { Link } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { MetricCard, OptionSelector, PrimaryButton, Screen, SectionHeader } from '@/components';
import { routes } from '@/constants/routes';
import {
  calculateCalibrationSummary,
  calibrationRepository,
  createCalibrationTestResult,
  type CalibrationTestResult,
} from '@/features/calibration';
import {
  fromCubicMeters,
  fromMeters,
  measurementUnitOptions,
  toMeters,
  type MeasurementUnit,
  type VolumeUnit,
} from '@/features/measurement';
import { useAppStore } from '@/store';
import { colors, spacing, typography } from '@/theme';
import { formatMeasurement } from '@/utils/formatMeasurement';

type DimensionField = 'length' | 'width' | 'height';

const dimensionLabels: Record<DimensionField, string> = {
  height: 'Actual height',
  length: 'Actual length',
  width: 'Actual width',
};

export default function CalibrationScreen() {
  const { currentMeasurement, settings } = useAppStore();
  const [actualValues, setActualValues] = useState<Record<DimensionField, string>>({
    height: '',
    length: '',
    width: '',
  });
  const [inputUnit, setInputUnit] = useState<MeasurementUnit>(settings.preferredLengthUnit);
  const [results, setResults] = useState<CalibrationTestResult[]>([]);
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle');

  useEffect(() => {
    let isMounted = true;

    async function loadResults() {
      const storedResults = await calibrationRepository.list();

      if (isMounted) {
        setResults(storedResults);
      }
    }

    void loadResults();

    return () => {
      isMounted = false;
    };
  }, []);

  const actualMeters = useMemo(() => {
    const parsed = {
      height: parseDimension(actualValues.height),
      length: parseDimension(actualValues.length),
      width: parseDimension(actualValues.width),
    };

    if (!parsed.height || !parsed.length || !parsed.width) {
      return undefined;
    }

    return {
      height: toMeters(parsed.height, inputUnit),
      length: toMeters(parsed.length, inputUnit),
      width: toMeters(parsed.width, inputUnit),
    };
  }, [actualValues, inputUnit]);

  const pendingResult = useMemo(() => {
    if (!actualMeters || !currentMeasurement || currentMeasurement.shape !== 'cuboid') {
      return undefined;
    }

    return createCalibrationTestResult({
      actualHeightMeters: actualMeters.height,
      actualLengthMeters: actualMeters.length,
      actualWidthMeters: actualMeters.width,
      createdAt: currentMeasurement.measuredAt,
      id: 'calibration-preview',
      measurement: currentMeasurement,
    });
  }, [actualMeters, currentMeasurement]);

  const summary = useMemo(() => calculateCalibrationSummary(results), [results]);
  const canSave = Boolean(pendingResult && currentMeasurement);

  function updateDimension(field: DimensionField, value: string) {
    setSaveState('idle');
    setActualValues((currentValues) => ({
      ...currentValues,
      [field]: value,
    }));
  }

  async function handleSaveResult() {
    if (!pendingResult) {
      return;
    }

    const result = createCalibrationTestResult({
      actualHeightMeters: pendingResult.actualHeightMeters,
      actualLengthMeters: pendingResult.actualLengthMeters,
      actualWidthMeters: pendingResult.actualWidthMeters,
      createdAt: new Date().toISOString(),
      id: `calibration-${Date.now()}-${Math.round(Math.random() * 100000)}`,
      measurement: currentMeasurement!,
    });

    setResults(await calibrationRepository.save(result));
    setSaveState('saved');
  }

  async function handleClearResults() {
    await calibrationRepository.clear();
    setResults([]);
    setSaveState('idle');
  }

  return (
    <Screen>
      <SectionHeader
        title="Calibration Test"
        subtitle="Compare a saved scan against known object dimensions for validation only."
      />

      <View style={styles.noticeCard}>
        <Text style={styles.noticeTitle}>Validation mode</Text>
        <Text style={styles.noticeText}>
          Results are stored locally for test reporting. This does not alter ARCore, ARKit, or
          create automatic correction factors.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Known Dimensions</Text>
        <OptionSelector
          label="Input unit"
          onChange={(value) => {
            setInputUnit(value);
            setSaveState('idle');
          }}
          options={measurementUnitOptions}
          value={inputUnit}
        />
        {(Object.keys(dimensionLabels) as DimensionField[]).map((field) => (
          <View key={field} style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{dimensionLabels[field]}</Text>
            <TextInput
              keyboardType="decimal-pad"
              onChangeText={(value) => updateDimension(field, value)}
              placeholder={`Enter ${field}`}
              placeholderTextColor={colors.mutedText}
              style={styles.input}
              value={actualValues[field]}
            />
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Measured Scan</Text>
        {currentMeasurement ? (
          <>
            <Text style={styles.bodyText}>
              Latest measurement: {currentMeasurement.objectType} via {currentMeasurement.method}
            </Text>
            <Text style={styles.bodyText}>
              Captured {new Date(currentMeasurement.measuredAt).toLocaleString()}
            </Text>
          </>
        ) : (
          <Text style={styles.bodyText}>
            No measurement is available yet. Scan the same object, then return here to compare.
          </Text>
        )}
        <Link href={routes.scan} asChild>
          <PrimaryButton label="Scan Object" variant="secondary" />
        </Link>
      </View>

      {pendingResult ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Measured vs Actual</Text>
          <ComparisonRow
            absoluteError={pendingResult.lengthAbsoluteErrorMeters}
            actual={pendingResult.actualLengthMeters}
            measured={pendingResult.measuredLengthMeters}
            percentageError={pendingResult.lengthPercentageError}
            title="Length"
            unit={inputUnit}
          />
          <ComparisonRow
            absoluteError={pendingResult.widthAbsoluteErrorMeters}
            actual={pendingResult.actualWidthMeters}
            measured={pendingResult.measuredWidthMeters}
            percentageError={pendingResult.widthPercentageError}
            title="Width"
            unit={inputUnit}
          />
          <ComparisonRow
            absoluteError={pendingResult.heightAbsoluteErrorMeters}
            actual={pendingResult.actualHeightMeters}
            measured={pendingResult.measuredHeightMeters}
            percentageError={pendingResult.heightPercentageError}
            title="Height"
            unit={inputUnit}
          />
          <ComparisonRow
            absoluteError={pendingResult.volumeAbsoluteErrorCubicMeters}
            actual={pendingResult.actualVolumeCubicMeters}
            measured={pendingResult.measuredVolumeCubicMeters}
            percentageError={pendingResult.volumePercentageError}
            title="Volume"
            volumeUnit={settings.preferredVolumeUnit}
          />
          <PrimaryButton disabled={!canSave} label="Save Test Result" onPress={handleSaveResult} />
          {saveState === 'saved' ? (
            <Text style={styles.savedText}>Calibration test result saved locally.</Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Measured vs Actual</Text>
          <Text style={styles.bodyText}>
            Enter positive actual length, width, and height values, then scan the same object.
          </Text>
        </View>
      )}

      <SectionHeader title="Summary Metrics" />
      <View style={styles.metricGrid}>
        <MetricCard label="Number of tests" value={`${summary.numberOfTests}`} />
        <MetricCard
          label="Mean Percentage Error"
          value={`${summary.meanPercentageError.toFixed(2)}%`}
        />
        <MetricCard
          label="Best Result"
          value={summary.bestResult ? `${summary.bestResult.overallMeanPercentageError.toFixed(2)}%` : 'n/a'}
        />
        <MetricCard
          label="Worst Result"
          value={summary.worstResult ? `${summary.worstResult.overallMeanPercentageError.toFixed(2)}%` : 'n/a'}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Mean Absolute Error</Text>
        <SummaryErrorRow
          label="Length"
          unit={inputUnit}
          valueMeters={summary.meanAbsoluteLengthErrorMeters}
        />
        <SummaryErrorRow
          label="Width"
          unit={inputUnit}
          valueMeters={summary.meanAbsoluteWidthErrorMeters}
        />
        <SummaryErrorRow
          label="Height"
          unit={inputUnit}
          valueMeters={summary.meanAbsoluteHeightErrorMeters}
        />
        <Text style={styles.bodyText}>
          Volume:{' '}
          {formatMeasurement(
            fromCubicMeters(summary.meanAbsoluteVolumeErrorCubicMeters, settings.preferredVolumeUnit),
            settings.preferredVolumeUnit,
          )}
        </Text>
      </View>

      {results.length > 0 ? (
        <>
          <PrimaryButton label="Clear Calibration Results" onPress={handleClearResults} variant="secondary" />
          <View style={styles.list}>
            {results.map((result) => (
              <View key={result.id} style={styles.resultRow}>
                <Text style={styles.resultTitle}>
                  {result.objectType} test - {result.overallMeanPercentageError.toFixed(2)}%
                </Text>
                <Text style={styles.rowMeta}>
                  {new Date(result.createdAt).toLocaleString()} | {result.measurementMethod} | confidence{' '}
                  {Math.round(result.confidence.score * 100)}%
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

function parseDimension(value: string) {
  const parsed = Number(value.replace(',', '.').trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function ComparisonRow({
  absoluteError,
  actual,
  measured,
  percentageError,
  title,
  unit,
  volumeUnit,
}: {
  absoluteError: number;
  actual: number;
  measured: number;
  percentageError: number;
  title: string;
  unit?: MeasurementUnit;
  volumeUnit?: VolumeUnit;
}) {
  if (volumeUnit) {
    return (
      <View style={styles.comparisonRow}>
        <Text style={styles.comparisonTitle}>{title}</Text>
        <Text style={styles.bodyText}>
          Actual: {formatMeasurement(fromCubicMeters(actual, volumeUnit), volumeUnit)}
        </Text>
        <Text style={styles.bodyText}>
          Measured: {formatMeasurement(fromCubicMeters(measured, volumeUnit), volumeUnit)}
        </Text>
        <Text style={styles.bodyText}>
          Absolute error: {formatMeasurement(fromCubicMeters(absoluteError, volumeUnit), volumeUnit)}
        </Text>
        <Text style={styles.bodyText}>Percentage error: {percentageError.toFixed(2)}%</Text>
      </View>
    );
  }

  if (!unit) {
    return null;
  }

  return (
    <View style={styles.comparisonRow}>
      <Text style={styles.comparisonTitle}>{title}</Text>
      <Text style={styles.bodyText}>Actual: {formatMeasurement(fromMeters(actual, unit), unit)}</Text>
      <Text style={styles.bodyText}>Measured: {formatMeasurement(fromMeters(measured, unit), unit)}</Text>
      <Text style={styles.bodyText}>
        Absolute error: {formatMeasurement(fromMeters(absoluteError, unit), unit)}
      </Text>
      <Text style={styles.bodyText}>Percentage error: {percentageError.toFixed(2)}%</Text>
    </View>
  );
}

function SummaryErrorRow({
  label,
  unit,
  valueMeters,
}: {
  label: string;
  unit: MeasurementUnit;
  valueMeters: number;
}) {
  return (
    <Text style={styles.bodyText}>
      {label}: {formatMeasurement(fromMeters(valueMeters, unit), unit)}
    </Text>
  );
}

const styles = StyleSheet.create({
  bodyText: {
    color: colors.mutedText,
    fontSize: typography.body,
    lineHeight: 22,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  cardTitle: {
    color: colors.text,
    fontSize: typography.subtitle,
    fontWeight: '800',
  },
  comparisonRow: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    gap: spacing.xs,
    paddingBottom: spacing.md,
  },
  comparisonTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '800',
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.body,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  inputGroup: {
    gap: spacing.xs,
  },
  inputLabel: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '700',
  },
  list: {
    gap: spacing.sm,
  },
  metricGrid: {
    gap: spacing.sm,
  },
  noticeCard: {
    backgroundColor: '#EEF7F4',
    borderColor: '#A9DCCB',
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  noticeText: {
    color: colors.mutedText,
    fontSize: typography.body,
    lineHeight: 22,
  },
  noticeTitle: {
    color: colors.success,
    fontSize: typography.subtitle,
    fontWeight: '800',
  },
  resultRow: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: spacing.md,
  },
  resultTitle: {
    color: colors.text,
    fontSize: typography.subtitle,
    fontWeight: '800',
  },
  rowMeta: {
    color: colors.mutedText,
    fontSize: typography.body,
    lineHeight: 22,
    marginTop: spacing.xs,
  },
  savedText: {
    color: colors.success,
    fontSize: typography.body,
    fontWeight: '800',
  },
});
