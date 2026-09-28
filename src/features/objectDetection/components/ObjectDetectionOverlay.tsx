import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/theme';

import type { ObjectDetectionResult, ObjectDetectionStatus } from '../types';

export function ObjectDetectionOverlay({
  minConfidence,
  result,
  status,
}: {
  minConfidence: number;
  result?: ObjectDetectionResult;
  status: ObjectDetectionStatus;
}) {
  if (!result) {
    return status === 'detecting' ? (
      <View style={styles.statusPill}>
        <Text style={styles.statusText}>Detecting box...</Text>
      </View>
    ) : null;
  }

  const isLowConfidence = result.confidence < minConfidence;

  return (
    <>
      <View
        style={[
          styles.boundingBox,
          isLowConfidence && styles.lowConfidenceBox,
          {
            height: `${result.boundingBox.height * 100}%`,
            left: `${result.boundingBox.x * 100}%`,
            top: `${result.boundingBox.y * 100}%`,
            width: `${result.boundingBox.width * 100}%`,
          },
        ]}
      >
        <View style={styles.labelPill}>
          <Text style={styles.labelText}>
            {result.category.toUpperCase()} {Math.round(result.confidence * 100)}%
          </Text>
        </View>
      </View>
      {result.keypoints?.map((keypoint) => (
        <View
          key={keypoint.id}
          style={[
            styles.keypoint,
            isLowConfidence && styles.lowConfidenceKeypoint,
            {
              left: `${keypoint.x * 100}%`,
              top: `${keypoint.y * 100}%`,
            },
          ]}
        />
      ))}
      <View style={styles.statusPill}>
        <Text style={styles.statusText}>
          {isLowConfidence ? 'Low detection confidence. Manual taps remain active.' : 'Box detected. Tap AR corners.'}
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  boundingBox: {
    borderColor: colors.success,
    borderRadius: 8,
    borderWidth: 2,
    position: 'absolute',
  },
  keypoint: {
    backgroundColor: colors.success,
    borderColor: colors.inverseText,
    borderRadius: 6,
    borderWidth: 1,
    height: 12,
    marginLeft: -6,
    marginTop: -6,
    position: 'absolute',
    width: 12,
  },
  labelPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(15,122,77,0.88)',
    borderRadius: 6,
    margin: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  labelText: {
    color: colors.inverseText,
    fontSize: typography.caption,
    fontWeight: '900',
  },
  lowConfidenceBox: {
    borderColor: colors.warning,
    borderStyle: 'dashed',
  },
  lowConfidenceKeypoint: {
    backgroundColor: colors.warning,
  },
  statusPill: {
    alignSelf: 'center',
    backgroundColor: 'rgba(17,24,39,0.72)',
    borderRadius: 8,
    maxWidth: '88%',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    position: 'absolute',
    top: spacing.md,
  },
  statusText: {
    color: colors.inverseText,
    fontSize: typography.caption,
    fontWeight: '800',
    textAlign: 'center',
  },
});
