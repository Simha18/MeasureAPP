import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppStoreProvider } from '@/store';
import { colors } from '@/theme';

export default function RootLayout() {
  return (
    <AppStoreProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTitleStyle: {
            color: colors.text,
            fontSize: 18,
            fontWeight: '700',
          },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Home' }} />
        <Stack.Screen name="calibration" options={{ title: 'Calibration Test' }} />
        <Stack.Screen name="measure" options={{ title: 'Measure' }} />
        <Stack.Screen name="auto-scan" options={{ title: 'Smart Shape Scanner' }} />
        <Stack.Screen name="scan" options={{ title: 'Box Edge Assist' }} />
        <Stack.Screen name="smart-scan" options={{ title: 'AR Measurement' }} />
        <Stack.Screen name="photo-measure" options={{ title: 'Measure Dimensions' }} />
        <Stack.Screen name="result" options={{ title: 'Measurement Result' }} />
        <Stack.Screen name="history" options={{ title: 'History' }} />
        <Stack.Screen name="history/[measurementId]" options={{ title: 'Measurement Details' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </AppStoreProvider>
  );
}
