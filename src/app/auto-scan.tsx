import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { PrimaryButton, Screen, SectionHeader } from '@/components';
import { CameraPreview, CameraProvider, useCameraContext, type CameraPreviewHandle } from '@/features/camera';
import {
  convertArea,
  convertLength,
  convertVolume,
  toDeviceCapabilities,
  useMeasurementCapabilities,
  type MeasurementShape,
  type MeasurementUnit,
} from '@/features/measurement';
import {
  computePhysicalMetricsFromBox,
  createMeasurementFromUnifiedResult,
  defaultDistancePresets,
  detectAndMeasureFromImage,
  getSavedAiApiKey,
  saveAiApiKey,
  type DistancePreset,
  type UnifiedDetectionResult,
} from '@/features/vision';
import { useAppStore } from '@/store';
import { colors, spacing, typography } from '@/theme';

const { width: windowWidth } = Dimensions.get('window');
const VIEWFINDER_WIDTH = windowWidth - 32;
const VIEWFINDER_HEIGHT = 320;

export type ShapeMode = 'cylinder' | 'cuboid' | 'rectangle' | 'circle' | 'sphere' | 'auto';

const SHAPE_MODES: {
  id: ShapeMode;
  label: string;
  icon: string;
  badge: string;
}[] = [
  { badge: 'Bottles, Cans, Tumblers, Cups', icon: '🍾', id: 'cylinder', label: 'Cylinder / Bottle' },
  { badge: 'Cartons, Packages, Books', icon: '📦', id: 'cuboid', label: 'Box / Cuboid' },
  { badge: 'Computer Vision Heuristic', icon: '⚡', id: 'auto', label: 'Auto Detect' },
  { badge: 'Paper, Screen, Tabletop', icon: '📄', id: 'rectangle', label: 'Rectangle' },
  { badge: 'Plates, Coasters, Round Lids', icon: '⭕', id: 'circle', label: 'Circle / Disc' },
  { badge: 'Balls, Globes (Strict 3D)', icon: '⚽', id: 'sphere', label: 'Sphere / Ball' },
];

export default function AutoScanScreen() {
  return (
    <CameraProvider>
      <AutoScanner />
    </CameraProvider>
  );
}

function AutoScanner() {
  const camera = useCameraContext();
  const cameraRef = useRef<CameraPreviewHandle>(null);
  const { capabilities } = useMeasurementCapabilities();
  const { setCurrentMeasurement, settings } = useAppStore();

  const [selectedUnit, setSelectedUnit] = useState<MeasurementUnit>(settings.preferredLengthUnit);
  const [distanceMeters, setDistanceMeters] = useState(0.40); // 40 cm default desk distance
  const [activePresetId, setActivePresetId] = useState('desk');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isContinuousScan, setIsContinuousScan] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Alternate Solution: Explicit Target Shape Mode (Defaults to cylinder for bottles/cans)
  const [selectedShapeMode, setSelectedShapeMode] = useState<ShapeMode>('cylinder');

  // AI Vision mode enabled by default with Google Gemini Flash
  const [useAiVision, setUseAiVision] = useState(true);
  const [aiApiKey, setAiApiKey] = useState('AQ.Ab8RN6LVHqz0jCUSIhl_5Yo8GnAtOYcGPfRqxA-FlMTH-hcK8Q');
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);

  // Live detection result
  const [detectionResult, setDetectionResult] = useState<UnifiedDetectionResult | null>(null);

  // Animated laser scan effect
  const [scanAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, {
          duration: 1600,
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(scanAnim, {
          duration: 1600,
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scanAnim]);

  // Load saved AI API key on mount
  useEffect(() => {
    void getSavedAiApiKey().then((saved) => {
      if (saved) {
        setAiApiKey(saved);
      }
    });
  }, []);

  // Core function to capture and analyze camera frame
  const performDetection = useCallback(async () => {
    if (!cameraRef.current || isAnalyzing) {
      return;
    }

    setIsAnalyzing(true);
    setErrorMessage(null);

    try {
      const snapshot = await cameraRef.current.captureFrame({
        base64: true,
        maxDownsampling: 2,
        quality: 0.5,
      });

      if (!snapshot?.base64) {
        throw new Error('Camera frame could not be acquired. Make sure camera permissions are granted.');
      }

      const targetShape = selectedShapeMode === 'auto' ? undefined : selectedShapeMode;

      const result = await detectAndMeasureFromImage(snapshot.base64, {
        aiApiKey,
        distanceMeters,
        targetShape,
        useAiVision,
      });

      setDetectionResult(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Visual inspection failed.';
      setErrorMessage(msg);
    } finally {
      setIsAnalyzing(false);
    }
  }, [aiApiKey, distanceMeters, isAnalyzing, selectedShapeMode, useAiVision]);

  // Continuous auto-scan loop
  useEffect(() => {
    if (!isContinuousScan || !cameraReady) {
      return;
    }

    const interval = setInterval(() => {
      if (!isAnalyzing) {
        void performDetection();
      }
    }, 3500);

    return () => clearInterval(interval);
  }, [cameraReady, isAnalyzing, isContinuousScan, performDetection]);

  // Initial scan once camera is ready
  const handleCameraReady = useCallback(() => {
    setCameraReady(true);
    setTimeout(() => {
      void performDetection();
    }, 600);
  }, [performDetection]);

  // Handle switching shape mode - immediately re-evaluates dimensions if detection exists
  function handleSelectShapeMode(mode: ShapeMode) {
    setSelectedShapeMode(mode);

    if (detectionResult) {
      const targetShape: MeasurementShape = mode === 'auto' ? detectionResult.shape : mode;
      const planarShapes: MeasurementShape[] = ['circle', 'square', 'rectangle', 'polygon'];
      const shapeCat = planarShapes.includes(targetShape) ? '2d_planar' : '3d_volumetric';

      const metrics = computePhysicalMetricsFromBox(
        detectionResult.boundingBox,
        targetShape,
        { distanceMeters },
        shapeCat,
      );

      const isPlanar = shapeCat === '2d_planar';
      const label =
        targetShape === 'cylinder'
          ? 'Cylinder / Bottle'
          : targetShape === 'cuboid'
            ? 'Box / Cuboid'
            : targetShape === 'rectangle'
              ? 'Rectangle / Planar'
              : targetShape === 'circle'
                ? 'Circle / Disc'
                : targetShape === 'sphere'
                  ? 'Sphere / Ball'
                  : targetShape;

      setDetectionResult((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          baseAreaSquareMeters: metrics.baseAreaSquareMeters,
          diameterMeters: metrics.diameterMeters,
          dimensions: metrics.dimensions,
          objectName: label,
          perimeterMeters: metrics.perimeterMeters,
          radiusMeters: metrics.radiusMeters,
          rationale:
            mode === 'auto'
              ? prev.rationale
              : `Locked to ${label} mode. Scaled Height to ${convertLength(metrics.dimensions.heightMeters, 'meter', selectedUnit).toFixed(1)} ${selectedUnit === 'inch' ? 'in' : 'cm'} and Diameter to ${convertLength(metrics.diameterMeters ?? metrics.dimensions.widthMeters, 'meter', selectedUnit).toFixed(1)} ${selectedUnit === 'inch' ? 'in' : 'cm'}.`,
          shape: targetShape,
          shapeCategory: shapeCat,
          shapeLabel: label,
          surfaceAreaSquareMeters: metrics.surfaceAreaSquareMeters,
          volumeCubicMeters: isPlanar ? 0 : metrics.volumeCubicMeters,
        };
      });
    }
  }

  function handleSelectDistancePreset(preset: DistancePreset) {
    setActivePresetId(preset.id);
    setDistanceMeters(preset.distanceMeters);

    if (detectionResult) {
      const ratio = preset.distanceMeters / (detectionResult.distanceMeters || 0.40);
      setDetectionResult((prev) => {
        if (!prev) return null;
        const w = prev.dimensions.widthMeters * ratio;
        const l = prev.dimensions.lengthMeters * ratio;
        const h = prev.dimensions.heightMeters * ratio;
        const r = prev.radiusMeters ? prev.radiusMeters * ratio : undefined;
        const p = prev.perimeterMeters * ratio;
        const a = prev.baseAreaSquareMeters * ratio * ratio;
        const sa = prev.surfaceAreaSquareMeters * ratio * ratio;
        const v = prev.volumeCubicMeters * ratio * ratio * ratio;

        return {
          ...prev,
          baseAreaSquareMeters: a,
          diameterMeters: r ? r * 2 : undefined,
          dimensions: {
            ...prev.dimensions,
            baseAreaSquareMeters: a,
            diameterMeters: r ? r * 2 : undefined,
            heightMeters: h,
            lengthMeters: l,
            perimeterMeters: p,
            radiusMeters: r,
            surfaceAreaSquareMeters: sa,
            widthMeters: w,
          },
          distanceMeters: preset.distanceMeters,
          perimeterMeters: p,
          radiusMeters: r,
          surfaceAreaSquareMeters: sa,
          volumeCubicMeters: v,
        };
      });
    }
  }

  // Formatting helpers for HUD
  const unitSymbol = selectedUnit === 'centimeter' ? 'cm' : selectedUnit === 'inch' ? 'in' : 'm';
  const areaSymbol = selectedUnit === 'centimeter' ? 'cm²' : selectedUnit === 'inch' ? 'sq in' : 'm²';

  const formatLen = (m?: number) => {
    if (m == null || isNaN(m)) return '0.0 ' + unitSymbol;
    return `${convertLength(m, 'meter', selectedUnit).toFixed(1)} ${unitSymbol}`;
  };

  const formatArea = (sqM?: number) => {
    if (sqM == null || isNaN(sqM)) return '0.0 ' + areaSymbol;
    return `${convertArea(sqM, 'meter', selectedUnit).toFixed(1)} ${areaSymbol}`;
  };

  const formatVol = (cuM?: number) => {
    if (cuM == null || isNaN(cuM)) return '0.0 L';
    const liters = convertVolume(cuM, 'cubic_meter', 'liter');
    const mL = liters * 1000;
    if (liters >= 1.0) {
      return `${liters.toFixed(2)} L (${mL.toFixed(0)} mL)`;
    }
    return `${mL.toFixed(0)} mL (${liters.toFixed(2)} L)`;
  };

  async function handleLockAndInspect() {
    if (!detectionResult) {
      await performDetection();
      return;
    }

    const platform: 'android' | 'ios' | 'web' | 'unknown' =
      Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';

    const deviceCaps = capabilities ? toDeviceCapabilities(capabilities) : {
      hasARCore: false,
      hasARKit: false,
      hasCamera: camera.permissionState === 'granted',
      hasDepthSensor: false,
      hasLiDAR: false,
      platform,
      supportsWorldTracking: false,
    };

    const measurement = createMeasurementFromUnifiedResult(detectionResult, deviceCaps);
    await setCurrentMeasurement(measurement);
    router.push('/result' as Href);
  }

  const laserTranslateY = useMemo(
    () =>
      scanAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, VIEWFINDER_HEIGHT - 30],
      }),
    [scanAnim],
  );

  // Dynamic visual bounding box coordinates on the camera screen
  const boxStyle = useMemo(() => {
    if (!detectionResult?.boundingBox) {
      if (selectedShapeMode === 'cylinder') {
        // Silhouette proportions for vertical bottle / tumbler (width ~30%, height ~70%)
        return {
          height: VIEWFINDER_HEIGHT * 0.70,
          left: VIEWFINDER_WIDTH * 0.35,
          top: VIEWFINDER_HEIGHT * 0.15,
          width: VIEWFINDER_WIDTH * 0.30,
        };
      }
      return {
        height: VIEWFINDER_HEIGHT * 0.60,
        left: VIEWFINDER_WIDTH * 0.20,
        top: VIEWFINDER_HEIGHT * 0.20,
        width: VIEWFINDER_WIDTH * 0.60,
      };
    }
    const b = detectionResult.boundingBox;
    return {
      height: Math.max(50, b.height * VIEWFINDER_HEIGHT),
      left: Math.max(10, b.x * VIEWFINDER_WIDTH),
      top: Math.max(10, b.y * VIEWFINDER_HEIGHT),
      width: Math.max(50, b.width * VIEWFINDER_WIDTH),
    };
  }, [detectionResult, selectedShapeMode]);

  const activeShapeIsCylinder =
    selectedShapeMode === 'cylinder' || detectionResult?.shape === 'cylinder';

  return (
    <Screen>
      <SectionHeader
        subtitle="Point camera at any physical object. Vision engine detects edges, classifies shape and measures dimensions in real time."
        title="Live Object & Shape Scanner"
      />

      {/* Target Shape Mode Selector (Alternate Solution) */}
      <View style={styles.shapeSelectorSection}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>TARGET SHAPE MODE (SELECT OR AUTO)</Text>
          <View
            style={[
              styles.activeModePill,
              selectedShapeMode === 'cylinder' && styles.activeModePillCylinder,
            ]}
          >
            <Text style={styles.activeModePillText}>
              {selectedShapeMode === 'auto'
                ? '⚡ AUTO AI'
                : `🔒 ${selectedShapeMode.toUpperCase()} LOCKED`}
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.shapeModeList}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {SHAPE_MODES.map((mode) => {
            const isSelected = selectedShapeMode === mode.id;
            return (
              <Pressable
                key={mode.id}
                onPress={() => handleSelectShapeMode(mode.id)}
                style={[styles.shapeModeChip, isSelected && styles.shapeModeChipActive]}
              >
                <Text style={styles.shapeModeIcon}>{mode.icon}</Text>
                <View>
                  <Text
                    style={[
                      styles.shapeModeText,
                      isSelected && styles.shapeModeTextActive,
                    ]}
                  >
                    {mode.label}
                  </Text>
                  <Text
                    style={[
                      styles.shapeModeSub,
                      isSelected && styles.shapeModeSubActive,
                    ]}
                  >
                    {mode.badge}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Viewfinder Canvas with live AR overlays */}
      <View style={styles.viewfinderCard}>
        {camera.permissionState === 'granted' ? (
          <CameraPreview
            facing={camera.facing}
            isActive={camera.isCameraActive}
            onCameraReady={handleCameraReady}
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View style={styles.simulatedCameraBackground}>
            <View style={styles.gridOverlay} />
            <Text style={styles.cameraNoteText}>Camera Permission Required</Text>
            <PrimaryButton
              label="Enable Camera"
              onPress={() => camera.requestPermission()}
              style={{ marginTop: 12 }}
            />
          </View>
        )}

        {/* Dynamic Detected Object Bounding Reticle */}
        <View
          style={[
            styles.reticleFrame,
            activeShapeIsCylinder && styles.reticleFrameCylinder,
            {
              height: boxStyle.height,
              left: boxStyle.left,
              top: boxStyle.top,
              width: boxStyle.width,
            },
          ]}
        >
          <View style={[styles.reticleCorner, styles.cornerTL]} />
          <View style={[styles.reticleCorner, styles.cornerTR]} />
          <View style={[styles.reticleCorner, styles.cornerBL]} />
          <View style={[styles.reticleCorner, styles.cornerBR]} />

          {/* Cylinder Top and Bottom Elliptical Cap Guides */}
          {activeShapeIsCylinder ? (
            <>
              <View style={styles.cylinderCapTop} />
              <View style={styles.cylinderCapBottom} />
              <View style={styles.cylinderCenterAxis} />
            </>
          ) : null}

          {/* Animated Laser Scan Line */}
          <Animated.View
            style={[
              styles.laserLine,
              {
                transform: [{ translateY: laserTranslateY }],
              },
            ]}
          />

          {/* Center Target Crosshair */}
          <View style={styles.centerTarget}>
            <View style={styles.centerDot} />
          </View>

          {/* Object Name & Shape Tag */}
          <View style={styles.detectedBadge}>
            <View
              style={[
                styles.statusIndicator,
                { backgroundColor: isAnalyzing ? '#F59E0B' : '#22C55E' },
              ]}
            />
            <Text style={styles.detectedText}>
              {isAnalyzing
                ? 'CALCULATING DIMENSIONS...'
                : detectionResult
                  ? `${detectionResult.shapeLabel.toUpperCase()} · ${(detectionResult.confidence * 100).toFixed(0)}%`
                  : activeShapeIsCylinder
                    ? 'CYLINDER / BOTTLE MODE'
                    : 'AIM AT OBJECT'}
            </Text>
          </View>
        </View>

        {/* Live Dimension HUD Overlays */}
        {detectionResult ? (
          <View style={styles.hudOverlay}>
            <View style={styles.hudRow}>
              {activeShapeIsCylinder ? (
                <>
                  <View style={[styles.hudPill, styles.hudPillHighlight]}>
                    <Text style={styles.hudPillLabel}>DIAMETER (Ø)</Text>
                    <Text style={styles.hudPillValue}>
                      {formatLen(detectionResult.diameterMeters ?? detectionResult.dimensions.widthMeters)}
                    </Text>
                  </View>
                  <View style={[styles.hudPill, styles.hudPillHighlight]}>
                    <Text style={styles.hudPillLabel}>HEIGHT (H)</Text>
                    <Text style={styles.hudPillValue}>
                      {formatLen(detectionResult.dimensions.heightMeters)}
                    </Text>
                  </View>
                  <View style={[styles.hudPill, styles.hudPillHighlight]}>
                    <Text style={styles.hudPillLabel}>LIQUID VOL</Text>
                    <Text style={styles.hudPillValue}>
                      {formatVol(detectionResult.volumeCubicMeters)}
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.hudPill}>
                    <Text style={styles.hudPillLabel}>WIDTH</Text>
                    <Text style={styles.hudPillValue}>
                      {formatLen(detectionResult.dimensions.widthMeters)}
                    </Text>
                  </View>
                  <View style={styles.hudPill}>
                    <Text style={styles.hudPillLabel}>LENGTH</Text>
                    <Text style={styles.hudPillValue}>
                      {formatLen(detectionResult.dimensions.lengthMeters)}
                    </Text>
                  </View>
                  {detectionResult.dimensions.heightMeters > 0 ? (
                    <View style={styles.hudPill}>
                      <Text style={styles.hudPillLabel}>HEIGHT</Text>
                      <Text style={styles.hudPillValue}>
                        {formatLen(detectionResult.dimensions.heightMeters)}
                      </Text>
                    </View>
                  ) : null}
                </>
              )}
            </View>
          </View>
        ) : null}
      </View>

      {/* Main Scan Trigger Controls */}
      <View style={styles.controlsRow}>
        <View style={{ flex: 1 }}>
          <PrimaryButton
            disabled={isAnalyzing}
            label={isAnalyzing ? 'Scanning Camera Frame…' : '⚡ Auto Scan & Measure'}
            onPress={() => void performDetection()}
          />
        </View>
        <Pressable
          onPress={() => setIsContinuousScan((prev) => !prev)}
          style={[styles.continuousToggle, isContinuousScan && styles.continuousToggleActive]}
        >
          <Text style={[styles.continuousToggleText, isContinuousScan && styles.continuousToggleTextActive]}>
            {isContinuousScan ? '● LIVE SCAN' : '○ MANUAL'}
          </Text>
        </Pressable>
      </View>

      {/* Alternate Solution: Native ARCore 3D Raycasting Shortcut Banner */}
      <Pressable
        onPress={() => router.push('/smart-scan?shape=cylinder' as Href)}
        style={styles.arCoreBanner}
      >
        <View style={styles.arCoreIconBox}>
          <Text style={styles.arCoreIconText}>📐</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: 6 }}>
            <Text style={styles.arCoreTitle}>Native ARCore 3D Point Measure</Text>
            <View style={styles.arCoreNativeBadge}>
              <Text style={styles.arCoreNativeBadgeText}>HARDWARE AR</Text>
            </View>
          </View>
          <Text style={styles.arCoreSub}>
            Tap top & bottom of bottle in AR for millimeter accuracy with hardware motion sensors.
          </Text>
        </View>
        <Text style={styles.arCoreArrow}>→</Text>
      </Pressable>

      {errorMessage ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      {/* Distance Calibration Rangefinder */}
      <View style={styles.distanceSection}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>CAMERA DISTANCE (RANGEFINDER)</Text>
          <Text style={styles.distanceValueText}>{(distanceMeters * 100).toFixed(0)} cm</Text>
        </View>
        <ScrollView contentContainerStyle={styles.presetList} horizontal showsHorizontalScrollIndicator={false}>
          {defaultDistancePresets.map((preset) => {
            const isSelected = activePresetId === preset.id;
            return (
              <Pressable
                key={preset.id}
                onPress={() => handleSelectDistancePreset(preset)}
                style={[styles.presetChip, isSelected && styles.presetChipActive]}
              >
                <Text style={[styles.presetChipText, isSelected && styles.presetChipTextActive]}>
                  {preset.label}
                </Text>
                <Text style={[styles.presetChipSub, isSelected && styles.presetChipSubActive]}>
                  {preset.description}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Real-Time Geometric Metric Summary Card */}
      {detectionResult ? (
        <View style={styles.metricCardContainer}>
          <View style={styles.metricHeaderRow}>
            <View>
              <Text style={styles.metricSummaryTitle}>{detectionResult.shapeLabel}</Text>
              <Text style={styles.metricSubTitle}>
                {detectionResult.source === 'ai_vision' ? '✨ Multimodal AI Detected' : '🔍 Computer Vision Classified'}
              </Text>
            </View>
            <View style={styles.categoryTag}>
              <Text style={styles.categoryTagText}>
                {detectionResult.shapeCategory === '2d_planar' ? '2D PLANAR' : '3D SOLID'}
              </Text>
            </View>
          </View>

          <Text style={styles.rationaleText}>{detectionResult.rationale}</Text>

          {/* Dedicated Cylinder / Water Bottle Volume Highlight Card */}
          {activeShapeIsCylinder && detectionResult.volumeCubicMeters > 0 ? (
            <View style={styles.volumeHighlightCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.volumeHighlightLabel}>BOTTLE LIQUID CAPACITY</Text>
                <Text style={styles.volumeHighlightValue}>
                  {formatVol(detectionResult.volumeCubicMeters)}
                </Text>
                <Text style={styles.volumeHighlightSub}>
                  Formula: V = π × r² × h · Height: {formatLen(detectionResult.dimensions.heightMeters)} · Diameter: {formatLen(detectionResult.diameterMeters ?? detectionResult.dimensions.widthMeters)}
                </Text>
              </View>
              <Text style={{ fontSize: 28 }}>💧</Text>
            </View>
          ) : null}

          <View style={styles.metricGrid}>
            {/* Perimeter / Circumference */}
            <View style={styles.metricItem}>
              <Text style={styles.metricItemLabel}>
                {detectionResult.radiusMeters ? 'Circumference (C)' : 'Perimeter (P)'}
              </Text>
              <Text style={styles.metricItemValue}>
                {formatLen(detectionResult.perimeterMeters)}
              </Text>
            </View>

            {/* Radius & Diameter (if circular or cylindrical) */}
            {detectionResult.radiusMeters ? (
              <View style={styles.metricItem}>
                <Text style={styles.metricItemLabel}>Diameter (Ø)</Text>
                <Text style={styles.metricItemValue}>
                  {formatLen(detectionResult.diameterMeters ?? (detectionResult.radiusMeters * 2))}
                </Text>
              </View>
            ) : null}

            {/* Area */}
            <View style={styles.metricItem}>
              <Text style={styles.metricItemLabel}>
                {detectionResult.shapeCategory === '3d_volumetric' ? 'Base Footprint' : 'Surface Area'}
              </Text>
              <Text style={styles.metricItemValue}>
                {formatArea(detectionResult.baseAreaSquareMeters)}
              </Text>
            </View>

            {/* 3D Volume (if solid) */}
            {detectionResult.shapeCategory === '3d_volumetric' && detectionResult.volumeCubicMeters > 0 ? (
              <View style={styles.metricItem}>
                <Text style={styles.metricItemLabel}>Total Volume (V)</Text>
                <Text style={styles.metricItemValue}>
                  {formatVol(detectionResult.volumeCubicMeters)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyCardTitle}>Ready to Measure</Text>
          <Text style={styles.emptyCardBody}>
            Point your camera at a water bottle, can, or box and tap &quot;Auto Scan &amp; Measure&quot;.
            You can lock to &quot;Cylinder / Bottle&quot; or &quot;Box / Cuboid&quot; using the top buttons anytime.
          </Text>
        </View>
      )}

      {/* Unit Selector Toggle */}
      <View style={styles.unitToggleRow}>
        {(['centimeter', 'inch', 'meter'] as MeasurementUnit[]).map((unit) => (
          <Pressable
            key={unit}
            onPress={() => setSelectedUnit(unit)}
            style={[styles.unitButton, selectedUnit === unit && styles.unitButtonActive]}
          >
            <Text style={[styles.unitButtonText, selectedUnit === unit && styles.unitButtonTextActive]}>
              {unit === 'centimeter' ? 'Centimeters (cm)' : unit === 'inch' ? 'Inches (in)' : 'Meters (m)'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Optional AI Smart Vision Toggle */}
      <View style={styles.aiToggleCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.aiToggleTitle}>AI Multimodal Recognition (Gemini)</Text>
          <Text style={styles.aiToggleSub}>Semantic labeling of specific objects (tumblers, brands, cans)</Text>
        </View>
        <Switch
          onValueChange={(val) => {
            setUseAiVision(val);
            if (val && !aiApiKey) {
              setShowApiKeyModal(true);
            }
          }}
          value={useAiVision}
        />
      </View>

      {showApiKeyModal ? (
        <View style={styles.apiKeyBox}>
          <Text style={styles.apiKeyLabel}>Google Gemini API Key (Optional)</Text>
          <TextInput
            autoCapitalize="none"
            onChangeText={setAiApiKey}
            placeholder="Paste your Gemini API key"
            secureTextEntry
            style={styles.apiKeyInput}
            value={aiApiKey}
          />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <PrimaryButton
              label="Save Key"
              onPress={() => {
                void saveAiApiKey(aiApiKey);
                setShowApiKeyModal(false);
              }}
              style={{ flex: 1 }}
            />
            <PrimaryButton
              label="Cancel"
              onPress={() => setShowApiKeyModal(false)}
              style={{ flex: 1 }}
              variant="secondary"
            />
          </View>
        </View>
      ) : null}

      {/* Bottom Action Buttons */}
      <View style={styles.actionContainer}>
        <PrimaryButton
          disabled={!detectionResult}
          label="Lock Measurement & View Full Report"
          onPress={handleLockAndInspect}
        />
        <PrimaryButton
          label="Back to Measurements"
          onPress={() => router.replace('/measure' as Href)}
          variant="secondary"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionContainer: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  activeModePill: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  activeModePillCylinder: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  activeModePillText: {
    color: '#3730A3',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  aiToggleCard: {
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: spacing.xs,
    padding: spacing.md,
  },
  aiToggleSub: {
    color: colors.mutedText,
    fontSize: 11,
    marginTop: 2,
  },
  aiToggleTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  apiKeyBox: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: spacing.xs,
    padding: spacing.md,
  },
  apiKeyInput: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderRadius: 6,
    borderWidth: 1,
    fontSize: 13,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  apiKeyLabel: {
    color: '#3730A3',
    fontSize: 12,
    fontWeight: '700',
  },
  arCoreArrow: {
    color: '#38BDF8',
    fontSize: 18,
    fontWeight: '800',
  },
  arCoreBanner: {
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderColor: '#1E293B',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: spacing.xs,
    padding: spacing.md,
  },
  arCoreIconBox: {
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 8,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  arCoreIconText: {
    fontSize: 18,
  },
  arCoreNativeBadge: {
    backgroundColor: '#0284C7',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  arCoreNativeBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  arCoreSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  arCoreTitle: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  cameraNoteText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
  categoryTag: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  categoryTagText: {
    color: '#4338CA',
    fontSize: 11,
    fontWeight: '800',
  },
  centerDot: {
    backgroundColor: '#38BDF8',
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  centerTarget: {
    alignItems: 'center',
    borderColor: 'rgba(56, 189, 248, 0.4)',
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  continuousToggle: {
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  continuousToggleActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  continuousToggleText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '800',
  },
  continuousToggleTextActive: {
    color: '#38BDF8',
  },
  controlsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  cornerBL: {
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    bottom: 0,
    left: 0,
  },
  cornerBR: {
    borderBottomWidth: 3,
    borderRightWidth: 3,
    bottom: 0,
    right: 0,
  },
  cornerTL: {
    borderLeftWidth: 3,
    borderTopWidth: 3,
    left: 0,
    top: 0,
  },
  cornerTR: {
    borderRightWidth: 3,
    borderTopWidth: 3,
    right: 0,
    top: 0,
  },
  cylinderCapBottom: {
    borderColor: 'rgba(56, 189, 248, 0.7)',
    borderRadius: 12,
    borderWidth: 1.5,
    bottom: 0,
    height: 24,
    left: 2,
    position: 'absolute',
    right: 2,
  },
  cylinderCapTop: {
    borderColor: 'rgba(56, 189, 248, 0.7)',
    borderRadius: 12,
    borderWidth: 1.5,
    height: 24,
    left: 2,
    position: 'absolute',
    right: 2,
    top: 0,
  },
  cylinderCenterAxis: {
    borderColor: 'rgba(56, 189, 248, 0.25)',
    borderStyle: 'dashed',
    borderWidth: 1,
    bottom: 12,
    left: '50%',
    position: 'absolute',
    top: 12,
    width: 0,
  },
  detectedBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.90)',
    borderRadius: 8,
    bottom: -16,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    position: 'absolute',
  },
  detectedText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  distanceSection: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  distanceValueText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    padding: spacing.md,
  },
  emptyCardBody: {
    color: colors.mutedText,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  emptyCardTitle: {
    color: colors.text,
    fontSize: typography.subtitle,
    fontWeight: '700',
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: spacing.xs,
    padding: spacing.sm,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '600',
  },
  gridOverlay: {
    borderColor: 'rgba(56, 189, 248, 0.08)',
    borderWidth: 1,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  hudOverlay: {
    bottom: 8,
    left: 8,
    position: 'absolute',
    right: 8,
  },
  hudPill: {
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  hudPillHighlight: {
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderColor: 'rgba(56, 189, 248, 0.4)',
    borderWidth: 1,
  },
  hudPillLabel: {
    color: '#94A3B8',
    fontSize: 9,
    fontWeight: '700',
  },
  hudPillValue: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '800',
  },
  hudRow: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
  },
  laserLine: {
    backgroundColor: '#38BDF8',
    height: 2,
    left: 4,
    position: 'absolute',
    right: 4,
    shadowColor: '#38BDF8',
    shadowOpacity: 0.8,
    shadowRadius: 6,
    top: 0,
  },
  metricCardContainer: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  metricHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricItem: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minWidth: 120,
    padding: spacing.sm,
  },
  metricItemLabel: {
    color: colors.mutedText,
    fontSize: 11,
    fontWeight: '600',
  },
  metricItemValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  metricSubTitle: {
    color: colors.mutedText,
    fontSize: 11,
    marginTop: 2,
  },
  metricSummaryTitle: {
    color: colors.text,
    fontSize: typography.subtitle,
    fontWeight: '800',
  },
  presetChip: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  presetChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  presetChipSub: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
  },
  presetChipSubActive: {
    color: '#38BDF8',
  },
  presetChipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  presetChipTextActive: {
    color: '#FFFFFF',
  },
  presetList: {
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  rationaleText: {
    color: colors.mutedText,
    fontSize: 12,
    lineHeight: 18,
  },
  reticleCorner: {
    borderColor: '#38BDF8',
    height: 18,
    position: 'absolute',
    width: 18,
  },
  reticleFrame: {
    alignItems: 'center',
    borderColor: 'rgba(56, 189, 248, 0.4)',
    borderRadius: 8,
    borderWidth: 1.5,
    justifyContent: 'center',
    position: 'absolute',
  },
  reticleFrameCylinder: {
    borderColor: 'rgba(56, 189, 248, 0.6)',
    borderRadius: 14,
  },
  sectionHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    color: colors.mutedText,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  shapeModeChip: {
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  shapeModeChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0284C7',
  },
  shapeModeIcon: {
    fontSize: 18,
  },
  shapeModeList: {
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  shapeModeSub: {
    color: '#64748B',
    fontSize: 9,
    fontWeight: '600',
  },
  shapeModeSubActive: {
    color: '#7DD3FC',
  },
  shapeModeText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  shapeModeTextActive: {
    color: '#FFFFFF',
  },
  shapeSelectorSection: {
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  simulatedCameraBackground: {
    alignItems: 'center',
    backgroundColor: '#0B132B',
    height: '100%',
    justifyContent: 'center',
    width: '100%',
  },
  statusIndicator: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  unitButton: {
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    flex: 1,
    paddingVertical: 6,
  },
  unitButtonActive: {
    backgroundColor: colors.accent,
  },
  unitButtonText: {
    color: colors.mutedText,
    fontSize: 11,
    fontWeight: '700',
  },
  unitButtonTextActive: {
    color: '#FFFFFF',
  },
  unitToggleRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  viewfinderCard: {
    alignItems: 'center',
    backgroundColor: '#020617',
    borderRadius: 16,
    height: VIEWFINDER_HEIGHT,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  volumeHighlightCard: {
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginVertical: 4,
    padding: spacing.sm,
  },
  volumeHighlightLabel: {
    color: '#166534',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  volumeHighlightSub: {
    color: '#15803D',
    fontSize: 11,
    marginTop: 2,
  },
  volumeHighlightValue: {
    color: '#14532D',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 1,
  },
});
