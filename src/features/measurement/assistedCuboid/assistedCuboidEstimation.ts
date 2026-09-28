import {
  clamp01,
  normalizeBoundingBox,
  normalizedPointToPixels,
  type NormalizedBoundingBox,
  type ObjectKeypoint,
  type PixelPoint2D,
} from '../../geometry';

import { calculateCuboidVolume, createCuboidDimensions } from '../measurementService';
import type { MeasurementConfidence, WorldPoint3D } from '../types';
import type { NativePointQuality, TrackingState } from '../native/types';

export type AssistedCuboidDetectionInput = {
  boundingBox?: NormalizedBoundingBox;
  confidence: number;
  id: string;
  keypoints?: ObjectKeypoint[];
};

export type AssistedCuboidCornerRole =
  | 'front_top_left'
  | 'front_top_right'
  | 'front_bottom_left'
  | 'front_bottom_right'
  | 'back_top_left'
  | 'back_top_right'
  | 'back_bottom_left'
  | 'back_bottom_right';

export type AssistedCuboidCornerScreenPoint = {
  detectionConfidence?: number;
  inferred?: boolean;
  role: AssistedCuboidCornerRole;
  screenPoint: PixelPoint2D;
};

export type AssistedCuboidCornerCandidate = AssistedCuboidCornerScreenPoint & {
  pointQuality?: NativePointQuality;
  worldPoint: WorldPoint3D;
};

export type AssistedCuboidDimensionsMeters = {
  heightMeters: number;
  lengthMeters: number;
  widthMeters: number;
};

export type AssistedCuboidGeometryValidation = {
  isValid: boolean;
  parallelScore?: number;
  reasons: string[];
  rightAngleScore?: number;
  score: number;
};

export type AssistedCuboidObservation = {
  candidates: AssistedCuboidCornerCandidate[];
  detectionConfidence: number;
  detectionId: string;
  dimensions?: AssistedCuboidDimensionsMeters;
  geometry: AssistedCuboidGeometryValidation;
  id: string;
  inferredCandidateCount: number;
  observedAt: string;
  pointQualityScore?: number;
  projectedCandidateCount: number;
  trackingState: TrackingState['status'];
};

export type AssistedCuboidEstimateStatus =
  | 'idle'
  | 'collecting'
  | 'ready'
  | 'insufficient_confidence';

export type AssistedCuboidEstimate = {
  acceptedObservationCount: number;
  confidence: MeasurementConfidence;
  dimensions?: AssistedCuboidDimensionsMeters;
  rejectedObservationCount: number;
  reasons: string[];
  requiredObservationCount: number;
  scanProgress: number;
  status: AssistedCuboidEstimateStatus;
  volumeCubicMeters?: number;
};

export type AssistedCuboidEstimationOptions = {
  maxDimensionSpreadRatio?: number;
  minDetectionConfidence?: number;
  minimumProjectedCandidates?: number;
  minimumAcceptedObservations?: number;
};

type WorldVector3D = {
  x: number;
  y: number;
  z: number;
};

const defaultOptions: Required<AssistedCuboidEstimationOptions> = {
  maxDimensionSpreadRatio: 0.12,
  minDetectionConfidence: 0.55,
  minimumProjectedCandidates: 6,
  minimumAcceptedObservations: 3,
};

const cornerRoleAliases: Record<AssistedCuboidCornerRole, string[]> = {
  back_bottom_left: ['back_bottom_left', 'rear_bottom_left'],
  back_bottom_right: ['back_bottom_right', 'rear_bottom_right'],
  back_top_left: ['back_top_left', 'rear_top_left'],
  back_top_right: ['back_top_right', 'rear_top_right'],
  front_bottom_left: ['front_bottom_left', 'bottom_left'],
  front_bottom_right: ['front_bottom_right', 'bottom_right'],
  front_top_left: ['front_top_left', 'top_left'],
  front_top_right: ['front_top_right', 'top_right'],
};

const lengthPairs: [AssistedCuboidCornerRole, AssistedCuboidCornerRole][] = [
  ['front_top_left', 'front_top_right'],
  ['front_bottom_left', 'front_bottom_right'],
  ['back_top_left', 'back_top_right'],
  ['back_bottom_left', 'back_bottom_right'],
];

const widthPairs: [AssistedCuboidCornerRole, AssistedCuboidCornerRole][] = [
  ['front_top_left', 'back_top_left'],
  ['front_top_right', 'back_top_right'],
  ['front_bottom_left', 'back_bottom_left'],
  ['front_bottom_right', 'back_bottom_right'],
];

const heightPairs: [AssistedCuboidCornerRole, AssistedCuboidCornerRole][] = [
  ['front_bottom_left', 'front_top_left'],
  ['front_bottom_right', 'front_top_right'],
  ['back_bottom_left', 'back_top_left'],
  ['back_bottom_right', 'back_top_right'],
];

export function getAssistedCuboidCornerScreenPoints(
  detection: AssistedCuboidDetectionInput,
  frameSize: { height: number; width: number },
): AssistedCuboidCornerScreenPoint[] {
  const keypoints = detection.keypoints ?? [];
  const semanticPoints = Object.entries(cornerRoleAliases).flatMap(([role, aliases]) => {
    const keypoint = keypoints.find((item) => aliases.includes(item.id));

    if (!keypoint) {
      return [];
    }

    return [
      {
        detectionConfidence: keypoint.confidence ?? detection.confidence,
        role: role as AssistedCuboidCornerRole,
        screenPoint: normalizedPointToPixels(keypoint, frameSize),
      },
    ];
  });
  const semanticRoles = new Set(semanticPoints.map((point) => point.role));
  const hasPrimaryCuboidAxes =
    semanticRoles.has('front_bottom_left') &&
    semanticRoles.has('front_bottom_right') &&
    semanticRoles.has('back_bottom_left') &&
    semanticRoles.has('front_top_left');

  if (hasPrimaryCuboidAxes) {
    return semanticPoints;
  }

  const inferredFacePoints = inferCuboidScreenPointsFromVisibleFace(detection, frameSize);
  const mergedPoints = new Map<AssistedCuboidCornerRole, AssistedCuboidCornerScreenPoint>();

  inferredFacePoints.forEach((point) => {
    mergedPoints.set(point.role, point);
  });
  semanticPoints.forEach((point) => {
    mergedPoints.set(point.role, point);
  });

  return [...mergedPoints.values()];
}

export function createAssistedCuboidObservation(input: {
  candidates: AssistedCuboidCornerCandidate[];
  detectionConfidence: number;
  detectionId: string;
  observedAt?: string;
  trackingState: TrackingState['status'];
}): AssistedCuboidObservation {
  const geometryFit = fitCuboidGeometry(input.candidates);
  const detectionConfidence =
    averageFinite([input.detectionConfidence, ...input.candidates.map((candidate) => candidate.detectionConfidence)]) ??
    input.detectionConfidence;

  return {
    candidates: input.candidates,
    detectionConfidence,
    detectionId: input.detectionId,
    dimensions: geometryFit.dimensions,
    geometry: geometryFit.geometry,
    id: `${input.detectionId}-${input.observedAt ?? Date.now()}`,
    inferredCandidateCount: input.candidates.filter((candidate) => candidate.inferred).length,
    observedAt: input.observedAt ?? new Date().toISOString(),
    pointQualityScore: averageFinite(
      input.candidates.map((candidate) => candidate.pointQuality?.measurementConfidence),
    ),
    projectedCandidateCount: input.candidates.length,
    trackingState: input.trackingState,
  };
}

function inferCuboidScreenPointsFromVisibleFace(
  detection: AssistedCuboidDetectionInput,
  frameSize: { height: number; width: number },
): AssistedCuboidCornerScreenPoint[] {
  const visibleFace = getVisibleFaceKeypoints(detection);

  if (!visibleFace) {
    return [];
  }

  const depthOffset = estimateRearFaceOffset(visibleFace, detection.boundingBox);
  const rearConfidence = detection.confidence * 0.62;
  const points: Record<AssistedCuboidCornerRole, { confidence: number; inferred?: boolean; x: number; y: number }> = {
    back_bottom_left: {
      confidence: rearConfidence,
      inferred: true,
      x: clamp01(visibleFace.bottomLeft.x + depthOffset.x),
      y: clamp01(visibleFace.bottomLeft.y + depthOffset.y),
    },
    back_bottom_right: {
      confidence: rearConfidence,
      inferred: true,
      x: clamp01(visibleFace.bottomRight.x + depthOffset.x),
      y: clamp01(visibleFace.bottomRight.y + depthOffset.y),
    },
    back_top_left: {
      confidence: rearConfidence,
      inferred: true,
      x: clamp01(visibleFace.topLeft.x + depthOffset.x),
      y: clamp01(visibleFace.topLeft.y + depthOffset.y),
    },
    back_top_right: {
      confidence: rearConfidence,
      inferred: true,
      x: clamp01(visibleFace.topRight.x + depthOffset.x),
      y: clamp01(visibleFace.topRight.y + depthOffset.y),
    },
    front_bottom_left: {
      confidence: visibleFace.bottomLeft.confidence ?? detection.confidence,
      x: visibleFace.bottomLeft.x,
      y: visibleFace.bottomLeft.y,
    },
    front_bottom_right: {
      confidence: visibleFace.bottomRight.confidence ?? detection.confidence,
      x: visibleFace.bottomRight.x,
      y: visibleFace.bottomRight.y,
    },
    front_top_left: {
      confidence: visibleFace.topLeft.confidence ?? detection.confidence,
      x: visibleFace.topLeft.x,
      y: visibleFace.topLeft.y,
    },
    front_top_right: {
      confidence: visibleFace.topRight.confidence ?? detection.confidence,
      x: visibleFace.topRight.x,
      y: visibleFace.topRight.y,
    },
  };

  return Object.entries(points).map(([role, point]) => ({
    detectionConfidence: point.confidence,
    inferred: point.inferred,
    role: role as AssistedCuboidCornerRole,
    screenPoint: normalizedPointToPixels(point, frameSize),
  }));
}

function getVisibleFaceKeypoints(detection: AssistedCuboidDetectionInput) {
  const keypointMap = new Map((detection.keypoints ?? []).map((keypoint) => [keypoint.id, keypoint]));
  const boundingBox = detection.boundingBox ? normalizeBoundingBox(detection.boundingBox) : undefined;
  const topLeft = keypointMap.get('top_left') ?? keypointMap.get('front_top_left') ?? getBoxCorner(boundingBox, 'top_left');
  const topRight =
    keypointMap.get('top_right') ?? keypointMap.get('front_top_right') ?? getBoxCorner(boundingBox, 'top_right');
  const bottomLeft =
    keypointMap.get('bottom_left') ?? keypointMap.get('front_bottom_left') ?? getBoxCorner(boundingBox, 'bottom_left');
  const bottomRight =
    keypointMap.get('bottom_right') ??
    keypointMap.get('front_bottom_right') ??
    getBoxCorner(boundingBox, 'bottom_right');

  if (!topLeft || !topRight || !bottomLeft || !bottomRight) {
    return undefined;
  }

  return {
    bottomLeft,
    bottomRight,
    topLeft,
    topRight,
  };
}

function getBoxCorner(
  box: NormalizedBoundingBox | undefined,
  corner: 'bottom_left' | 'bottom_right' | 'top_left' | 'top_right',
): ObjectKeypoint | undefined {
  if (!box) {
    return undefined;
  }

  const right = box.x + box.width;
  const bottom = box.y + box.height;

  switch (corner) {
    case 'bottom_left':
      return { id: corner, x: box.x, y: bottom };
    case 'bottom_right':
      return { id: corner, x: right, y: bottom };
    case 'top_right':
      return { id: corner, x: right, y: box.y };
    case 'top_left':
    default:
      return { id: corner, x: box.x, y: box.y };
  }
}

function estimateRearFaceOffset(
  face: {
    bottomLeft: ObjectKeypoint;
    bottomRight: ObjectKeypoint;
    topLeft: ObjectKeypoint;
    topRight: ObjectKeypoint;
  },
  boundingBox?: NormalizedBoundingBox,
) {
  const box = boundingBox ? normalizeBoundingBox(boundingBox) : undefined;
  const faceWidth = distance2D(face.topLeft, face.topRight);
  const faceHeight = distance2D(face.topLeft, face.bottomLeft);
  const horizontalDirection = (face.topLeft.x + face.topRight.x + face.bottomLeft.x + face.bottomRight.x) / 4 < 0.5 ? 1 : -1;
  const xOffset = horizontalDirection * Math.max(0.04, Math.min(0.18, (box?.width ?? faceWidth) * 0.16));
  const yOffset = -Math.max(0.035, Math.min(0.16, (box?.height ?? faceHeight) * 0.16));

  return {
    x: xOffset,
    y: yOffset,
  };
}

function distance2D(firstPoint: { x: number; y: number }, secondPoint: { x: number; y: number }) {
  const dx = firstPoint.x - secondPoint.x;
  const dy = firstPoint.y - secondPoint.y;

  return Math.sqrt(dx * dx + dy * dy);
}

export function estimateAssistedCuboidFromObservations(
  observations: AssistedCuboidObservation[],
  options: AssistedCuboidEstimationOptions = {},
): AssistedCuboidEstimate {
  const resolvedOptions = { ...defaultOptions, ...options };
  const rejectedReasons: string[] = [];
  const acceptedObservations = observations.filter((observation) => {
    const isAccepted =
      observation.trackingState === 'tracking' &&
      observation.detectionConfidence >= resolvedOptions.minDetectionConfidence &&
      observation.projectedCandidateCount >= resolvedOptions.minimumProjectedCandidates &&
      observation.geometry.isValid &&
      Boolean(observation.dimensions);

    if (!isAccepted) {
      rejectedReasons.push(...getObservationRejectionReasons(observation, resolvedOptions));
    }

    return isAccepted;
  });

  const scanProgress = Math.min(1, acceptedObservations.length / resolvedOptions.minimumAcceptedObservations);
  const baseEstimate = createBaseEstimate({
    acceptedObservationCount: acceptedObservations.length,
    rejectedObservationCount: observations.length - acceptedObservations.length,
    requiredObservationCount: resolvedOptions.minimumAcceptedObservations,
    scanProgress,
  });

  if (acceptedObservations.length < resolvedOptions.minimumAcceptedObservations) {
    return {
      ...baseEstimate,
      confidence: {
        factors: ['Collecting repeated cuboid observations', ...unique(rejectedReasons)],
        level: 'low',
        score: Math.min(0.45, scanProgress * 0.45),
      },
      reasons: ['Move slowly around the box until more stable corner observations are available.'],
      status: observations.length === 0 ? 'idle' : 'collecting',
    };
  }

  const dimensions = getRobustDimensions(acceptedObservations);
  const dimensionStabilityScore = calculateDimensionStabilityScore(
    acceptedObservations,
    dimensions,
    resolvedOptions.maxDimensionSpreadRatio,
  );

  if (!dimensions || dimensionStabilityScore < 0.55) {
    return {
      ...baseEstimate,
      confidence: {
        factors: ['Repeated cuboid observations are not geometrically stable'],
        level: 'low',
        score: Math.max(0.2, dimensionStabilityScore * 0.55),
      },
      reasons: ['Continue scanning from a slow, steady angle or switch to Manual Mode.'],
      status: 'insufficient_confidence',
    };
  }

  const averageGeometryScore = averageFinite(acceptedObservations.map((observation) => observation.geometry.score)) ?? 0;
  const averageDetectionConfidence =
    averageFinite(acceptedObservations.map((observation) => observation.detectionConfidence)) ?? 0;
  const averagePointQuality = averageFinite(acceptedObservations.map((observation) => observation.pointQualityScore)) ?? 0.5;
  const countScore = Math.min(1, acceptedObservations.length / 6);
  const confidenceScore = Math.min(
    1,
    Math.max(
      0,
      averageDetectionConfidence * 0.22 +
        averageGeometryScore * 0.3 +
        dimensionStabilityScore * 0.28 +
        averagePointQuality * 0.12 +
        countScore * 0.08,
    ),
  );

  if (confidenceScore < 0.58) {
    return {
      ...baseEstimate,
      confidence: {
        factors: [
          `Detection confidence ${formatPercent(averageDetectionConfidence)}`,
          `Geometry score ${formatPercent(averageGeometryScore)}`,
          `Dimension stability ${formatPercent(dimensionStabilityScore)}`,
        ],
        level: 'low',
        score: confidenceScore,
      },
      reasons: ['Assisted cuboid fit is not confident enough. Continue scanning or switch to Manual Mode.'],
      status: 'insufficient_confidence',
    };
  }

  const cuboidDimensions = createCuboidDimensions(
    dimensions.lengthMeters,
    dimensions.widthMeters,
    dimensions.heightMeters,
    'meter',
  );

  return {
    ...baseEstimate,
    confidence: {
      factors: [
        'Assisted cuboid corner estimation',
        `${acceptedObservations.length} accepted AR/depth observations`,
        `Geometry score ${formatPercent(averageGeometryScore)}`,
        `Dimension stability ${formatPercent(dimensionStabilityScore)}`,
      ],
      level: confidenceScore >= 0.78 ? 'high' : 'medium',
      score: confidenceScore,
    },
    dimensions,
    reasons: [],
    status: 'ready',
    volumeCubicMeters: calculateCuboidVolume(cuboidDimensions).valueCubicMeters,
  };
}

function fitCuboidGeometry(candidates: AssistedCuboidCornerCandidate[]) {
  const cornerMap = createCornerMap(candidates);
  const dimensions = calculateDimensionCandidates(cornerMap);
  const geometry = validateCuboidGeometry(cornerMap, dimensions);

  return {
    dimensions: geometry.isValid ? dimensions : undefined,
    geometry,
  };
}

function calculateDimensionCandidates(
  cornerMap: Partial<Record<AssistedCuboidCornerRole, AssistedCuboidCornerCandidate>>,
): AssistedCuboidDimensionsMeters | undefined {
  const lengthMeters = medianOptional(getDistancesForPairs(cornerMap, lengthPairs));
  const widthMeters = medianOptional(getDistancesForPairs(cornerMap, widthPairs));
  const heightMeters = medianOptional(getDistancesForPairs(cornerMap, heightPairs));

  if (lengthMeters === undefined || widthMeters === undefined || heightMeters === undefined) {
    return undefined;
  }

  return {
    heightMeters,
    lengthMeters,
    widthMeters,
  };
}

function validateCuboidGeometry(
  cornerMap: Partial<Record<AssistedCuboidCornerRole, AssistedCuboidCornerCandidate>>,
  dimensions?: AssistedCuboidDimensionsMeters,
): AssistedCuboidGeometryValidation {
  const reasons: string[] = [];

  if (!dimensions) {
    return {
      isValid: false,
      reasons: ['Need visible corner candidates for length, width, and height.'],
      score: 0,
    };
  }

  [
    ['length', dimensions.lengthMeters],
    ['width', dimensions.widthMeters],
    ['height', dimensions.heightMeters],
  ].forEach(([label, value]) => {
    if (!Number.isFinite(value as number) || (value as number) <= 0.005) {
      reasons.push(`${label} must be positive and larger than sensor noise.`);
    }

    if ((value as number) > 10) {
      reasons.push(`${label} is too large for the parcel/carton POC.`);
    }
  });

  const primaryAxes = getPrimaryAxes(cornerMap);
  const rightAngleScore =
    primaryAxes.length === 3 ? calculateRightAngleScore(primaryAxes[0], primaryAxes[1], primaryAxes[2]) : undefined;
  const parallelScore = calculateParallelScore(cornerMap);

  if (rightAngleScore === undefined) {
    reasons.push('Need three visible AR axes to validate cuboid right angles.');
  } else if (rightAngleScore < 0.55) {
    reasons.push('Visible edges do not form stable right angles.');
  }

  if (parallelScore !== undefined && parallelScore < 0.82) {
    reasons.push('Opposing edges are not parallel enough.');
  }

  const score = Math.min(
    1,
    Math.max(
      0,
      (rightAngleScore ?? 0) * 0.5 +
        (parallelScore ?? 0.65) * 0.25 +
        calculatePositiveDimensionScore(dimensions) * 0.25,
    ),
  );

  return {
    isValid: reasons.length === 0,
    parallelScore,
    reasons,
    rightAngleScore,
    score,
  };
}

function getDistancesForPairs(
  cornerMap: Partial<Record<AssistedCuboidCornerRole, AssistedCuboidCornerCandidate>>,
  pairs: [AssistedCuboidCornerRole, AssistedCuboidCornerRole][],
) {
  return pairs.flatMap(([firstRole, secondRole]) => {
    const firstPoint = cornerMap[firstRole]?.worldPoint;
    const secondPoint = cornerMap[secondRole]?.worldPoint;

    return firstPoint && secondPoint ? [distanceBetween(firstPoint, secondPoint)] : [];
  });
}

function getPrimaryAxes(
  cornerMap: Partial<Record<AssistedCuboidCornerRole, AssistedCuboidCornerCandidate>>,
) {
  const origin = cornerMap.front_bottom_left;
  const lengthPoint = cornerMap.front_bottom_right;
  const widthPoint = cornerMap.back_bottom_left;
  const heightPoint = cornerMap.front_top_left;

  if (!origin || !lengthPoint || !widthPoint || !heightPoint) {
    return [];
  }

  return [
    vectorBetween(origin.worldPoint, lengthPoint.worldPoint),
    vectorBetween(origin.worldPoint, widthPoint.worldPoint),
    vectorBetween(origin.worldPoint, heightPoint.worldPoint),
  ];
}

function calculateRightAngleScore(lengthAxis: WorldVector3D, widthAxis: WorldVector3D, heightAxis: WorldVector3D) {
  const normalizedAxes = [normalizeVector(lengthAxis), normalizeVector(widthAxis), normalizeVector(heightAxis)];

  if (normalizedAxes.some((axis) => !axis)) {
    return 0;
  }

  const axes = normalizedAxes as [WorldVector3D, WorldVector3D, WorldVector3D];
  const orthogonalityScores = [
    scoreRightAngle(axes[0], axes[1]),
    scoreRightAngle(axes[0], axes[2]),
    scoreRightAngle(axes[1], axes[2]),
  ];

  return Math.min(...orthogonalityScores);
}

function calculateParallelScore(
  cornerMap: Partial<Record<AssistedCuboidCornerRole, AssistedCuboidCornerCandidate>>,
) {
  const scores = [lengthPairs, widthPairs, heightPairs].flatMap((pairs) => {
    const vectors = pairs.flatMap(([firstRole, secondRole]) => {
      const firstPoint = cornerMap[firstRole]?.worldPoint;
      const secondPoint = cornerMap[secondRole]?.worldPoint;

      return firstPoint && secondPoint ? [normalizeVector(vectorBetween(firstPoint, secondPoint))] : [];
    }).filter((vector): vector is WorldVector3D => Boolean(vector));

    if (vectors.length < 2) {
      return [];
    }

    const reference = vectors[0];

    return vectors.slice(1).map((vector) => Math.abs(dotProduct(reference, vector)));
  });

  return averageFinite(scores);
}

function calculatePositiveDimensionScore(dimensions: AssistedCuboidDimensionsMeters) {
  const values = [dimensions.lengthMeters, dimensions.widthMeters, dimensions.heightMeters];

  if (values.some((value) => value <= 0.005 || value > 10 || !Number.isFinite(value))) {
    return 0;
  }

  return 1;
}

function createCornerMap(candidates: AssistedCuboidCornerCandidate[]) {
  return candidates.reduce<Partial<Record<AssistedCuboidCornerRole, AssistedCuboidCornerCandidate>>>(
    (currentMap, candidate) => ({
      ...currentMap,
      [candidate.role]: candidate,
    }),
    {},
  );
}

function getRobustDimensions(observations: AssistedCuboidObservation[]) {
  const dimensions = observations
    .map((observation) => observation.dimensions)
    .filter((dimension): dimension is AssistedCuboidDimensionsMeters => Boolean(dimension));

  if (dimensions.length === 0) {
    return undefined;
  }

  return {
    heightMeters: median(dimensions.map((dimension) => dimension.heightMeters)),
    lengthMeters: median(dimensions.map((dimension) => dimension.lengthMeters)),
    widthMeters: median(dimensions.map((dimension) => dimension.widthMeters)),
  };
}

function calculateDimensionStabilityScore(
  observations: AssistedCuboidObservation[],
  dimensions: AssistedCuboidDimensionsMeters | undefined,
  maxDimensionSpreadRatio: number,
) {
  if (!dimensions) {
    return 0;
  }

  const dimensionSets = observations
    .map((observation) => observation.dimensions)
    .filter((dimension): dimension is AssistedCuboidDimensionsMeters => Boolean(dimension));
  const spreadScores = [
    calculateSpreadScore(
      dimensionSets.map((dimension) => dimension.lengthMeters),
      dimensions.lengthMeters,
      maxDimensionSpreadRatio,
    ),
    calculateSpreadScore(
      dimensionSets.map((dimension) => dimension.widthMeters),
      dimensions.widthMeters,
      maxDimensionSpreadRatio,
    ),
    calculateSpreadScore(
      dimensionSets.map((dimension) => dimension.heightMeters),
      dimensions.heightMeters,
      maxDimensionSpreadRatio,
    ),
  ];

  return Math.min(...spreadScores);
}

function calculateSpreadScore(values: number[], centerValue: number, maxDimensionSpreadRatio: number) {
  if (values.length <= 1 || centerValue <= 0) {
    return 0;
  }

  const absoluteDeviations = values.map((value) => Math.abs(value - centerValue));
  const spreadRatio = median(absoluteDeviations) / centerValue;

  return Math.max(0, 1 - spreadRatio / maxDimensionSpreadRatio);
}

function createBaseEstimate(input: {
  acceptedObservationCount: number;
  rejectedObservationCount: number;
  requiredObservationCount: number;
  scanProgress: number;
}): AssistedCuboidEstimate {
  return {
    acceptedObservationCount: input.acceptedObservationCount,
    confidence: {
      factors: [],
      level: 'low',
      score: 0,
    },
    rejectedObservationCount: input.rejectedObservationCount,
    reasons: [],
    requiredObservationCount: input.requiredObservationCount,
    scanProgress: input.scanProgress,
    status: 'idle',
  };
}

function getObservationRejectionReasons(
  observation: AssistedCuboidObservation,
  options: Required<AssistedCuboidEstimationOptions>,
) {
  const reasons: string[] = [];

  if (observation.trackingState !== 'tracking') {
    reasons.push('AR tracking is not stable.');
  }

  if (observation.detectionConfidence < options.minDetectionConfidence) {
    reasons.push('Object detection confidence is low.');
  }

  if (observation.projectedCandidateCount < options.minimumProjectedCandidates) {
    reasons.push('Need more detected corners projected into AR/depth space.');
  }

  reasons.push(...observation.geometry.reasons);

  return reasons;
}

function distanceBetween(firstPoint: WorldPoint3D, secondPoint: WorldPoint3D) {
  const vector = vectorBetween(firstPoint, secondPoint);

  return Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);
}

function vectorBetween(firstPoint: WorldPoint3D, secondPoint: WorldPoint3D): WorldVector3D {
  return {
    x: secondPoint.xMeters - firstPoint.xMeters,
    y: secondPoint.yMeters - firstPoint.yMeters,
    z: secondPoint.zMeters - firstPoint.zMeters,
  };
}

function normalizeVector(vector: WorldVector3D) {
  const magnitude = Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);

  if (magnitude <= 0.005 || !Number.isFinite(magnitude)) {
    return undefined;
  }

  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude,
    z: vector.z / magnitude,
  };
}

function dotProduct(firstVector: WorldVector3D, secondVector: WorldVector3D) {
  return (
    firstVector.x * secondVector.x +
    firstVector.y * secondVector.y +
    firstVector.z * secondVector.z
  );
}

function scoreRightAngle(firstAxis: WorldVector3D, secondAxis: WorldVector3D) {
  return Math.max(0, 1 - Math.abs(dotProduct(firstAxis, secondAxis)) / 0.35);
}

function medianOptional(values: number[]) {
  return values.length === 0 ? undefined : median(values);
}

function median(values: number[]) {
  if (values.length === 0) {
    throw new RangeError('median requires at least one value.');
  }

  const sortedValues = [...values].sort((firstValue, secondValue) => firstValue - secondValue);
  const middleIndex = Math.floor(sortedValues.length / 2);

  return sortedValues.length % 2 === 0
    ? (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2
    : sortedValues[middleIndex];
}

function averageFinite(values: (number | undefined)[]) {
  const finiteValues = values.filter((value): value is number => {
    return value !== undefined && Number.isFinite(value);
  });

  if (finiteValues.length === 0) {
    return undefined;
  }

  return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}
