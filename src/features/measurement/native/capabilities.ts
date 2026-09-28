import type { DeviceCapabilities, DevicePlatform } from '../types';
import type { MeasurementCapabilities, MeasurementCapabilityReport, MeasurementMode } from './types';

const unavailableNativeReason =
  'Native AR is unavailable in this build. Use reference photos, or install a development build on an AR-capable device.';

export function getMeasurementMode(capabilities: MeasurementCapabilities): MeasurementMode {
  if (capabilities.nativeMeasurementAvailable && capabilities.arSupported && capabilities.depthSupported) {
    return 'ar_depth';
  }

  if (capabilities.nativeMeasurementAvailable && capabilities.arSupported) {
    return 'standard_ar';
  }

  if (capabilities.fallbackMeasurementAvailable) {
    return 'camera_fallback';
  }

  return 'unavailable';
}

export function createUnavailableMeasurementCapabilities(
  platform: DevicePlatform = 'unknown',
): MeasurementCapabilityReport {
  const capabilities: MeasurementCapabilityReport = {
    arSupported: false,
    depthSupported: false,
    detectionSource: 'mock_unavailable',
    fallbackMeasurementAvailable: platform !== 'unknown',
    lidarSupported: false,
    mode: 'unavailable',
    nativeMeasurementAvailable: false,
    platform,
    reason: unavailableNativeReason,
  };

  return {
    ...capabilities,
    mode: getMeasurementMode(capabilities),
  };
}

export function toDeviceCapabilities(capabilities: MeasurementCapabilityReport): DeviceCapabilities {
  return {
    hasARCore: capabilities.platform === 'android' && capabilities.arSupported,
    hasARKit: capabilities.platform === 'ios' && capabilities.arSupported,
    hasCamera: capabilities.fallbackMeasurementAvailable,
    hasDepthSensor: capabilities.depthSupported,
    hasLiDAR: capabilities.lidarSupported,
    platform: capabilities.platform,
    supportsWorldTracking: capabilities.arSupported,
  };
}
