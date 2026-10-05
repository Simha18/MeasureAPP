import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { OptionSelector, PrimaryButton, Screen, SectionHeader } from '@/components';
import { useMeasurementCapabilities, type MeasurementShape } from '@/features/measurement';
import { supportsMeasurementAnchors } from '@/features/measurement/smart/anchors';
import { shapeLabels } from '@/features/measurement/smart/geometry';
import { smartStyles as styles } from '@/features/measurement/smart/styles';

export default function MeasureScreen() {
  const { capabilities, isLoading } = useMeasurementCapabilities();
  const [shape, setShape] = useState<MeasurementShape>('cuboid');
  const outline = shape === 'polygon_prism' || shape === 'sectioned';
  const canAr = Boolean(capabilities?.arSupported && capabilities.nativeMeasurementAvailable && supportsMeasurementAnchors);
  return <Screen>
    <SectionHeader title="What are you measuring?" subtitle="Auto-detect geometry with the camera or choose a shape below." />

    <View style={[styles.card, { backgroundColor: '#0F172A', borderColor: '#38BDF8', borderWidth: 1.5 }]}>
      <Text style={[styles.step, { color: '#38BDF8' }]}>RECOMMENDED: AUTO SHAPE DETECTION</Text>
      <Text style={[styles.title, { color: '#FFFFFF' }]}>Auto-Detect Shape & Dimensions</Text>
      <Text style={[styles.body, { color: '#94A3B8' }]}>
        Point the camera at any physical object. The system automatically classifies whether it is a Square,
        Rectangle, Cylinder, Circle, or Box, and calculates Height, Width, Radius, Perimeter, Area & Volume.
      </Text>
      <PrimaryButton label="⚡ Launch Smart Shape Scanner" onPress={() => router.push('/auto-scan' as Href)} />
    </View>

    <OptionSelector label="Or manually select an object shape" value={shape} onChange={setShape}
      options={(Object.keys(shapeLabels) as MeasurementShape[]).map(value => ({ value, label: shapeLabels[value] }))} />
    <View style={styles.card}>
      <Text style={styles.step}>{outline ? 'WALK AROUND THE OBJECT' : 'GUIDED AR MEASUREMENT'}</Text>
      <Text style={styles.title}>{outline ? 'Fix an outline in 3D' : 'Fix points. Move. Measure.'}</Text>
      <Text style={styles.body}>{shape === 'sectioned'
        ? 'Trace horizontal outlines from bottom to top. The app estimates the volume between them. Add sections where the shape changes; inspect the sampled model before saving.'
        : shape === 'polygon_prism'
          ? 'Walk around the base and fix every corner. Close the outline, then measure the vertical height. Useful for large objects with a constant footprint, including L-shaped objects.'
          : 'Aim at the endpoints of each dimension. Tracked points stay fixed while you move around the object, so both ends do not need to fit in one view.'}</Text>
      <Text style={styles.body}>{isLoading ? 'Checking AR support...' : canAr
        ? `AR ready${capabilities?.depthSupported ? ' / depth supported' : ' / surface tracking'}`
        : 'Requires a supported AR device and a development build with tracked points.'}</Text>
      <PrimaryButton disabled={isLoading || !canAr} label={outline ? 'Start Walk-Around' : 'Start AR Measurement'} onPress={() => router.push(`/smart-scan?shape=${shape}` as Href)} />
    </View>
    {!outline ? <>
      <View style={styles.card}>
        <Text style={styles.step}>CAMERA + KNOWN REFERENCE</Text>
        <Text style={styles.title}>Measure edges in a photo</Text>
        <Text style={styles.body}>Place a known length beside the edge, face it straight on, capture a photo, and mark the endpoints. Repeat for each required dimension. Works without AR.</Text>
        <PrimaryButton label="Start Reference Photo" onPress={() => router.push(`/photo-measure?shape=${shape}` as Href)} />
      </View>
      <PrimaryButton label="Enter Known Dimensions" variant="secondary" onPress={() => router.push(`/photo-measure?shape=${shape}&mode=manual` as Href)} />
    </> : <Text style={styles.body}>Outlines require tracked 3D points. If AR is unavailable, choose a regular shape and measure its dimensions using reference photos or a ruler.</Text>}
    {shape === 'cuboid' && capabilities?.platform === 'ios' && capabilities.nativeMeasurementAvailable ? <PrimaryButton label="Try Experimental Box Edge Assist" variant="secondary" onPress={() => router.push('/scan?assist=1' as Href)} /> : null}
    <View style={styles.card}>
      <Text style={styles.title}>Choose a model that fits</Text>
      <Text style={styles.body}>A photo alone cannot reveal hidden depth or cavities. These methods estimate a solid exterior from measured dimensions or outlines. Transparent, reflective, moving and deformable objects can produce unreliable surface hits. Check against a known size before relying on a result.</Text>
    </View>
  </Screen>;
}
