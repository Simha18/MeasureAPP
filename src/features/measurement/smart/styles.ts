import { StyleSheet } from 'react-native';
import { colors } from '@/theme';
export const smartStyles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 16, gap: 12 },
  title: { color: colors.text, fontSize: 19, fontWeight: '800' },
  body: { color: colors.mutedText, fontSize: 15, lineHeight: 23 },
  step: { color: colors.accent, fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  error: { color: colors.danger, fontSize: 15, lineHeight: 22 },
  input: { color: colors.text, backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: 14, fontSize: 18 },
  row: { flexDirection: 'row', gap: 10 }, flex: { flex: 1 },
  preview: { aspectRatio: 3 / 4, backgroundColor: '#102C35', borderRadius: 14, overflow: 'hidden' },
  reticle: { position: 'absolute', left: '50%', top: '50%', marginLeft: -18, marginTop: -18, width: 36, height: 36,
    borderRadius: 18, borderWidth: 2, borderColor: '#72DED1', alignItems: 'center', justifyContent: 'center' },
  reticleText: { color: 'white', fontSize: 22 },
  status: { position: 'absolute', top: 14, alignSelf: 'center', color: 'white', backgroundColor: '#102C35DD', padding: 10, borderRadius: 8, fontSize: 13 },
});
