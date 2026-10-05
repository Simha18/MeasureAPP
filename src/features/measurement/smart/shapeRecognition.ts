import type { DeviceCapabilities, Measurement, MeasurementDimensions, MeasurementShape } from '../types';
import { formulas, shapeLabels } from './geometry';

export type Point2 = { x: number; y: number };

export type ShapeRecognitionInput = {
  // Dimensions in meters (either from AR bounding box, camera depth raycast, or manual)
  lengthMeters: number;
  widthMeters: number;
  heightMeters?: number;
  // Visual indicators
  circularity?: number; // 0 to 1
  isCurved?: boolean;
  hasOrthogonalCorners?: boolean;
  contourPoints?: Point2[];
  isPlanar?: boolean;
};

export type ShapeRecognitionResult = {
  shape: MeasurementShape;
  shapeLabel: string;
  shapeCategory: '2d_planar' | '3d_volumetric';
  confidence: number;
  dimensions: MeasurementDimensions;
  volumeCubicMeters: number;
  formula: string;
  rationale: string;
  assumptions: string[];
};

export type BenchmarkPreset = {
  id: string;
  name: string;
  category: string;
  shape: MeasurementShape;
  description: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  isCurved?: boolean;
  isPlanar?: boolean;
};

export const benchmarkPresets: BenchmarkPreset[] = [
  {
    id: 'soda_can',
    name: 'Soda Can / Tumbler',
    category: '3D Cylindrical',
    shape: 'cylinder',
    description: 'Standard beverage can (diameter 6.6 cm, height 12.2 cm)',
    lengthCm: 6.6,
    widthCm: 6.6,
    heightCm: 12.2,
    isCurved: true,
  },
  {
    id: 'shipping_box',
    name: 'Shipping Carton',
    category: '3D Volumetric',
    shape: 'cuboid',
    description: 'Standard shipping box (30 × 20 × 15 cm)',
    lengthCm: 30.0,
    widthCm: 20.0,
    heightCm: 15.0,
  },
  {
    id: 'a4_document',
    name: 'A4 Document / Sheet',
    category: '2D Planar',
    shape: 'rectangle',
    description: 'ISO 216 paper sheet (29.7 × 21.0 cm)',
    lengthCm: 29.7,
    widthCm: 21.0,
    heightCm: 0.1,
    isPlanar: true,
  },
  {
    id: 'floor_tile',
    name: 'Ceramic Floor Tile',
    category: '2D Planar',
    shape: 'square',
    description: 'Square tile (30.0 × 30.0 cm)',
    lengthCm: 30.0,
    widthCm: 30.0,
    heightCm: 0.8,
    isPlanar: true,
  },
  {
    id: 'coffee_saucer',
    name: 'Plate / Circular Disc',
    category: '2D Planar',
    shape: 'circle',
    description: 'Circular ceramic saucer (diameter 18.0 cm)',
    lengthCm: 18.0,
    widthCm: 18.0,
    heightCm: 1.2,
    isCurved: true,
    isPlanar: true,
  },
  {
    id: 'tennis_ball',
    name: 'Tennis Ball',
    category: '3D Spherical',
    shape: 'sphere',
    description: 'Regulation tennis ball (diameter 6.7 cm)',
    lengthCm: 6.7,
    widthCm: 6.7,
    heightCm: 6.7,
    isCurved: true,
  },
];

/**
 * Calculates isoperimetric circularity quotient Q = 4 * PI * Area / (Perimeter^2).
 * Perfect circle = 1.0, square = 0.785, 2:1 rectangle = 0.698.
 */
export function calculateCircularity(area: number, perimeter: number): number {
  if (perimeter <= 0 || area <= 0) return 0;
  return Math.min(1, Math.max(0, (4 * Math.PI * area) / (perimeter * perimeter)));
}

/**
 * Identifies the geometric shape and computes full physical dimensions.
 */
export function identifyShapeAndComputeMetrics(input: ShapeRecognitionInput): ShapeRecognitionResult {
  const l = Math.max(0.001, input.lengthMeters);
  const w = Math.max(0.001, input.widthMeters);
  const rawH = input.heightMeters ?? 0;
  const isPlanar = input.isPlanar || rawH < 0.015;
  const h = isPlanar ? 0.001 : rawH;

  const longEdge = Math.max(l, w);
  const shortEdge = Math.min(l, w);
  const aspectRatio = longEdge / shortEdge;

  // Circularity assessment
  const isRound = input.circularity != null ? input.circularity >= 0.82 : Boolean(input.isCurved && aspectRatio <= 1.25);

  let shape: MeasurementShape;
  let shapeCategory: '2d_planar' | '3d_volumetric';
  let confidence: number;
  let rationale: string;
  let radiusMeters: number | undefined;
  let diameterMeters: number | undefined;
  let perimeterMeters: number;
  let basePerimeterMeters: number;
  let baseAreaSquareMeters: number;
  let surfaceAreaSquareMeters: number;
  let areaSquareMeters: number;
  let volumeCubicMeters: number;

  if (isRound) {
    // Circular / Cylindrical / Spherical family
    const avgDiameter = (l + w) / 2;
    const r = avgDiameter / 2;
    radiusMeters = r;
    diameterMeters = avgDiameter;
    const baseCircumference = 2 * Math.PI * r;
    const baseArea = Math.PI * r * r;

    if (isPlanar) {
      shape = 'circle';
      shapeCategory = '2d_planar';
      confidence = 0.96;
      rationale = `High radial symmetry (aspect ratio ${aspectRatio.toFixed(2)}) with planar profile classified as Circle.`;
      perimeterMeters = baseCircumference;
      basePerimeterMeters = baseCircumference;
      baseAreaSquareMeters = baseArea;
      surfaceAreaSquareMeters = baseArea;
      areaSquareMeters = baseArea;
      volumeCubicMeters = baseArea * h;
    } else {
      // 3D curved solid: check if spherical or cylindrical
      const heightRatio = Math.abs(h - avgDiameter) / avgDiameter;
      if (heightRatio <= 0.12 && input.isCurved) {
        shape = 'sphere';
        shapeCategory = '3d_volumetric';
        confidence = 0.94;
        rationale = `Uniform 3D radial extent across all axes (diameter ~ ${(avgDiameter * 100).toFixed(1)} cm) classified as Sphere.`;
        perimeterMeters = baseCircumference; // Great circle circumference
        basePerimeterMeters = baseCircumference;
        baseAreaSquareMeters = baseArea;
        surfaceAreaSquareMeters = 4 * Math.PI * r * r;
        areaSquareMeters = surfaceAreaSquareMeters;
        volumeCubicMeters = (4 / 3) * Math.PI * Math.pow(r, 3);
      } else {
        shape = 'cylinder';
        shapeCategory = '3d_volumetric';
        confidence = 0.97;
        rationale = `Circular cross-section (radius ${(r * 100).toFixed(1)} cm) extruded with height ${(h * 100).toFixed(1)} cm classified as Cylinder.`;
        perimeterMeters = baseCircumference;
        basePerimeterMeters = baseCircumference;
        baseAreaSquareMeters = baseArea;
        const lateralArea = 2 * Math.PI * r * h;
        surfaceAreaSquareMeters = 2 * baseArea + lateralArea;
        areaSquareMeters = surfaceAreaSquareMeters;
        volumeCubicMeters = baseArea * h;
      }
    }
  } else {
    // Orthogonal / Box / Rectangle / Square family
    const isSquareRatio = aspectRatio >= 0.92 && aspectRatio <= 1.08;

    if (isPlanar) {
      if (isSquareRatio) {
        shape = 'square';
        shapeCategory = '2d_planar';
        confidence = 0.98;
        const side = (longEdge + shortEdge) / 2;
        rationale = `Equal orthogonal sides (aspect ratio ${aspectRatio.toFixed(2)}) without depth classified as Square.`;
        perimeterMeters = 4 * side;
        basePerimeterMeters = perimeterMeters;
        baseAreaSquareMeters = side * side;
        surfaceAreaSquareMeters = baseAreaSquareMeters;
        areaSquareMeters = baseAreaSquareMeters;
        volumeCubicMeters = side * side * h;
      } else {
        shape = 'rectangle';
        shapeCategory = '2d_planar';
        confidence = 0.97;
        rationale = `Right-angled polygon with length-to-width ratio ${aspectRatio.toFixed(2)} classified as Rectangle.`;
        perimeterMeters = 2 * (l + w);
        basePerimeterMeters = perimeterMeters;
        baseAreaSquareMeters = l * w;
        surfaceAreaSquareMeters = baseAreaSquareMeters;
        areaSquareMeters = baseAreaSquareMeters;
        volumeCubicMeters = l * w * h;
      }
    } else {
      // 3D Cuboid / Box
      shape = 'cuboid';
      shapeCategory = '3d_volumetric';
      confidence = 0.95;
      const isCube = isSquareRatio && Math.abs(h - longEdge) / longEdge <= 0.12;
      rationale = isCube
        ? `Equal orthogonal bounds (${(l * 100).toFixed(1)} × ${(w * 100).toFixed(1)} × ${(h * 100).toFixed(1)} cm) classified as Cube.`
        : `Rectangular box geometry with height ${(h * 100).toFixed(1)} cm classified as Cuboid / Box.`;
      basePerimeterMeters = 2 * (l + w);
      perimeterMeters = basePerimeterMeters;
      baseAreaSquareMeters = l * w;
      surfaceAreaSquareMeters = 2 * (l * w + l * h + w * h);
      areaSquareMeters = surfaceAreaSquareMeters;
      volumeCubicMeters = l * w * h;
    }
  }

  const dimensions: MeasurementDimensions = {
    lengthMeters: l,
    widthMeters: w,
    heightMeters: isPlanar ? 0 : h,
    unit: 'meter',
    radiusMeters,
    diameterMeters,
    perimeterMeters,
    basePerimeterMeters,
    baseAreaSquareMeters,
    surfaceAreaSquareMeters,
    areaSquareMeters,
  };

  const assumptions = [
    `Automatically identified as ${shapeLabels[shape]} with ${Math.round(confidence * 100)}% geometric confidence.`,
    isPlanar
      ? 'Planar object scanned on flat surface; zero solid volume assumed.'
      : '3D solid exterior estimated; interior assumed solid without uncaptured hollows.',
    `Derived metrics: Perimeter = ${(perimeterMeters * 100).toFixed(2)} cm, Base Area = ${(baseAreaSquareMeters * 10000).toFixed(2)} cm².`,
  ];

  return {
    shape,
    shapeLabel: shapeLabels[shape],
    shapeCategory,
    confidence,
    dimensions,
    volumeCubicMeters: Math.max(0.000001, volumeCubicMeters),
    formula: formulas[shape],
    rationale,
    assumptions,
  };
}

/**
 * Creates a persisted Measurement object from an automated shape recognition result.
 */
export function createMeasurementFromShapeResult(
  result: ShapeRecognitionResult,
  capabilities: DeviceCapabilities,
  method: Measurement['method'] = 'camera',
): Measurement {
  return {
    id: `scan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    measuredAt: new Date().toISOString(),
    shape: result.shape,
    objectType: result.shape === 'cuboid' ? 'box' : 'object',
    method,
    deviceCapabilities: capabilities,
    measurementUnit: 'meter',
    dimensions: result.dimensions,
    volume: {
      unit: 'cubic_meter',
      valueCubicMeters: result.volumeCubicMeters,
    },
    status: 'completed',
    confidence: {
      score: result.confidence,
      level: result.confidence >= 0.8 ? 'high' : 'medium',
      factors: result.assumptions,
    },
    detectedShapeConfidence: result.confidence,
    identifiedShapeLabel: result.shapeLabel,
    shapeCategory: result.shapeCategory,
    model: {
      assumptions: result.assumptions,
      source: 'reference_photo',
      formula: result.formula,
    },
  };
}
