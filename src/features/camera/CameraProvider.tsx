import { useCameraPermissions } from 'expo-camera';
import { useIsFocused } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, Linking, type AppStateStatus } from 'react-native';

import type { CameraContextValue, CameraPermissionState } from './types';

const CameraContext = createContext<CameraContextValue | undefined>(undefined);

function getPermissionState(permission: CameraContextValue['permission']): CameraPermissionState {
  if (!permission) {
    return 'loading';
  }

  if (permission.granted) {
    return 'granted';
  }

  return permission.canAskAgain ? 'requestable' : 'blocked';
}

type CameraProviderProps = {
  children: React.ReactNode;
};

export function CameraProvider({ children }: CameraProviderProps) {
  const [permission, requestCameraPermission, getCameraPermission] = useCameraPermissions();
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [facing, setFacing] = useState<CameraContextValue['facing']>('back');
  const isFocused = useIsFocused();
  const isForeground = appState === 'active';
  const permissionState = getPermissionState(permission);
  const isCameraActive = isFocused && isForeground && permissionState === 'granted';

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (isForeground) {
      void getCameraPermission();
    }
  }, [getCameraPermission, isForeground]);

  const requestPermission = useCallback(() => requestCameraPermission(), [requestCameraPermission]);
  const refreshPermission = useCallback(() => getCameraPermission(), [getCameraPermission]);

  const openAppSettings = useCallback(async () => {
    await Linking.openSettings();
  }, []);

  const value = useMemo<CameraContextValue>(
    () => ({
      facing,
      isCameraActive,
      isFocused,
      isForeground,
      openAppSettings,
      permission,
      permissionState,
      refreshPermission,
      requestPermission,
      setFacing,
    }),
    [
      facing,
      isCameraActive,
      isFocused,
      isForeground,
      openAppSettings,
      permission,
      permissionState,
      refreshPermission,
      requestPermission,
    ],
  );

  return <CameraContext.Provider value={value}>{children}</CameraContext.Provider>;
}

export function useCameraContext() {
  const context = useContext(CameraContext);

  if (!context) {
    throw new Error('useCameraContext must be used inside CameraProvider.');
  }

  return context;
}
