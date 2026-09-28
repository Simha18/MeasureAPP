import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/theme';

type MeasurementOverlayProps = {
  isComplete: boolean;
  isReady: boolean;
  progress: number;
};

export function MeasurementOverlay({ isComplete, isReady, progress }: MeasurementOverlayProps) {
  const showBox = progress >= 0.28;
  const showReticle = progress < 1;

  return (
    <View style={styles.overlay}>
      <View style={[styles.surfaceLine, { opacity: showBox ? 1 : 0.35 }]} />
      {showBox ? (
        <View style={[styles.boundingBox, isComplete && styles.completeBox]}>
          <View style={styles.cornerTopLeft} />
          <View style={styles.cornerTopRight} />
          <View style={styles.cornerBottomLeft} />
          <View style={styles.cornerBottomRight} />
        </View>
      ) : null}
      {showReticle ? (
        <>
          <View style={styles.reticleHorizontal} />
          <View style={styles.reticleVertical} />
        </>
      ) : null}
      <Text style={styles.previewLabel}>{isReady ? 'Live camera preview' : 'Starting camera...'}</Text>
    </View>
  );
}

const cornerBase = {
  height: 24,
  position: 'absolute',
  width: 24,
} as const;

const styles = StyleSheet.create({
  boundingBox: {
    borderColor: colors.accent,
    borderRadius: 8,
    borderWidth: 2,
    height: '40%',
    position: 'absolute',
    top: '32%',
    transform: [{ skewY: '-7deg' }],
    width: '68%',
  },
  completeBox: {
    borderColor: colors.success,
  },
  cornerBottomLeft: {
    ...cornerBase,
    borderBottomColor: colors.inverseText,
    borderBottomWidth: 3,
    borderLeftColor: colors.inverseText,
    borderLeftWidth: 3,
    bottom: -2,
    left: -2,
  },
  cornerBottomRight: {
    ...cornerBase,
    borderBottomColor: colors.inverseText,
    borderBottomWidth: 3,
    borderRightColor: colors.inverseText,
    borderRightWidth: 3,
    bottom: -2,
    right: -2,
  },
  cornerTopLeft: {
    ...cornerBase,
    borderLeftColor: colors.inverseText,
    borderLeftWidth: 3,
    borderTopColor: colors.inverseText,
    borderTopWidth: 3,
    left: -2,
    top: -2,
  },
  cornerTopRight: {
    ...cornerBase,
    borderRightColor: colors.inverseText,
    borderRightWidth: 3,
    borderTopColor: colors.inverseText,
    borderTopWidth: 3,
    right: -2,
    top: -2,
  },
  overlay: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  previewLabel: {
    backgroundColor: 'rgba(17,24,39,0.62)',
    borderRadius: 8,
    bottom: spacing.md,
    color: colors.inverseText,
    fontSize: typography.caption,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    position: 'absolute',
  },
  reticleHorizontal: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    height: 1,
    position: 'absolute',
    width: 72,
  },
  reticleVertical: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    height: 72,
    position: 'absolute',
    width: 1,
  },
  surfaceLine: {
    backgroundColor: 'rgba(255,255,255,0.32)',
    bottom: '24%',
    height: 2,
    position: 'absolute',
    transform: [{ rotate: '-5deg' }],
    width: '115%',
  },
});
