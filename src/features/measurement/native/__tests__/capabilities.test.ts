import { describe, expect, it } from 'vitest';

import { createUnavailableMeasurementCapabilities, getMeasurementMode, toDeviceCapabilities } from '../capabilities';

describe('measurement capabilities', () => {
  it('reports camera fallback when native Android AR is unavailable', () => {
    const capabilities = createUnavailableMeasurementCapabilities('android');

    expect(capabilities).toMatchObject({
      arSupported: false,
      depthSupported: false,
      fallbackMeasurementAvailable: true,
      lidarSupported: false,
      mode: 'camera_fallback',
      nativeMeasurementAvailable: false,
      platform: 'android',
    });
  });

  it('reports camera fallback when native iOS AR is unavailable', () => {
    const capabilities = createUnavailableMeasurementCapabilities('ios');

    expect(capabilities.mode).toBe('camera_fallback');
    expect(capabilities.lidarSupported).toBe(false);
  });

  it('selects AR depth mode only when native AR and depth are available', () => {
    const capabilities = createUnavailableMeasurementCapabilities('ios');

    expect(
      getMeasurementMode({
        ...capabilities,
        arSupported: true,
        depthSupported: true,
        nativeMeasurementAvailable: true,
      }),
    ).toBe('ar_depth');
  });

  it('maps measurement capabilities into legacy device capability fields', () => {
    const deviceCapabilities = toDeviceCapabilities({
      ...createUnavailableMeasurementCapabilities('android'),
      arSupported: true,
      depthSupported: true,
    });

    expect(deviceCapabilities).toMatchObject({
      hasARCore: true,
      hasARKit: false,
      hasDepthSensor: true,
      supportsWorldTracking: true,
    });
  });
});
