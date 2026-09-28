import { Text, View } from 'react-native';
import { PrimaryButton } from '@/components';
import { useCameraContext } from '@/features/camera';
import { smartStyles as styles } from './styles';
export function CameraAccess() {
  const camera = useCameraContext();
  return <View style={styles.card}>
    <Text style={styles.title}>Camera access</Text>
    <Text style={styles.body}>Allow camera access to capture the object. Photos and measurements stay on this device.</Text>
    <PrimaryButton disabled={camera.permissionState === 'loading'} label={camera.permissionState === 'blocked' ? 'Open Settings' : 'Allow Camera'}
      onPress={() => { void (camera.permissionState === 'blocked' ? camera.openAppSettings() : camera.requestPermission()); }} />
  </View>;
}
