import type { MeasurementDimensions, MeasurementShape } from '../measurement/types';

export type DistancePreset = {
  id: string;
  label: string;
  distanceMeters: number;
  description: string;
};

export const defaultDistancePresets: DistancePreset[] = [
  { id: 'closeup', label: 'Close (25 cm)', distanceMeters: 0.25, description: 'Small item in hand' },
  { id: 'desk', label: 'Desk (40 cm)', distanceMeters: 0.40, description: 'Item on desk or table' },
  { id: 'table', label: 'Medium (65 cm)', distanceMeters: 0.65, description: 'Larger box or bottle' },
  { id: 'floor', label: 'Floor (1.0 m)', distanceMeters: 1.00, description: 'Item on the floor' },
  { id: 'room', label: 'Far (1.5 m)', distanceMeters: 1.50, description: 'Large furniture / parcel' },
];

export type CameraOpticsOptions = {
  // Mobile wide camera horizontal field of view in degrees (typically 62-68 deg)
  horizontalFovDegrees?: number;
  // Mobile wide camera vertical field of view in degrees (typically 48-52 deg)
  verticalFovDegrees?: number;
  // Estimated distance from camera lens to object surface in meters
  distanceMeters: number;
};

export const defaultCameraOptics: Required<CameraOpticsOptions> = {
  distanceMeters: 0.40,
  horizontalFovDegrees: 63,
  verticalFovDegrees: 49,
};

export type NormalizedBox = {
  x: number; // 0 to 1
  y: number; // 0 to 1
  width: number; // 0 to 1
  height: number; // 0 to 1
};

export type ComputedObjectMetrics = {
  shape: MeasurementShape;
  shapeCategory: '2d_planar' | '3d_volumetric';
  dimensions: MeasurementDimensions;
  radiusMeters?: number;
  diameterMeters?: number;
  perimeterMeters: number;
  baseAreaSquareMeters: number;
  surfaceAreaSquareMeters: number;
  volumeCubicMeters: number;
  distanceMeters: number;
  opticalFocalScale: {
    widthPerUnitNorm: number;
    heightPerUnitNorm: number;
  };
};

/**
 * Computes physical real-world dimensions and geometric metrics from normalized
 * bounding box and distance using the optical pinhole camera projection model.
 */
export function computePhysicalMetricsFromBox(
  box: NormalizedBox,
  shape: MeasurementShape,
  optics: CameraOpticsOptions = defaultCameraOptics,
  shapeCategoryOverride?: '2d_planar' | '3d_volumetric',
): ComputedObjectMetrics {
  const distance = Math.max(0.05, optics.distanceMeters);
  const hFovRad = ((optics.horizontalFovDegrees ?? defaultCameraOptics.horizontalFovDegrees) * Math.PI) / 180;
  const vFovRad = ((optics.verticalFovDegrees ?? defaultCameraOptics.verticalFovDegrees) * Math.PI) / 180;

  // Total visible real-world width and height at distance Z
  const visibleWidthMeters = 2 * distance * Math.tan(hFovRad / 2);
  const visibleHeightMeters = 2 * distance * Math.tan(vFovRad / 2);

  // Physical width and height of the bounding box
  const rawWidthMeters = Math.max(0.005, box.width * visibleWidthMeters);
  const rawHeightMeters = Math.max(0.005, box.height * visibleHeightMeters);

  const longEdge = Math.max(rawWidthMeters, rawHeightMeters);
  const shortEdge = Math.min(rawWidthMeters, rawHeightMeters);

  let shapeCategory: '2d_planar' | '3d_volumetric' =
    shapeCategoryOverride ??
    (shape === 'circle' || shape === 'square' || shape === 'rectangle' ? '2d_planar' : '3d_volumetric');

  let widthMeters = rawWidthMeters;
  let heightMeters = rawHeightMeters;
  let lengthMeters = rawWidthMeters;
  let radiusMeters: number | undefined;
  let diameterMeters: number | undefined;
  let perimeterMeters = 0;
  let baseAreaSquareMeters = 0;
  let surfaceAreaSquareMeters = 0;
  let volumeCubicMeters = 0;

  switch (shape) {
    case 'circle': {
      shapeCategory = '2d_planar';
      const avgDiameter = (rawWidthMeters + rawHeightMeters) / 2;
      diameterMeters = avgDiameter;
      radiusMeters = avgDiameter / 2;
      widthMeters = avgDiameter;
      lengthMeters = avgDiameter;
      heightMeters = 0;
      perimeterMeters = Math.PI * avgDiameter; // Circumference
      baseAreaSquareMeters = Math.PI * radiusMeters * radiusMeters;
      surfaceAreaSquareMeters = baseAreaSquareMeters;
      volumeCubicMeters = 0;
      break;
    }

    case 'cylinder': {
      shapeCategory = '3d_volumetric';
      // In portrait camera view, vertical dimension is typically height, horizontal is diameter
      const isVerticalOrientation = rawHeightMeters >= rawWidthMeters;
      diameterMeters = isVerticalOrientation ? rawWidthMeters : rawHeightMeters;
      heightMeters = isVerticalOrientation ? rawHeightMeters : rawWidthMeters;
      radiusMeters = diameterMeters / 2;
      widthMeters = diameterMeters;
      lengthMeters = diameterMeters;
      perimeterMeters = Math.PI * diameterMeters; // Base circumference
      baseAreaSquareMeters = Math.PI * radiusMeters * radiusMeters;
      const lateralArea = 2 * Math.PI * radiusMeters * heightMeters;
      surfaceAreaSquareMeters = 2 * baseAreaSquareMeters + lateralArea;
      volumeCubicMeters = baseAreaSquareMeters * heightMeters;
      break;
    }

    case 'sphere': {
      shapeCategory = '3d_volumetric';
      const avgDiameter = (rawWidthMeters + rawHeightMeters) / 2;
      diameterMeters = avgDiameter;
      radiusMeters = avgDiameter / 2;
      widthMeters = avgDiameter;
      lengthMeters = avgDiameter;
      heightMeters = avgDiameter;
      perimeterMeters = Math.PI * avgDiameter; // Great circle circumference
      baseAreaSquareMeters = Math.PI * radiusMeters * radiusMeters;
      surfaceAreaSquareMeters = 4 * Math.PI * radiusMeters * radiusMeters;
      volumeCubicMeters = (4 / 3) * Math.PI * Math.pow(radiusMeters, 3);
      break;
    }

    case 'square': {
      shapeCategory = '2d_planar';
      const side = (rawWidthMeters + rawHeightMeters) / 2;
      widthMeters = side;
      lengthMeters = side;
      heightMeters = 0;
      perimeterMeters = 4 * side;
      baseAreaSquareMeters = side * side;
      surfaceAreaSquareMeters = baseAreaSquareMeters;
      volumeCubicMeters = 0;
      break;
    }

    case 'rectangle': {
      shapeCategory = '2d_planar';
      widthMeters = shortEdge;
      lengthMeters = longEdge;
      heightMeters = 0;
      perimeterMeters = 2 * (rawWidthMeters + rawHeightMeters);
      baseAreaSquareMeters = rawWidthMeters * rawHeightMeters;
      surfaceAreaSquareMeters = baseAreaSquareMeters;
      volumeCubicMeters = 0;
      break;
    }

    case 'cuboid':
    default: {
      shapeCategory = '3d_volumetric';
      widthMeters = shortEdge;
      lengthMeters = longEdge;
      // In a 2.5D perspective view, depth can be estimated from aspect ratio or typical box proportions
      heightMeters = Math.max(0.02, shortEdge * 0.75);
      perimeterMeters = 2 * (widthMeters + lengthMeters);
      baseAreaSquareMeters = widthMeters * lengthMeters;
      surfaceAreaSquareMeters =
        2 * (widthMeters * lengthMeters + widthMeters * heightMeters + lengthMeters * heightMeters);
      volumeCubicMeters = widthMeters * lengthMeters * heightMeters;
      break;
    }
  }

  const dimensions: MeasurementDimensions = {
    baseAreaSquareMeters,
    diameterMeters,
    heightMeters,
    lengthMeters,
    perimeterMeters,
    radiusMeters,
    surfaceAreaSquareMeters,
    unit: 'meter',
    widthMeters,
  };

  return {
    baseAreaSquareMeters,
    diameterMeters,
    dimensions,
    distanceMeters: distance,
    opticalFocalScale: {
      heightPerUnitNorm: visibleHeightMeters,
      widthPerUnitNorm: visibleWidthMeters,
    },
    perimeterMeters,
    radiusMeters,
    shape,
    shapeCategory,
    surfaceAreaSquareMeters,
    volumeCubicMeters,
  };
}
