import { requireNativeViewManager } from 'expo-modules-core';
import { Platform, View, type ViewProps } from 'react-native';

import { isVolumeMeasurementModuleAvailable } from './volumeMeasurementModule';

export type VolumeMeasurementArViewProps = ViewProps & {
  active: boolean;
};

let NativeVolumeMeasurementArView: React.ComponentType<VolumeMeasurementArViewProps> | undefined;

if ((Platform.OS === 'android' || Platform.OS === 'ios') && isVolumeMeasurementModuleAvailable()) {
  try {
    NativeVolumeMeasurementArView =
      requireNativeViewManager<VolumeMeasurementArViewProps>('VolumeMeasurementModule');
  } catch {
    NativeVolumeMeasurementArView = undefined;
  }
}

export function isVolumeMeasurementArViewAvailable() {
  return NativeVolumeMeasurementArView !== undefined;
}

export function VolumeMeasurementArView(props: VolumeMeasurementArViewProps) {
  if (!NativeVolumeMeasurementArView) {
    return <View {...props} />;
  }

  return <NativeVolumeMeasurementArView {...props} />;
}
