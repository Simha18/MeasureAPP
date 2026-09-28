import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/theme';

import type { ScanStage } from '../simulation';

type MeasurementInstructionsProps = {
  progressPercentage: number;
  stage: ScanStage;
};

export function MeasurementInstructions({ progressPercentage, stage }: MeasurementInstructionsProps) {
  return (
    <View style={styles.card}>
      <View style={styles.progressHeader}>
        <Text style={styles.stageLabel}>{stage.label}</Text>
        <Text style={styles.progressText}>{progressPercentage}%</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progressPercentage}%` }]} />
      </View>
      <Text style={styles.instructionText}>{stage.instruction}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  instructionText: {
    color: colors.text,
    fontSize: typography.body,
    lineHeight: 22,
  },
  progressFill: {
    backgroundColor: colors.success,
    borderRadius: 8,
    height: '100%',
  },
  progressHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  progressText: {
    color: colors.success,
    fontSize: typography.body,
    fontWeight: '800',
  },
  progressTrack: {
    backgroundColor: '#DDE5EF',
    borderRadius: 8,
    height: 10,
    overflow: 'hidden',
  },
  stageLabel: {
    color: colors.text,
    flex: 1,
    fontSize: typography.subtitle,
    fontWeight: '800',
  },
});
