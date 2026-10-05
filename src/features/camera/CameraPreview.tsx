import { CameraView, type CameraMountError } from 'expo-camera';
import { forwardRef, type PropsWithChildren, useCallback, useImperativeHandle, useRef } from 'react';
import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, spacing, typography } from '@/theme';

import type { CameraContextValue, CameraPreviewHandle } from './types';

type CameraPreviewProps = PropsWithChildren<{
  facing: CameraContextValue['facing'];
  isActive: boolean;
  onCameraReady?: () => void;
  onMountError?: (message: string) => void;
  style?: StyleProp<ViewStyle>;
}>;

export const CameraPreview = forwardRef<CameraPreviewHandle, CameraPreviewProps>(function CameraPreview(
  {
    children,
    facing,
    isActive,
    onCameraReady,
    onMountError,
    style,
  },
  ref,
) {
  const cameraRef = useRef<CameraView>(null);
  const handleMountError = useCallback(
    (event: CameraMountError) => {
      onMountError?.(event.message);
    },
    [onMountError],
  );

  useImperativeHandle(
    ref,
    () => ({
      async captureFrame(options) {
        if (!isActive || !cameraRef.current) {
          return undefined;
        }

        const picture = await cameraRef.current.takePictureAsync({
          base64: true,
          exif: false,
          maxDownsampling: 2,
          quality: 0.5,
          skipProcessing: false,
          ...options,
        });

        return {
          base64: picture.base64,
          height: picture.height,
          uri: picture.uri,
          width: picture.width,
        };
      },
    }),
    [isActive],
  );

  if (!isActive) {
    return (
      <View style={[styles.container, styles.inactiveContainer, style]}>
        <Text style={styles.inactiveTitle}>Camera paused</Text>
        <Text style={styles.inactiveText}>Preview resumes when this screen is active.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <CameraView
        active={Platform.OS === 'ios' ? isActive : undefined}
        autofocus="on"
        facing={facing}
        mode="picture"
        onCameraReady={onCameraReady}
        onMountError={handleMountError}
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {children}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    aspectRatio: 3 / 4,
    backgroundColor: colors.cameraPreview,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  inactiveContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  inactiveText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: typography.body,
    lineHeight: 22,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  inactiveTitle: {
    color: colors.inverseText,
    fontSize: typography.subtitle,
    fontWeight: '800',
  },
});
