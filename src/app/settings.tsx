import { StyleSheet, Text, View } from 'react-native';

import { OptionSelector, Screen, SectionHeader } from '@/components';
import {
  measurementUnitOptions,
  volumeUnitOptions,
  type MeasurementUnit,
  type VolumeUnit,
} from '@/features/measurement';
import { useAppStore } from '@/store';
import { colors, spacing, typography } from '@/theme';

export default function SettingsScreen() {
  const { settings, updateSettings } = useAppStore();

  async function handleLengthUnitChange(preferredLengthUnit: MeasurementUnit) {
    await updateSettings({ preferredLengthUnit });
  }

  async function handleVolumeUnitChange(preferredVolumeUnit: VolumeUnit) {
    await updateSettings({ preferredVolumeUnit });
  }

  return (
    <Screen>
      <SectionHeader
        title="Settings"
        subtitle="Preferred units are stored locally and applied across result and history screens."
      />

      <View style={styles.card}>
        <OptionSelector
          label="Preferred length unit"
          onChange={handleLengthUnitChange}
          options={measurementUnitOptions}
          value={settings.preferredLengthUnit}
        />
        <OptionSelector
          label="Preferred volume unit"
          onChange={handleVolumeUnitChange}
          options={volumeUnitOptions}
          value={settings.preferredVolumeUnit}
        />
      </View>

      <View style={styles.noteCard}>
        <Text style={styles.noteTitle}>Native AR status</Text>
        <Text style={styles.noteText}>
          Native AR is available in custom builds when the device supports ARCore or ARKit.
          Auto box detection is experimental and only assists corner selection; AR/depth points
          remain the source of measurement.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.md,
  },
  noteCard: {
    backgroundColor: '#EEF8F3',
    borderColor: '#ABEFC6',
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  noteText: {
    color: colors.mutedText,
    fontSize: typography.body,
    lineHeight: 22,
  },
  noteTitle: {
    color: colors.success,
    fontSize: typography.subtitle,
    fontWeight: '800',
  },
});
