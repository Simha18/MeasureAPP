import type { MeasurementDimensions, MeasurementShape, WorldPoint3D } from '../types';

export type Point2 = { x: number; y: number };
export type RegularShape = Exclude<MeasurementShape, 'polygon_prism' | 'sectioned'>;
export const shapeLabels: Record<MeasurementShape, string> = {
  square: 'Square',
  rectangle: 'Rectangle',
  circle: 'Circle',
  cuboid: 'Box / Cuboid',
  cylinder: 'Cylinder',
  sphere: 'Sphere',
  cone: 'Cone',
  ellipsoid: 'Ellipsoid',
  polygon_prism: 'Outline + height',
  sectioned: 'Irregular / cross-sections',
  polygon: 'Polygon / Irregular',
};
export const dimensionLabels: Record<RegularShape, string[]> = {
  square: ['Side'],
  rectangle: ['Length', 'Width'],
  circle: ['Diameter'],
  cuboid: ['Length', 'Width', 'Height'],
  cylinder: ['Diameter', 'Height'],
  sphere: ['Diameter'],
  cone: ['Base diameter', 'Height'],
  ellipsoid: ['Length (full axis)', 'Width (full axis)', 'Height (full axis)'],
  polygon: ['Perimeter', 'Area'],
};
export const formulas: Record<MeasurementShape, string> = {
  square: 'Perimeter = 4 × side, Area = side²',
  rectangle: 'Perimeter = 2 × (length + width), Area = length × width',
  circle: 'Circumference = 2 × π × radius, Area = π × radius²',
  cuboid: 'V = length × width × height, Area = 2 × (lw + lh + wh)',
  cylinder: 'V = π × radius² × height, Base Area = π × radius²',
  sphere: 'V = 4/3 × π × radius³, Area = 4 × π × radius²',
  cone: 'V = π × (diameter / 2)² × height / 3',
  ellipsoid: 'V = π × length × width × height / 6',
  polygon_prism: 'V = traced base area × perpendicular height',
  sectioned: 'V ≈ Σ (lower area + upper area) × layer height / 2',
  polygon: 'Area = Shoelace contour area, Perimeter = sum of segment lengths',
};

export function positive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a positive, finite number.`);
  return value;
}

export function regularGeometry(shape: RegularShape, values: number[]) {
  if (values.length !== dimensionLabels[shape].length) throw new Error('Measure every required dimension.');
  values.forEach((value, i) => positive(value, dimensionLabels[shape][i]));

  if (shape === 'square') {
    const s = values[0];
    const perimeterMeters = 4 * s;
    const areaSquareMeters = s * s;
    const dimensions: MeasurementDimensions = {
      lengthMeters: s,
      widthMeters: s,
      heightMeters: 0.001,
      unit: 'meter',
      perimeterMeters,
      areaSquareMeters,
      basePerimeterMeters: perimeterMeters,
      baseAreaSquareMeters: areaSquareMeters,
    };
    return { dimensions, volume: positive(s * s * 0.001, 'Volume') };
  }

  if (shape === 'rectangle') {
    const [l, w] = values;
    const perimeterMeters = 2 * (l + w);
    const areaSquareMeters = l * w;
    const dimensions: MeasurementDimensions = {
      lengthMeters: l,
      widthMeters: w,
      heightMeters: 0.001,
      unit: 'meter',
      perimeterMeters,
      areaSquareMeters,
      basePerimeterMeters: perimeterMeters,
      baseAreaSquareMeters: areaSquareMeters,
    };
    return { dimensions, volume: positive(l * w * 0.001, 'Volume') };
  }

  if (shape === 'circle') {
    const d = values[0];
    const r = d / 2;
    const perimeterMeters = Math.PI * d;
    const areaSquareMeters = Math.PI * r * r;
    const dimensions: MeasurementDimensions = {
      lengthMeters: d,
      widthMeters: d,
      heightMeters: 0.001,
      unit: 'meter',
      radiusMeters: r,
      diameterMeters: d,
      perimeterMeters,
      areaSquareMeters,
      basePerimeterMeters: perimeterMeters,
      baseAreaSquareMeters: areaSquareMeters,
    };
    return { dimensions, volume: positive(areaSquareMeters * 0.001, 'Volume') };
  }

  if (shape === 'polygon') {
    const [p, a] = values;
    const side = p / 4;
    const dimensions: MeasurementDimensions = {
      lengthMeters: side,
      widthMeters: side,
      heightMeters: 0.001,
      unit: 'meter',
      perimeterMeters: p,
      areaSquareMeters: a,
      basePerimeterMeters: p,
      baseAreaSquareMeters: a,
    };
    return { dimensions, volume: positive(a * 0.001, 'Volume') };
  }

  const [a, b, c] = values;
  const lengthMeters = a;
  const widthMeters = shape === 'cuboid' || shape === 'ellipsoid' ? b : a;
  const heightMeters = shape === 'sphere' ? a : shape === 'cuboid' || shape === 'ellipsoid' ? c : b;

  let radiusMeters: number | undefined;
  let diameterMeters: number | undefined;
  let perimeterMeters: number | undefined;
  let basePerimeterMeters: number | undefined;
  let baseAreaSquareMeters: number | undefined;
  let surfaceAreaSquareMeters: number | undefined;
  let areaSquareMeters: number | undefined;

  if (shape === 'cylinder') {
    diameterMeters = a;
    radiusMeters = a / 2;
    basePerimeterMeters = Math.PI * diameterMeters;
    perimeterMeters = basePerimeterMeters;
    baseAreaSquareMeters = Math.PI * radiusMeters ** 2;
    surfaceAreaSquareMeters = 2 * Math.PI * radiusMeters * (radiusMeters + heightMeters);
    areaSquareMeters = surfaceAreaSquareMeters;
  } else if (shape === 'cuboid') {
    basePerimeterMeters = 2 * (lengthMeters + widthMeters);
    perimeterMeters = basePerimeterMeters;
    baseAreaSquareMeters = lengthMeters * widthMeters;
    surfaceAreaSquareMeters = 2 * (lengthMeters * widthMeters + lengthMeters * heightMeters + widthMeters * heightMeters);
    areaSquareMeters = surfaceAreaSquareMeters;
  } else if (shape === 'sphere') {
    diameterMeters = a;
    radiusMeters = a / 2;
    perimeterMeters = Math.PI * diameterMeters;
    surfaceAreaSquareMeters = 4 * Math.PI * radiusMeters ** 2;
    areaSquareMeters = surfaceAreaSquareMeters;
  } else if (shape === 'cone') {
    diameterMeters = a;
    radiusMeters = a / 2;
    basePerimeterMeters = Math.PI * diameterMeters;
    perimeterMeters = basePerimeterMeters;
    baseAreaSquareMeters = Math.PI * radiusMeters ** 2;
    const slant = Math.hypot(radiusMeters, heightMeters);
    surfaceAreaSquareMeters = Math.PI * radiusMeters * (radiusMeters + slant);
    areaSquareMeters = surfaceAreaSquareMeters;
  }

  const dimensions: MeasurementDimensions = {
    lengthMeters,
    widthMeters,
    heightMeters,
    unit: 'meter',
    radiusMeters,
    diameterMeters,
    perimeterMeters,
    basePerimeterMeters,
    baseAreaSquareMeters,
    surfaceAreaSquareMeters,
    areaSquareMeters,
  };
  const boxVolume = lengthMeters * widthMeters * heightMeters;
  const factor = shape === 'cuboid' ? 1 : shape === 'cylinder' ? Math.PI / 4 : shape === 'cone' ? Math.PI / 12 : Math.PI / 6;
  return { dimensions, volume: positive(boxVolume * factor, 'Volume') };
}

export function distance(a: WorldPoint3D, b: WorldPoint3D) {
  return Math.hypot(a.xMeters - b.xMeters, a.yMeters - b.yMeters, a.zMeters - b.zMeters);
}

export function regularArGeometry(shape: RegularShape, points: WorldPoint3D[]) {
  const count = dimensionLabels[shape].length;
  if (points.length !== count * 2) throw new Error('Capture two endpoints for every dimension.');
  const values = Array.from({ length: count }, (_, i) => distance(points[2 * i], points[2 * i + 1]));
  if (values.some(value => !Number.isFinite(value) || value < 0.005)) {
    throw new Error('A dimension is too small or has lost tracking. Capture distinct endpoints at least 5 mm apart.');
  }
  const vectors = values.map((_, i) => {
    const a = points[2 * i], b = points[2 * i + 1];
    return [b.xMeters - a.xMeters, b.yMeters - a.yMeters, b.zMeters - a.zMeters];
  });
  for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) {
    const dot = vectors[i].reduce((sum, v, k) => sum + v * vectors[j][k], 0);
    if (Math.abs(dot) / (values[i] * values[j]) > 0.5) {
      const firstLabel = dimensionLabels[shape][i];
      const secondLabel = dimensionLabels[shape][j];
      throw new Error(
        `${firstLabel} and ${secondLabel} are too close in direction to represent perpendicular dimensions. ` +
          `Undo the ${secondLabel.toLowerCase()} points and capture that dimension along a different edge.`,
      );
    }
  }
  return regularGeometry(shape, values);
}

const cross = (a: Point2, b: Point2, c: Point2) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function onSegment(a: Point2, b: Point2, p: Point2) {
  return Math.abs(cross(a, b, p)) < 1e-9 && p.x >= Math.min(a.x, b.x) - 1e-9 &&
    p.x <= Math.max(a.x, b.x) + 1e-9 && p.y >= Math.min(a.y, b.y) - 1e-9 && p.y <= Math.max(a.y, b.y) + 1e-9;
}
function intersects(a: Point2, b: Point2, c: Point2, d: Point2) {
  return (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) ||
    onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}

/** Concave simple outlines are supported; holes, crossing and duplicate edges are rejected. */
export function polygonArea(points: Point2[]) {
  if (points.length < 3 || points.length > 64) throw new Error('Capture between 3 and 64 outline points.');
  points.forEach((p, i) => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error('Invalid outline point.');
    if (points.some((q, j) => j !== i && Math.hypot(p.x - q.x, p.y - q.y) < 0.005)) {
      throw new Error('Outline points are too close. Close the outline with the button instead of repeating the first point.');
    }
    const previous = points[(i + points.length - 1) % points.length];
    const next = points[(i + 1) % points.length];
    if (Math.abs(cross(previous, p, next)) < 1e-9 &&
      (previous.x - p.x) * (next.x - p.x) + (previous.y - p.y) * (next.y - p.y) > 0) {
      throw new Error('An outline edge doubles back. Undo the last point.');
    }
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      if (intersects(p, points[(i + 1) % points.length], points[j], points[(j + 1) % points.length])) {
        throw new Error('Outline edges cross. Capture points in order around the object.');
      }
    }
  });
  // Shift the origin to reduce cancellation for large world coordinates.
  const origin = points[0];
  const area = Math.abs(points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length];
    return sum + (p.x - origin.x) * (q.y - origin.y) - (q.x - origin.x) * (p.y - origin.y);
  }, 0)) / 2;
  if (area < 0.000025) throw new Error('The outline has no reliable area. Capture a wider, non-collinear outline.');
  return area;
}

export function horizontalSection(points: WorldPoint3D[]) {
  if (!points.length || points.some(p => !Number.isFinite(p.yMeters))) throw new Error('Invalid section height.');
  const ys = points.map(p => p.yMeters);
  // Absolute tolerance: large objects must not silently admit sloped sections.
  if (Math.max(...ys) - Math.min(...ys) > 0.03) throw new Error('Keep every point in this outline at the same height (within 3 cm).');
  return { area: polygonArea(points.map(p => ({ x: p.xMeters, y: p.zMeters }))),
    elevation: ys.reduce((a, b) => a + b, 0) / ys.length };
}

function bounds(points: WorldPoint3D[]): MeasurementDimensions {
  const extent = (key: keyof WorldPoint3D) => Math.max(...points.map(p => p[key])) - Math.min(...points.map(p => p[key]));
  return { lengthMeters: extent('xMeters'), widthMeters: extent('zMeters'), heightMeters: extent('yMeters'), unit: 'meter' };
}

export function prismGeometry(base: WorldPoint3D[], height: number) {
  positive(height, 'Height');
  const section = horizontalSection(base);
  const flatBase = base.map(p => ({ ...p, yMeters: section.elevation }));
  const top = flatBase.map(p => ({ ...p, yMeters: p.yMeters + height }));
  const basePerimeter = flatBase.reduce((sum, p, i) => {
    const q = flatBase[(i + 1) % flatBase.length];
    return sum + Math.hypot(p.xMeters - q.xMeters, p.zMeters - q.zMeters);
  }, 0);
  const dim = bounds([...flatBase, ...top]);
  dim.baseAreaSquareMeters = section.area;
  dim.basePerimeterMeters = basePerimeter;
  dim.perimeterMeters = basePerimeter;
  dim.surfaceAreaSquareMeters = section.area * 2 + basePerimeter * height;
  dim.areaSquareMeters = dim.surfaceAreaSquareMeters;
  return { dimensions: dim, volume: positive(section.area * height, 'Volume'), sections: [flatBase, top] };
}

export function sectionedGeometry(sections: WorldPoint3D[][]) {
  if (sections.length < 2 || sections.length > 16) throw new Error('Capture 2 to 16 horizontal outlines, from the bottom to the top.');
  const profiles = sections.map(horizontalSection);
  let volume = 0;
  for (let i = 1; i < profiles.length; i++) {
    const height = profiles[i].elevation - profiles[i - 1].elevation;
    if (height < 0.03) throw new Error('Each outline must be at least 3 cm above the previous one.');
    volume += height * (profiles[i].area + profiles[i - 1].area) / 2;
  }
  return { dimensions: bounds(sections.flat()), volume: positive(volume, 'Volume'), sections };
}

/** Points use the displayed photo's normalized coordinates, preserving its aspect ratio. */
export function referenceDistance(points: Point2[], aspectRatio: number, referenceMeters: number) {
  positive(referenceMeters, 'Reference length');
  positive(aspectRatio, 'Photo aspect ratio');
  if (points.length !== 4 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) {
    throw new Error('Mark two reference endpoints, then two object endpoints on the photo.');
  }
  const span = (a: Point2, b: Point2) => Math.hypot((a.x - b.x) * aspectRatio, a.y - b.y);
  const reference = span(points[0], points[1]);
  const object = span(points[2], points[3]);
  if (reference < 0.05 || object < 0.02) throw new Error('Endpoints are too close. Retake closer so the reference and object fill more of the photo.');
  return positive(referenceMeters * object / reference, 'Measured length');
}
