import type { MeasurementCapabilityReport, TrackingState } from './types';

export type MeasurementIssueKind =
  | 'arcore_install_required'
  | 'ar_unavailable'
  | 'camera_permission_denied'
  | 'camera_unavailable'
  | 'depth_unsupported'
  | 'insufficient_features'
  | 'insufficient_lighting'
  | 'invalid_measurement'
  | 'lidar_unsupported'
  | 'native_module_unavailable'
  | 'no_surface_detected'
  | 'object_not_detected'
  | 'session_failure'
  | 'tracking_lost';

export type UserFacingMeasurementIssue = {
  action: string;
  message: string;
  title: string;
  type: MeasurementIssueKind;
};

const fallbackIssue: UserFacingMeasurementIssue = {
  action: 'Try again or return home.',
  message: 'Measurement is not available right now.',
  title: 'Measurement unavailable',
  type: 'session_failure',
};

export function getUserFacingMeasurementIssue(input: {
  code?: string;
  fallback?: UserFacingMeasurementIssue;
  message?: string;
}): UserFacingMeasurementIssue {
  const normalized = `${input.code ?? ''} ${input.message ?? ''}`.toLowerCase();
  const fallback = input.fallback ?? fallbackIssue;

  if (hasAny(normalized, ['missing_camera_permission', 'permission', 'denied'])) {
    return {
      action: 'Allow camera access in settings, then retry.',
      message: 'Camera permission is required before measurement can start.',
      title: 'Camera permission needed',
      type: 'camera_permission_denied',
    };
  }

  if (hasAny(normalized, ['cameranotavailable', 'camera_not_available', 'camera became unavailable'])) {
    return {
      action: 'Close other camera apps and try again.',
      message: 'The camera is unavailable right now.',
      title: 'Camera unavailable',
      type: 'camera_unavailable',
    };
  }

  if (
    hasAny(normalized, [
      'arcore_not_installed',
      'installation',
      'install',
      'unavailablearcorenotinstalled',
      'unavailableuserdeclinedinstallation',
      'google play services for ar',
    ])
  ) {
    return {
      action: 'Install or update Google Play Services for AR, then retry.',
      message: 'ARCore needs Google Play Services for AR before AR measurement can start.',
      title: 'ARCore installation required',
      type: 'arcore_install_required',
    };
  }

  if (
    hasAny(normalized, [
      'arkit_unsupported',
      'world tracking is not supported',
      'world tracking is not available',
      'device not compatible',
      'unavailabledevicenotcompatible',
      'arcore is not available',
      'ar unavailable',
    ])
  ) {
    return {
      action: 'Use Camera Fallback or return home.',
      message: 'This device does not support AR measurement.',
      title: 'AR unavailable',
      type: 'ar_unavailable',
    };
  }

  if (hasAny(normalized, ['native ar apis are unavailable', 'native module', 'native ar measurement'])) {
    return {
      action: 'Use Camera Fallback or return home.',
      message: 'Native AR measurement is unavailable in this build.',
      title: 'Native module unavailable',
      type: 'native_module_unavailable',
    };
  }

  if (hasAny(normalized, ['depth api is not supported', 'scene depth is not supported', 'depth unsupported'])) {
    return {
      action: 'Continue with standard AR or Manual Mode.',
      message: 'Depth measurement is not supported on this device.',
      title: 'Depth unsupported',
      type: 'depth_unsupported',
    };
  }

  if (hasAny(normalized, ['lidar'])) {
    return {
      action: 'Continue with standard AR or Manual Mode.',
      message: 'LiDAR is not available on this device.',
      title: 'LiDAR unsupported',
      type: 'lidar_unsupported',
    };
  }

  if (hasAny(normalized, ['light', 'exposure'])) {
    return {
      action: 'Move to brighter lighting and retry.',
      message: 'The scene is too dark for reliable measurement.',
      title: 'Insufficient lighting',
      type: 'insufficient_lighting',
    };
  }

  if (hasAny(normalized, ['feature', 'texture', 'visual detail'])) {
    return {
      action: 'Aim at a textured surface near the object and move slowly.',
      message: 'The camera cannot see enough visual detail to track reliably.',
      title: 'Insufficient features',
      type: 'insufficient_features',
    };
  }

  if (hasAny(normalized, ['no surface', 'plane', 'detected plane'])) {
    return {
      action: 'Move slowly until the table or floor is visible.',
      message: 'No surface has been detected yet.',
      title: 'No surface detected',
      type: 'no_surface_detected',
    };
  }

  if (hasAny(normalized, ['object detection', 'no box', 'object not detected', 'no confident rectangular'])) {
    return {
      action: 'Continue scanning or switch to Manual Mode.',
      message: 'No box-like object is detected yet.',
      title: 'Object not detected',
      type: 'object_not_detected',
    };
  }

  if (hasAny(normalized, ['invalid', 'too small', 'too large', 'must be positive'])) {
    return {
      action: 'Retry the dimension and select two stable points.',
      message: 'The measurement is not valid yet.',
      title: 'Invalid measurement',
      type: 'invalid_measurement',
    };
  }

  if (hasAny(normalized, ['tracking', 'limited', 'lost'])) {
    return createTrackingIssue();
  }

  return fallback;
}

export function getCapabilityIssue(
  capabilities: MeasurementCapabilityReport | undefined,
): UserFacingMeasurementIssue | undefined {
  if (!capabilities) {
    return undefined;
  }

  const reason = capabilities.reason?.toLowerCase() ?? '';
  const nativeModuleMissing = reason.includes('native ar measurement') || reason.includes('native ar apis');

  if (!capabilities.arSupported && nativeModuleMissing) {
    return getUserFacingMeasurementIssue({
      message: capabilities.reason,
      fallback: {
        action: capabilities.fallbackMeasurementAvailable ? 'Use Camera Fallback.' : 'Return Home.',
        message: 'Native AR measurement is unavailable in this build.',
        title: 'Native module unavailable',
        type: 'native_module_unavailable',
      },
    });
  }

  if (!capabilities.arSupported) {
    return getUserFacingMeasurementIssue({ message: capabilities.reason });
  }

  if (!capabilities.nativeMeasurementAvailable) {
    return getUserFacingMeasurementIssue({
      message: capabilities.reason,
      fallback: {
        action: capabilities.fallbackMeasurementAvailable ? 'Use Camera Fallback.' : 'Return Home.',
        message: 'Native AR measurement is unavailable in this build.',
        title: 'Native module unavailable',
        type: 'native_module_unavailable',
      },
    });
  }

  if (!capabilities.depthSupported) {
    return getUserFacingMeasurementIssue({
      message: 'depth unsupported',
    });
  }

  if (capabilities.platform === 'ios' && !capabilities.lidarSupported) {
    return getUserFacingMeasurementIssue({
      message: 'lidar unsupported',
    });
  }

  return undefined;
}

export function getTrackingIssue(status: TrackingState['status']): UserFacingMeasurementIssue | undefined {
  if (status !== 'limited' && status !== 'not_available' && status !== 'stopped') {
    return undefined;
  }

  return createTrackingIssue();
}

function createTrackingIssue(): UserFacingMeasurementIssue {
  return {
    action: 'Move slowly, improve lighting, and keep the object in view.',
    message: 'Tracking is not stable enough for AR measurement.',
    title: 'Tracking lost',
    type: 'tracking_lost',
  };
}

export function logTechnicalMeasurementError(context: string, error: unknown) {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn(`[VolumeMeasurement] ${context}`, error);
  }
}

function hasAny(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle));
}
