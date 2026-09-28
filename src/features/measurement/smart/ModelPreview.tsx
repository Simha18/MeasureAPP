import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Measurement, WorldPoint3D } from '../types';

type WireModel = Pick<Measurement, 'shape' | 'dimensions' | 'model'>;
function modelSections(measurement: WireModel): WorldPoint3D[][] {
  if (measurement.model?.sections?.length) return measurement.model.sections;
  const { lengthMeters: l, widthMeters: w, heightMeters: h } = measurement.dimensions;
  if (measurement.shape === 'cuboid') return [0, h].map(y => [
    { xMeters: 0, yMeters: y, zMeters: 0 }, { xMeters: l, yMeters: y, zMeters: 0 },
    { xMeters: l, yMeters: y, zMeters: w }, { xMeters: 0, yMeters: y, zMeters: w },
  ]);
  return Array.from({ length: 9 }, (_, j) => {
    const t = j / 8;
    const scale = measurement.shape === 'cone' ? 1 - t : measurement.shape === 'cylinder' ? 1 : Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2));
    return Array.from({ length: 24 }, (_, i) => ({
      xMeters: l / 2 + Math.cos(i * Math.PI / 12) * l / 2 * scale,
      yMeters: t * h,
      zMeters: w / 2 + Math.sin(i * Math.PI / 12) * w / 2 * scale,
    }));
  });
}

export function ModelPreview({ measurement }: { measurement: WireModel }) {
  const [angle, setAngle] = useState(0.55);
  const [width, setWidth] = useState(300);
  const sections = modelSections(measurement);
  const all = sections.flat();
  if (!all.length) return null;
  const center = (key: keyof WorldPoint3D) => (Math.min(...all.map(p => p[key])) + Math.max(...all.map(p => p[key]))) / 2;
  const cx = center('xMeters'), cy = center('yMeters'), cz = center('zMeters');
  const project = (p: WorldPoint3D) => {
    const x = p.xMeters - cx, y = p.yMeters - cy, z = p.zMeters - cz;
    return { x: x * Math.cos(angle) - z * Math.sin(angle), y: -y * 0.88 + (x * Math.sin(angle) + z * Math.cos(angle)) * 0.46 };
  };
  const projected = all.map(project);
  const maxX = Math.max(...projected.map(p => Math.abs(p.x)), 0.001);
  const maxY = Math.max(...projected.map(p => Math.abs(p.y)), 0.001);
  const scale = Math.min((width - 56) / (maxX * 2), 178 / (maxY * 2));
  const lines: [WorldPoint3D, WorldPoint3D][] = [];
  sections.forEach((section, s) => section.forEach((p, i) => {
    lines.push([p, section[(i + 1) % section.length]]);
    // Only connect corresponding vertices for generated primitives/prisms.
    if (s > 0 && measurement.shape !== 'sectioned' && sections[s - 1].length === section.length) {
      lines.push([p, sections[s - 1][i]]);
    }
  }));
  return <View style={styles.card}>
    <Text style={styles.title}>{measurement.shape === 'sectioned' ? 'Sampled cross-sections' : 'Measured shape'}</Text>
    <View accessibilityLabel="Rotatable wireframe of the measured shape" onLayout={e => setWidth(e.nativeEvent.layout.width)} style={styles.canvas}>
      {lines.map(([a, b], i) => {
        const p = project(a), q = project(b);
        const dx = (q.x - p.x) * scale, dy = (q.y - p.y) * scale, length = Math.hypot(dx, dy);
        return <View key={i} style={[styles.line, { width: length, left: width / 2 + p.x * scale + dx / 2 - length / 2,
          top: 110 + p.y * scale + dy / 2, transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }] }]} />;
      })}
    </View>
    <View style={styles.controls}>
      <Pressable accessibilityRole="button" accessibilityLabel="Rotate model left" onPress={() => setAngle(a => a - 0.35)} style={styles.button}><Text style={styles.buttonText}>↶ Rotate</Text></Pressable>
      <Text style={styles.caption}>Shape approximation</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Rotate model right" onPress={() => setAngle(a => a + 0.35)} style={styles.button}><Text style={styles.buttonText}>Rotate ↷</Text></Pressable>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  card: { borderRadius: 16, backgroundColor: '#102C35', padding: 16, gap: 8 },
  title: { color: '#E4F5F4', fontSize: 16, fontWeight: '700' }, canvas: { height: 220, overflow: 'hidden' },
  line: { position: 'absolute', height: 1.4, backgroundColor: '#72DED1' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  button: { paddingVertical: 12, paddingHorizontal: 6 }, buttonText: { color: '#A8E9E2', fontWeight: '700' },
  caption: { color: '#A2BABD', fontSize: 11 },
});
