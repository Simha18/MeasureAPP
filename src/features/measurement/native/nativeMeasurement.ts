import type { NativeMeasurementModule } from './types';
import { volumeMeasurementModuleAdapter } from './volumeMeasurementModule';

let nativeMeasurementModuleOverride: NativeMeasurementModule | undefined;

export function getNativeMeasurementModule(): NativeMeasurementModule {
  return nativeMeasurementModuleOverride ?? volumeMeasurementModuleAdapter;
}

export function setNativeMeasurementModule(module: NativeMeasurementModule) {
  nativeMeasurementModuleOverride = module;
}

export function resetNativeMeasurementModule() {
  nativeMeasurementModuleOverride = undefined;
}
