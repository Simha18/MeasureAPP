import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { PixelRatio, Platform, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton, Screen, SectionHeader } from '@/components';
import { CameraProvider, useCameraContext } from '@/features/camera';
import { getNativeMeasurementModule, isVolumeMeasurementArViewAvailable, toDeviceCapabilities,
  useMeasurementCapabilities, VolumeMeasurementArView, type MeasurementShape, type WorldPoint3D } from '@/features/measurement';
import { anchorPoint, clearAnchors, removeAnchor, resolvePoints, projectedAnchors, supportsMeasurementAnchors, type Anchor } from '@/features/measurement/smart/anchors';
import { CameraAccess } from '@/features/measurement/smart/CameraAccess';
import { createSmartMeasurement } from '@/features/measurement/smart/createMeasurement';
import { dimensionLabels, distance, horizontalSection, prismGeometry, regularArGeometry, regularGeometry, sectionedGeometry, shapeLabels, type RegularShape } from '@/features/measurement/smart/geometry';
import { queueArOperation } from '@/features/measurement/smart/sessionQueue';
import { smartStyles as styles } from '@/features/measurement/smart/styles';
import { useAppStore } from '@/store';

type CapturedPoint = { id: string; point: WorldPoint3D; quality: number };
export default function SmartScanScreen() {
  const params = useLocalSearchParams<{ shape?: string }>();
  return <CameraProvider><ArScan key={params.shape ?? 'cuboid'} /></CameraProvider>;
}
function ArScan() {
  const params = useLocalSearchParams<{ shape?: string }>();
  const shape: MeasurementShape = params.shape && Object.hasOwn(shapeLabels, params.shape) ? params.shape as MeasurementShape : 'cuboid';
  const isOutline = shape === 'polygon_prism' || shape === 'sectioned';
  const labels = isOutline ? [] : dimensionLabels[shape as RegularShape];
  const camera = useCameraContext();
  const { capabilities, isLoading } = useMeasurementCapabilities();
  const { setCurrentMeasurement } = useAppStore();
  const [points, setPoints] = useState<CapturedPoint[]>([]);
  const [cuts, setCuts] = useState<number[]>([]);
  const [tracking, setTracking] = useState('idle');
  const [markers, setMarkers] = useState<Anchor[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [restart, setRestart] = useState(0);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const lock = useRef(false);
  const generation = useRef(0);
  const supported = Boolean(capabilities?.arSupported && capabilities.nativeMeasurementAvailable && isVolumeMeasurementArViewAvailable() && supportsMeasurementAnchors);
  const active = supported && camera.isCameraActive;
  const sectionStart = cuts.at(-1) ?? 0;
  const openCount = points.length - sectionStart;
  const hasPrismBase = shape === 'polygon_prism' && cuts.length === 1;
  const complete = isOutline ? shape === 'sectioned' ? cuts.length >= 2 && openCount === 0 : hasPrismBase && openCount === 2 : points.length === labels.length * 2;
  const canStartNextOutline = shape === 'sectioned' && complete && cuts.length < 16;

  useEffect(() => {
    const lifecycle = generation;
    const token = ++lifecycle.current;
    // A new native AR session invalidates all coordinates and in-flight captures.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(false);
    setTracking('idle');
    setPoints([]);
    setCuts([]);
    setMarkers([]);
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const native = getNativeMeasurementModule();
    void queueArOperation(async () => {
      if (generation.current !== token) return;
      await native.resetSession();
      const session = await native.startSession();
      if (generation.current !== token) return;
      if (!session.started) throw new Error(session.reason ?? 'Unable to start AR.');
      setReady(true);
      async function poll() {
        try {
          const state = await native.getTrackingState();
          const projected = Platform.OS === 'android' ? [] : await projectedAnchors();
          if (generation.current === token) { setTracking(state.status); setMarkers(projected); }
        } catch {
          if (generation.current === token) setTracking('limited');
        }
        if (generation.current === token) timer = setTimeout(() => { void poll(); }, Platform.OS === 'android' ? 350 : 50);
      }
      void poll();
    }).catch(e => { if (generation.current === token) setError(e instanceof Error ? e.message : 'AR session failed.'); });
    return () => {
      lifecycle.current++;
      if (timer) clearTimeout(timer);
      void queueArOperation(async () => { await clearAnchors(); await native.stopSession(); }).catch(() => {
        // The next session resets state again; teardown errors must not escape on unmount.
      });
    };
  }, [active, restart]);

  function run(action: (token: number) => Promise<void>) {
    if (lock.current || !active || !ready) return;
    lock.current = true; setBusy(true); setError('');
    const token = generation.current;
    void queueArOperation(async () => {
      if (token === generation.current) await action(token);
    }).catch(e => { if (token === generation.current) setError(e instanceof Error ? e.message : 'Measurement failed. Try again.'); })
      .finally(() => { lock.current = false; setBusy(false); });
  }

  async function capture(token: number) {
    if ((complete && !canStartNextOutline) || tracking !== 'tracking' || size.width === 0 || size.height === 0) return;
    if (isOutline && !hasPrismBase && openCount >= 64) throw new Error('Close this outline before capturing more points.');
    if (shape === 'sectioned' && cuts.length >= 16) throw new Error('Maximum 16 outlines. Calculate the volume or undo an outline.');
    const density = Platform.OS === 'android' ? PixelRatio.get() : 1;
    const native = getNativeMeasurementModule();
    const result = await native.getWorldPoint({ x: size.width * density / 2, y: size.height * density / 2 });
    if (generation.current !== token) return;
    if (!result.point) throw new Error(result.reason ?? 'No surface at the crosshair. Move slowly to reveal texture and try again.');
    const quality = result.quality?.measurementConfidence ?? 0;
    if (quality < 0.5 || result.quality?.qualityLevel === 'LOW') throw new Error('This point is unstable. Hold still, improve lighting, and capture again.');
    if ((await native.getTrackingState()).status !== 'tracking') throw new Error('Tracking changed during capture. Hold still and try again.');
    if (generation.current !== token) return;
    const p = result.point;
    const continuingEdge = isOutline ? !hasPrismBase || openCount === 1 : points.length % 2 === 1;
    if (points.length && continuingEdge) {
      const [last] = await resolvePoints([points.at(-1)!.id]);
      if (distance(last, p) < 0.005) throw new Error('Move the crosshair to a distinct point at least 5 mm away.');
    }
    if (generation.current !== token) return;
    if (isOutline && !hasPrismBase && openCount > 0) {
      const currentOutline = await resolvePoints(points.slice(sectionStart).map(point => point.id));
      const heights = [...currentOutline.map(point => point.yMeters), p.yMeters];
      if (Math.max(...heights) - Math.min(...heights) > 0.03) {
        throw new Error('Aim at the same horizontal height as the other points in this outline (within 3 cm).');
      }
    }
    if (generation.current !== token) return;
    const id = `point-${Date.now()}-${points.length}`;
    await anchorPoint(id, p);
    if (generation.current !== token) { await removeAnchor(id); return; }
    setPoints(current => [...current, { id, point: p, quality }]);
  }

  async function closeOutline(token: number) {
    const resolved = await resolvePoints(points.map(p => p.id));
    const outline = resolved.slice(sectionStart);
    const profile = horizontalSection(outline);
    if (cuts.length) {
      const previousStart = cuts.length > 1 ? cuts[cuts.length - 2] : 0;
      const previous = horizontalSection(resolved.slice(previousStart, sectionStart));
      if (profile.elevation - previous.elevation < 0.03) throw new Error('Capture this outline at least 3 cm above the previous one.');
    }
    if (generation.current !== token) return;
    setPoints(current => current.map((p, i) => ({ ...p, point: resolved[i] })));
    setCuts(current => [...current, points.length]);
  }

  async function calculate(token: number) {
    if (!complete || !capabilities || tracking !== 'tracking') return;
    const resolved = await resolvePoints(points.map(p => p.id));
    let geometry: ReturnType<typeof regularGeometry>;
    let sections: WorldPoint3D[][] | undefined;
    if (shape === 'polygon_prism') {
      const a = resolved[sectionStart], b = resolved[sectionStart + 1];
      if (Math.hypot(a.xMeters - b.xMeters, a.zMeters - b.zMeters) > Math.max(0.03, Math.abs(a.yMeters - b.yMeters) * 0.05)) {
        throw new Error('Height points must be directly above one another. Undo the last point and aim vertically above the bottom point.');
      }
      geometry = prismGeometry(resolved.slice(0, sectionStart), Math.abs(b.yMeters - a.yMeters));
      sections = (geometry as ReturnType<typeof prismGeometry>).sections;
    } else if (shape === 'sectioned') {
      sections = cuts.map((end, i) => resolved.slice(i ? cuts[i - 1] : 0, end));
      geometry = sectionedGeometry(sections);
    } else {
      geometry = regularArGeometry(shape, resolved);
    }
    if (generation.current !== token) return;
    const measurement = createSmartMeasurement({ shape, geometry, sections, source: 'ar_points',
      capabilities: toDeviceCapabilities(capabilities), quality: Math.min(...points.map(p => p.quality)) });
    await setCurrentMeasurement(measurement);
    if (generation.current === token) router.push('/result');
  }

  function undo() {
    run(async token => {
      if (cuts.at(-1) === points.length) { setCuts(current => current.slice(0, -1)); return; }
      const last = points.at(-1);
      if (last) await removeAnchor(last.id);
      if (generation.current === token) setPoints(current => current.slice(0, -1));
    });
  }

  const step = complete ? 'Ready to calculate' : hasPrismBase ? `Height · ${openCount ? 'top' : 'bottom'} point`
    : isOutline ? `Outline ${cuts.length + 1} · ${openCount} points` : `${labels[Math.floor(points.length / 2)]} · ${points.length % 2 ? 'second' : 'first'} endpoint`;
  return <Screen>
    <SectionHeader title={shapeLabels[shape]} subtitle="Fix points on the object, then move to reveal the next surface." />
    {camera.permissionState !== 'granted' ? <CameraAccess /> : null}
    {!supported ? <View style={styles.card}>
      <Text style={styles.title}>{isLoading ? 'Checking device…' : 'Tracked AR needs a development build'}</Text>
      <Text style={styles.body}>Use an ARCore or ARKit device and rebuild the app for tracked points. Photo measurements work with a known reference.</Text>
      <PrimaryButton label="Use Reference Photo" onPress={() => router.replace(`/photo-measure?shape=${isOutline ? 'cuboid' : shape}` as Href)} />
    </View> : null}
    {supported && camera.permissionState === 'granted' ? <>
      <View style={styles.preview} onLayout={e => setSize(e.nativeEvent.layout)}>
        <VolumeMeasurementArView active={active} style={StyleSheet.absoluteFill} />
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {markers.map(marker => marker.tracking && marker.screenX != null && marker.screenY != null ? <View key={marker.id}
            style={{ position: 'absolute', left: marker.screenX * size.width - 12, top: marker.screenY * size.height - 12,
              height: 24, width: 24, borderRadius: 12, backgroundColor: '#72DED1', borderWidth: 2, borderColor: 'white', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#102C35' }}>{points.findIndex(point => point.id === marker.id) + 1}</Text>
          </View> : null)}
        </View>
        <View pointerEvents="none" style={styles.reticle}><Text style={styles.reticleText}>+</Text></View>
        <Text style={styles.status}>{tracking === 'tracking' ? step : 'Move slowly to find surfaces'}</Text>
        <PrimaryButton disabled={!ready || busy || tracking !== 'tracking' || (complete && !canStartNextOutline)}
          label={busy ? 'Hold steady…' : canStartNextOutline ? 'Fix First Point of Next Outline' : 'Fix Point at Crosshair'}
          onPress={() => run(capture)} style={{ position: 'absolute', bottom: 14, left: 14, right: 14 }} />
      </View>
      <View style={styles.card}>
        <Text style={styles.step}>{step}</Text>
        <Text style={styles.body}>{isOutline && !hasPrismBase
          ? 'Walk around the object. Capture perimeter points in order at one horizontal height, including every corner or bend. Close the outline without repeating the first point.'
          : 'Aim the crosshair at the physical endpoint and hold still while capturing. You can walk to see the other endpoint. Check that the hit is on the object, not the background.'}</Text>
        {shape === 'sectioned' ? <Text style={styles.body}>Start at the lowest outline, work upwards, and finish at the highest surface. Add more outlines wherever the shape changes. This estimates a solid exterior; unseen holes and detail are not reconstructed.</Text> : null}
        {shape === 'polygon_prism' ? <Text style={styles.body}>For objects with vertical sides and a constant footprint. After the base, capture a bottom and top point directly above one another.</Text> : null}
        <Text style={styles.body}>{points.length} fixed points · {cuts.length} closed outlines</Text>
        <Text style={styles.body}>Leaving this screen or putting the app in the background clears an unfinished scan.</Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {isOutline && !hasPrismBase ? <PrimaryButton disabled={busy || tracking !== 'tracking' || openCount < 3} label="Close Outline" onPress={() => run(closeOutline)} variant="secondary" /> : null}
        {complete ? <PrimaryButton disabled={busy || tracking !== 'tracking'} label="Calculate Volume" onPress={() => run(calculate)} /> : null}
        {canStartNextOutline ? <Text style={styles.body}>To add another outline, aim at a higher perimeter and use the capture button on the camera before calculating.</Text> : null}
        <View style={styles.row}>
          <PrimaryButton disabled={busy || !points.length} label="Undo" onPress={undo} variant="secondary" style={styles.flex} />
          <PrimaryButton disabled={busy} label="Restart" onPress={() => { setError(''); setRestart(v => v + 1); }} variant="secondary" style={styles.flex} />
        </View>
      </View>
    </> : null}
    {error && !ready ? <Text style={styles.error}>{error}</Text> : null}
  </Screen>;
}
