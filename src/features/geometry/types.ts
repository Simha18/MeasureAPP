export type NormalizedPoint2D = {
  x: number;
  y: number;
};

export type PixelPoint2D = {
  x: number;
  y: number;
};

export type NormalizedBoundingBox = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type PixelBoundingBox = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type ObjectKeypoint = NormalizedPoint2D & {
  confidence?: number;
  id: string;
};
