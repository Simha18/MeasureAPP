export type SegmentationMaskEncoding = 'rle' | 'polygon' | 'native_handle';

export type SegmentationMask = {
  encoding: SegmentationMaskEncoding;
  height?: number;
  nativeHandle?: string;
  polygon?: {
    x: number;
    y: number;
  }[];
  rle?: number[];
  width?: number;
};
