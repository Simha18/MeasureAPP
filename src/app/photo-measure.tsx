import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { OptionSelector, PrimaryButton, Screen, SectionHeader } from '@/components';
import { CameraPreview, CameraProvider, useCameraContext, type CameraPreviewHandle, type CameraSnapshot } from '@/features/camera';
import { measurementUnitOptions, toMeters, type MeasurementUnit } from '@/features/measurement';
import { CameraAccess } from '@/features/measurement/smart/CameraAccess';
import { createSmartMeasurement } from '@/features/measurement/smart/createMeasurement';
import { dimensionLabels, referenceDistance, regularGeometry, shapeLabels, type Point2, type RegularShape } from '@/features/measurement/smart/geometry';
import { smartStyles as styles } from '@/features/measurement/smart/styles';
import { useAppStore } from '@/store';

export default function PhotoMeasureScreen() {
  const params = useLocalSearchParams<{ shape?: string; mode?: string }>();
  return <CameraProvider><PhotoMeasurement key={`${params.shape ?? 'cuboid'}-${params.mode ?? 'photo'}`} /></CameraProvider>;
}
function PhotoMeasurement() {
  const params = useLocalSearchParams<{ shape?: string; mode?: string }>();
  const shape: RegularShape = params.shape && Object.hasOwn(dimensionLabels, params.shape) ? params.shape as RegularShape : 'cuboid';
  const manual = params.mode === 'manual';
  const labels = dimensionLabels[shape];
  const camera = useCameraContext();
  const ref = useRef<CameraPreviewHandle>(null);
  const lock = useRef(false);
  const generation = useRef(0);
  const { setCurrentMeasurement } = useAppStore();
  const [photo, setPhoto] = useState<CameraSnapshot>();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [unit, setUnit] = useState<MeasurementUnit>('centimeter');
  const [referenceLength, setReferenceLength] = useState('');
  const [points, setPoints] = useState<Point2[]>([]);
  const [values, setValues] = useState<number[]>([]);
  const [entries, setEntries] = useState<string[]>(labels.map(() => ''));
  const [photoSize, setPhotoSize] = useState({ width: 0, height: 0 });
  const done = values.length === labels.length;

  useEffect(() => {
    const lifecycle = generation;
    lifecycle.current++;
    // Native camera remounts after backgrounding; readiness belongs to that camera instance.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!camera.isCameraActive) setReady(false);
    return () => { lifecycle.current++; };
  }, [camera.isCameraActive]);

  async function run(action: (token: number) => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(generation.current); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to measure. Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function capture(token: number) {
    const captured = await ref.current?.captureFrame({ quality: 0.9, maxDownsampling: 1 });
    if (generation.current !== token) return;
    if (!captured) throw new Error('Camera is not ready. Wait and retry.');
    setPhoto(captured); setPoints([]); setPhotoSize({ width: 0, height: 0 }); setReady(false);
  }
  function useEdge() {
    if (!photo) return;
    try {
      const length = referenceDistance(points, photo.width / photo.height, toMeters(Number(referenceLength), unit));
      setValues(current => [...current, length]); setPhoto(undefined); setPoints([]); setReferenceLength(''); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Check the reference and endpoints.'); }
  }
  async function calculate(token: number) {
    const dimensions = manual ? entries.map(entry => toMeters(Number(entry), unit)) : values;
    const measurement = createSmartMeasurement({ shape, geometry: regularGeometry(shape, dimensions),
      source: manual ? 'entered_dimensions' : 'reference_photo', capabilities: {
        hasARCore: false, hasARKit: false, hasCamera: camera.permissionState === 'granted', hasDepthSensor: false,
        hasLiDAR: false, supportsWorldTracking: false, platform: Platform.OS === 'android' || Platform.OS === 'ios' || Platform.OS === 'web' ? Platform.OS : 'unknown',
      } });
    await setCurrentMeasurement(measurement);
    if (generation.current === token) router.push('/result');
  }
  const pointLabels = ['R1', 'R2', 'A', 'B'];
  return <Screen>
    <SectionHeader title={`${shapeLabels[shape]} · ${manual ? 'Enter dimensions' : 'Reference photo'}`}
      subtitle={manual ? 'Enter known physical dimensions to calculate a shape-based volume.' : 'Measure each dimension against a known length in the same photo.'} />
    {manual ? <View style={styles.card}>
      <OptionSelector label="Input unit" options={measurementUnitOptions} value={unit} onChange={setUnit} />
      {labels.map((label, i) => <View key={label} style={{ gap: 6 }}>
        <Text style={styles.body}>{label}</Text>
        <TextInput accessibilityLabel={label} keyboardType="decimal-pad" value={entries[i]} onChangeText={text => setEntries(current => current.map((v, j) => i === j ? text : v))} style={styles.input} placeholder="0" />
      </View>)}
    </View> : <>
      {!done ? <View style={styles.card}>
        <Text style={styles.step}>DIMENSION {values.length + 1} OF {labels.length} · {labels[values.length]}</Text>
        <Text style={styles.body}>Place a ruler or another known length beside the edge you are measuring, in the same plane. Face that plane straight on. Take a new photo with its own reference for every dimension.</Text>
        <Text style={styles.body}>Mark edges manually on the captured photo. Pixel sizes become physical lengths only after setting the reference. Avoid tilted views, reflections and hidden endpoints.</Text>
      </View> : null}
      {!done && !photo && camera.permissionState !== 'granted' ? <CameraAccess /> : null}
      {!done && !photo && camera.permissionState === 'granted' ? <>
        <CameraPreview facing="back" isActive={camera.isCameraActive} ref={ref} onCameraReady={() => setReady(true)} onMountError={message => { setReady(false); setError(message); }} />
        <PrimaryButton disabled={!ready || busy || !camera.isCameraActive} label={busy ? 'Capturing…' : 'Capture Photo'} onPress={() => { void run(capture); }} />
      </> : null}
      {photo ? <>
        <Text style={styles.title}>{points.length < 2 ? `Tap reference endpoint ${points.length + 1}` : points.length < 4 ? `Tap ${labels[values.length].toLowerCase()} endpoint ${points.length - 1}` : 'Review the four endpoints'}</Text>
        <Pressable accessibilityLabel="Photo: tap two reference endpoints, then two object endpoints" disabled={points.length >= 4 || busy}
          onLayout={e => setPhotoSize(e.nativeEvent.layout)}
          onPress={e => {
            if (!photoSize.width || !photoSize.height) return;
            const { locationX, locationY } = e.nativeEvent;
            setPoints(current => current.length < 4 ? [...current, { x: Math.max(0, Math.min(1, locationX / photoSize.width)), y: Math.max(0, Math.min(1, locationY / photoSize.height)) }] : current);
          }} style={{ width: '100%', aspectRatio: photo.width / photo.height, backgroundColor: '#102C35', overflow: 'hidden', borderRadius: 12 }}>
          <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" onError={() => { setError('Photo could not be loaded. Retake this dimension.'); setPhoto(undefined); setPoints([]); }} />
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {[0, 2].map(start => {
              if (!points[start + 1]) return null;
              const a = points[start], b = points[start + 1];
              const dx = (b.x - a.x) * photoSize.width, dy = (b.y - a.y) * photoSize.height, length = Math.hypot(dx, dy);
              return <View key={start} style={{ position: 'absolute', height: 2, backgroundColor: start ? '#72DED1' : '#FFC96B', width: length,
                left: a.x * photoSize.width + dx / 2 - length / 2, top: a.y * photoSize.height + dy / 2, transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }] }} />;
            })}
            {points.map((p, i) => <View key={i} style={{ position: 'absolute', left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: 28, height: 28,
              marginLeft: -14, marginTop: -14, backgroundColor: i < 2 ? '#FFC96B' : '#72DED1', borderColor: 'white', borderWidth: 2, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#102C35', fontWeight: '800', fontSize: 11 }}>{pointLabels[i]}</Text>
            </View>)}
          </View>
        </Pressable>
        <View style={styles.card}>
          <Text style={styles.body}>Known distance between R1 and R2</Text>
          <TextInput accessibilityLabel="Known reference length" value={referenceLength} onChangeText={setReferenceLength} keyboardType="decimal-pad" placeholder="Enter the actual reference length" style={styles.input} />
          <OptionSelector label="Reference unit" options={measurementUnitOptions} value={unit} onChange={setUnit} />
          <PrimaryButton disabled={points.length !== 4 || busy || !referenceLength.trim()} label={`Use ${labels[values.length]}`} onPress={useEdge} />
          <View style={styles.row}>
            <PrimaryButton disabled={!points.length || busy} label="Undo Point" onPress={() => setPoints(current => current.slice(0, -1))} variant="secondary" style={styles.flex} />
            <PrimaryButton disabled={busy} label="Retake" onPress={() => { setPhoto(undefined); setPoints([]); setError(''); }} variant="secondary" style={styles.flex} />
          </View>
        </View>
      </> : null}
      {values.length ? <View style={styles.card}>
        <Text style={styles.title}>Measured dimensions</Text>
        {values.map((v, i) => <Text style={styles.body} key={i}>{labels[i]}: {(v * 100).toFixed(2)} cm</Text>)}
        <PrimaryButton disabled={busy} label="Redo Last Dimension" variant="secondary" onPress={() => { setValues(current => current.slice(0, -1)); setPhoto(undefined); setPoints([]); setReferenceLength(''); setError(''); }} />
      </View> : null}
    </>}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {manual || done ? <PrimaryButton disabled={busy} label={busy ? 'Calculating…' : 'Calculate Volume'} onPress={() => { void run(calculate); }} /> : null}
  </Screen>;
}
