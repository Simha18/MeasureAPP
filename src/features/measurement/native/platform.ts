import { Platform } from 'react-native';

import type { DevicePlatform } from '../types';

export function getCurrentDevicePlatform(): DevicePlatform {
  if (Platform.OS === 'android' || Platform.OS === 'ios' || Platform.OS === 'web') {
    return Platform.OS;
  }

  return 'unknown';
}
