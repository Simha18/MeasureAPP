import { describe, expect, it } from 'vitest';

import {
  getCapabilityIssue,
  getTrackingIssue,
  getUserFacingMeasurementIssue,
} from '../errorMessages';
import type { MeasurementCapabilityReport } from '../types';

describe('native measurement error messages', () => {
  it('maps raw camera permission errors to user-facing guidance', () => {
    const issue = getUserFacingMeasurementIssue({
      code: 'missing_camera_permission',
      message: 'SecurityException: camera permission denied',
    });

    expect(issue.title).toBe('Camera permission needed');
    expect(issue.message).not.toContain('SecurityException');
    expect(issue.action).toContain('settings');
  });

  it('maps ARCore installation failures to install guidance', () => {
    const issue = getUserFacingMeasurementIssue({
      message: 'UnavailableArcoreNotInstalledException',
    });

    expect(issue.title).toBe('ARCore installation required');
    expect(issue.action).toContain('Google Play Services for AR');
  });

  it('maps ARKit unsupported capabilities to AR unavailable', () => {
    expect(
      getCapabilityIssue({
        ...baseCapabilities,
        arSupported: false,
        nativeMeasurementAvailable: false,
        platform: 'ios',
        reason: 'ARKit world tracking is not available on this iOS device or simulator.',
      })?.type,
    ).toBe('ar_unavailable');
  });

  it('maps missing native module capabilities separately from unsupported AR', () => {
    expect(
      getCapabilityIssue({
        ...baseCapabilities,
        arSupported: false,
        detectionSource: 'mock_unavailable',
        nativeMeasurementAvailable: false,
        reason: 'Native AR measurement is not implemented yet.',
      })?.type,
    ).toBe('native_module_unavailable');
  });

  it('maps depth and LiDAR gaps to non-blocking guidance', () => {
    expect(
      getCapabilityIssue({
        ...baseCapabilities,
        depthSupported: false,
      })?.type,
    ).toBe('depth_unsupported');

    expect(
      getCapabilityIssue({
        ...baseCapabilities,
        lidarSupported: false,
        platform: 'ios',
      })?.type,
    ).toBe('lidar_unsupported');
  });

  it('maps tracking loss to recovery guidance', () => {
    const issue = getTrackingIssue('limited');

    expect(issue?.title).toBe('Tracking lost');
    expect(issue?.action).toContain('Move slowly');
  });
});

const baseCapabilities: MeasurementCapabilityReport = {
  arSupported: true,
  depthSupported: true,
  detectionSource: 'native',
  fallbackMeasurementAvailable: true,
  lidarSupported: true,
  mode: 'ar_depth',
  nativeMeasurementAvailable: true,
  platform: 'ios',
};
