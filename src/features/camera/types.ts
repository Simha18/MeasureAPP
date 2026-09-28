import type { PermissionResponse } from 'expo';
import type { CameraCapturedPicture, CameraPictureOptions, CameraType } from 'expo-camera';

export type CameraCaptureState = 'idle' | 'preview' | 'captured';

export type CameraPermissionState = 'loading' | 'granted' | 'requestable' | 'blocked';

export type CameraPreviewCaptureOptions = Pick<
  CameraPictureOptions,
  'base64' | 'exif' | 'maxDownsampling' | 'quality' | 'skipProcessing'
>;

export type CameraSnapshot = Pick<CameraCapturedPicture, 'height' | 'uri' | 'width'>;

export type CameraPreviewHandle = {
  captureFrame: (options?: CameraPreviewCaptureOptions) => Promise<CameraSnapshot | undefined>;
};

export type CameraContextValue = {
  facing: CameraType;
  isCameraActive: boolean;
  isFocused: boolean;
  isForeground: boolean;
  openAppSettings: () => Promise<void>;
  permission: PermissionResponse | null;
  permissionState: CameraPermissionState;
  refreshPermission: () => Promise<PermissionResponse>;
  requestPermission: () => Promise<PermissionResponse>;
  setFacing: (facing: CameraType) => void;
};
