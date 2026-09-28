import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/theme';

import type { ScanStage } from '../simulation';

type MeasurementQualityIndicatorProps = {
  cameraError?: string;
  isCameraReady: boolean;
  quality: ScanStage['quality'];
};

const qualityColors: Record<ScanStage['quality'], string> = {
  Good: colors.success,
  High: colors.success,
  Low: colors.warning,
  Medium: colors.warning,
};

export function MeasurementQualityIndicator({
  cameraError,
  isCameraReady,
  quality,
}: MeasurementQualityIndicatorProps) {
  const statusLabel = cameraError ? 'Camera error' : isCameraReady ? quality : 'Starting';
  const statusColor = cameraError ? colors.danger : isCameraReady ? qualityColors[quality] : colors.warning;

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Measurement quality</Text>
      <View style={styles.statusRow}>
        <View style={[styles.dot, { backgroundColor: statusColor }]} />
        <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
      </View>
      {cameraError ? <Text style={styles.errorText}>{cameraError}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  dot: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  errorText: {
    color: colors.mutedText,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  label: {
    color: colors.mutedText,
    fontSize: typography.caption,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  statusText: {
    fontSize: typography.subtitle,
    fontWeight: '800',
  },
});
