import type { NativePointQuality, NativeWorldPoint3D, TrackingState } from './types';
import type { WorldPoint3D } from '../types';

export type MeasurementQualityLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type WorldPointSample = NativeWorldPoint3D &
  NativePointQuality & {
    cameraMovementMeters?: number;
    planeId?: string;
    trackingState?: TrackingState['status'];
  };

export type RejectedWorldPointSample = {
  reason: string;
  sample: WorldPointSample;
};

export type SmoothedWorldPointResult = {
  acceptedSamples: WorldPointSample[];
  depthConsistency?: number;
  discardedSamples: RejectedWorldPointSample[];
  finalPoint: NativeWorldPoint3D;
  qualityLevel: MeasurementQualityLevel;
  qualityScore: number;
  sampleVarianceMetersSquared: number;
};

export type SmoothWorldPointOptions = {
  maxExtremeJumpMeters?: number;
  maxVarianceMetersSquared?: number;
  minimumAcceptedSamples?: number;
  outlierFloorMeters?: number;
};

const defaultOptions: Required<SmoothWorldPointOptions> = {
  maxExtremeJumpMeters: 0.35,
  maxVarianceMetersSquared: 0.01,
  minimumAcceptedSamples: 2,
  outlierFloorMeters: 0.025,
};

export type NormalizedNativeWorldPoint3D = NativeWorldPoint3D & WorldPoint3D;

export function normalizeWorldPointValue(point: NativeWorldPoint3D): NormalizedNativeWorldPoint3D {
  const xMeters = Number(point.xMeters ?? point.x);
  const yMeters = Number(point.yMeters ?? point.y);
  const zMeters = Number(point.zMeters ?? point.z);

  return {
    x: Number(point.x),
    xMeters,
    y: Number(point.y),
    yMeters,
    z: Number(point.z),
    zMeters,
  };
}

export function isValidWorldPoint(point: NativeWorldPoint3D) {
  const normalizedPoint = normalizeWorldPointValue(point);

  return (
    Number.isFinite(normalizedPoint.xMeters) &&
    Number.isFinite(normalizedPoint.yMeters) &&
    Number.isFinite(normalizedPoint.zMeters)
  );
}

export function distanceBetweenWorldPoints(
  firstPoint: NativeWorldPoint3D,
  secondPoint: NativeWorldPoint3D,
) {
  const first = normalizeWorldPointValue(firstPoint);
  const second = normalizeWorldPointValue(secondPoint);
  const dx = second.xMeters - first.xMeters;
  const dy = second.yMeters - first.yMeters;
  const dz = second.zMeters - first.zMeters;

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function median(values: number[]) {
  if (values.length === 0) {
    throw new RangeError('median requires at least one value.');
  }

  const sortedValues = [...values].sort((first, second) => first - second);
  const middleIndex = Math.floor(sortedValues.length / 2);

  return sortedValues.length % 2 === 0
    ? (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2
    : sortedValues[middleIndex];
}

export function medianWorldPoint(samples: NativeWorldPoint3D[]): NormalizedNativeWorldPoint3D {
  if (samples.length === 0) {
    throw new RangeError('medianWorldPoint requires at least one sample.');
  }

  const normalizedSamples = samples.map((sample) => normalizeWorldPointValue(sample));

  return {
    x: median(normalizedSamples.map((sample) => sample.x)),
    xMeters: median(normalizedSamples.map((sample) => sample.xMeters)),
    y: median(normalizedSamples.map((sample) => sample.y)),
    yMeters: median(normalizedSamples.map((sample) => sample.yMeters)),
    z: median(normalizedSamples.map((sample) => sample.z)),
    zMeters: median(normalizedSamples.map((sample) => sample.zMeters)),
  };
}

export function calculateSampleVarianceMetersSquared(samples: NativeWorldPoint3D[]) {
  if (samples.length <= 1) {
    return 0;
  }

  const centerPoint = medianWorldPoint(samples);
  const squaredDistances = samples.map((sample) => {
    const distance = distanceBetweenWorldPoints(sample, centerPoint);

    return distance * distance;
  });

  return squaredDistances.reduce((sum, value) => sum + value, 0) / squaredDistances.length;
}

export function calculateHitStabilityMeters(samples: NativeWorldPoint3D[]) {
  return Math.sqrt(calculateSampleVarianceMetersSquared(samples));
}

export function smoothWorldPointSamples(
  samples: WorldPointSample[],
  options: SmoothWorldPointOptions = {},
): SmoothedWorldPointResult | undefined {
  const resolvedOptions = {
    ...defaultOptions,
    ...options,
  };
  const initialFilter = rejectInvalidSamples(samples, resolvedOptions);

  if (initialFilter.acceptedSamples.length === 0) {
    return undefined;
  }

  const robustFilter = rejectStatisticalOutliers(
    initialFilter.acceptedSamples,
    resolvedOptions.outlierFloorMeters,
  );
  const acceptedSamplesBeforeVariance =
    robustFilter.acceptedSamples.length >= resolvedOptions.minimumAcceptedSamples
      ? robustFilter.acceptedSamples
      : initialFilter.acceptedSamples;
  const varianceFilter = trimVarianceOutliers(
    acceptedSamplesBeforeVariance,
    resolvedOptions.minimumAcceptedSamples,
    resolvedOptions.maxVarianceMetersSquared,
  );
  const acceptedSamples = varianceFilter.acceptedSamples;
  const discardedSamples = [...initialFilter.discardedSamples, ...robustFilter.discardedSamples];
  discardedSamples.push(...varianceFilter.discardedSamples);

  if (acceptedSamples.length === 0) {
    return undefined;
  }

  const finalPoint = normalizeWorldPointValue(medianWorldPoint(acceptedSamples));
  const sampleVarianceMetersSquared = calculateSampleVarianceMetersSquared(acceptedSamples);
  const depthConsistency = calculateDepthConsistency(acceptedSamples);
  const qualityScore = calculateMeasurementQualityScore({
    acceptedSampleCount: acceptedSamples.length,
    depthAvailable: acceptedSamples.some((sample) => sample.depthAvailable),
    depthConfidence: averageFinite(acceptedSamples.map((sample) => sample.depthConfidence)),
    depthConsistency,
    planeStability: calculatePlaneStability(acceptedSamples),
    sampleVarianceMetersSquared,
    trackingQuality: averageFinite(acceptedSamples.map((sample) => sample.trackingQuality)),
  });

  return {
    acceptedSamples,
    depthConsistency,
    discardedSamples,
    finalPoint,
    qualityLevel: getMeasurementQualityLevel(qualityScore),
    qualityScore,
    sampleVarianceMetersSquared,
  };
}

export function calculateMeasurementQualityScore(input: {
  acceptedSampleCount: number;
  depthAvailable: boolean;
  depthConfidence?: number;
  depthConsistency?: number;
  planeStability?: number;
  sampleVarianceMetersSquared: number;
  trackingQuality?: number;
}) {
  const trackingScore = input.trackingQuality ?? 0;
  const sampleScore = Math.min(input.acceptedSampleCount, 8) / 8;
  const varianceMeters = Math.sqrt(Math.max(input.sampleVarianceMetersSquared, 0));
  const stabilityScore =
    varianceMeters <= 0.008
      ? 1
      : varianceMeters <= 0.02
        ? 0.82
        : varianceMeters <= 0.05
          ? 0.55
          : 0.2;
  const depthScore = input.depthAvailable
    ? ((input.depthConfidence ?? 0.65) * 0.65 + (input.depthConsistency ?? 0.5) * 0.35)
    : 0.45;
  const planeScore = input.planeStability ?? 0.6;

  return Math.min(
    1,
    Math.max(
      0,
      trackingScore * 0.3 +
        sampleScore * 0.2 +
        stabilityScore * 0.25 +
        depthScore * 0.15 +
        planeScore * 0.1,
    ),
  );
}

export function getMeasurementQualityLevel(score: number): MeasurementQualityLevel {
  if (score >= 0.78) {
    return 'HIGH';
  }

  if (score >= 0.5) {
    return 'MEDIUM';
  }

  return 'LOW';
}

function rejectInvalidSamples(
  samples: WorldPointSample[],
  options: Required<SmoothWorldPointOptions>,
) {
  const acceptedSamples: WorldPointSample[] = [];
  const discardedSamples: RejectedWorldPointSample[] = [];

  samples.forEach((sample) => {
    const previousSample = acceptedSamples.at(-1);

    if (!isValidWorldPoint(sample)) {
      discardedSamples.push({ reason: 'invalid_world_point', sample });
      return;
    }

    if (sample.trackingState && sample.trackingState !== 'tracking') {
      discardedSamples.push({ reason: 'non_tracking_frame', sample });
      return;
    }

    if (sample.trackingQuality !== undefined && sample.trackingQuality <= 0) {
      discardedSamples.push({ reason: 'non_tracking_frame', sample });
      return;
    }

    if (
      sample.depthAvailable &&
      (sample.depthMeters === undefined || !Number.isFinite(sample.depthMeters) || sample.depthMeters <= 0)
    ) {
      discardedSamples.push({ reason: 'invalid_depth', sample });
      return;
    }

    if (previousSample && distanceBetweenWorldPoints(previousSample, sample) > options.maxExtremeJumpMeters) {
      discardedSamples.push({ reason: 'extreme_jump', sample });
      return;
    }

    acceptedSamples.push(sample);
  });

  return {
    acceptedSamples,
    discardedSamples,
  };
}

function rejectStatisticalOutliers(samples: WorldPointSample[], outlierFloorMeters: number) {
  if (samples.length < 4) {
    return {
      acceptedSamples: samples,
      discardedSamples: [],
    };
  }

  const centerPoint = medianWorldPoint(samples);
  const distances = samples.map((sample) => distanceBetweenWorldPoints(sample, centerPoint));
  const medianDistance = median(distances);
  const absoluteDeviations = distances.map((distance) => Math.abs(distance - medianDistance));
  const medianAbsoluteDeviation = median(absoluteDeviations);
  const thresholdMeters = Math.max(outlierFloorMeters, medianDistance + medianAbsoluteDeviation * 3);
  const acceptedSamples: WorldPointSample[] = [];
  const discardedSamples: RejectedWorldPointSample[] = [];

  samples.forEach((sample, index) => {
    if (distances[index] <= thresholdMeters) {
      acceptedSamples.push(sample);
    } else {
      discardedSamples.push({ reason: 'statistical_outlier', sample });
    }
  });

  return {
    acceptedSamples,
    discardedSamples,
  };
}

function trimVarianceOutliers(
  samples: WorldPointSample[],
  minimumAcceptedSamples: number,
  maxVarianceMetersSquared: number,
) {
  const acceptedSamples = [...samples];
  const discardedSamples: RejectedWorldPointSample[] = [];

  while (
    acceptedSamples.length > minimumAcceptedSamples &&
    calculateSampleVarianceMetersSquared(acceptedSamples) > maxVarianceMetersSquared
  ) {
    const centerPoint = medianWorldPoint(acceptedSamples);
    let farthestIndex = 0;
    let farthestDistance = -1;

    acceptedSamples.forEach((sample, index) => {
      const distance = distanceBetweenWorldPoints(sample, centerPoint);
      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthestIndex = index;
      }
    });

    const discardedSample = acceptedSamples.splice(farthestIndex, 1)[0];
    discardedSamples.push({ reason: 'high_variance', sample: discardedSample });
  }

  return {
    acceptedSamples,
    discardedSamples,
  };
}

function calculateDepthConsistency(samples: WorldPointSample[]) {
  const depthValues = samples
    .map((sample) => sample.depthMeters)
    .filter((depthMeters): depthMeters is number => depthMeters !== undefined && Number.isFinite(depthMeters));

  if (depthValues.length <= 1) {
    return undefined;
  }

  const medianDepth = median(depthValues);
  const meanAbsoluteDepthError =
    depthValues.reduce((sum, depthMeters) => sum + Math.abs(depthMeters - medianDepth), 0) /
    depthValues.length;

  return Math.max(0, 1 - meanAbsoluteDepthError / 0.08);
}

function calculatePlaneStability(samples: WorldPointSample[]) {
  const planeIds = samples
    .map((sample) => sample.planeId)
    .filter((planeId): planeId is string => Boolean(planeId));

  if (planeIds.length === 0) {
    return undefined;
  }

  const counts = planeIds.reduce<Record<string, number>>((currentCounts, planeId) => {
    currentCounts[planeId] = (currentCounts[planeId] ?? 0) + 1;
    return currentCounts;
  }, {});
  const stablePlaneCount = Math.max(...Object.values(counts));

  return stablePlaneCount / planeIds.length;
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
