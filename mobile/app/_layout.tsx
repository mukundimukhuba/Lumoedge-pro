import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppStateProvider } from '../src/AppState';
import { DarkEdgeChrome } from '../src/DarkEdgeChrome';
import { EaBlurWallpaper } from '../src/EaBlurWallpaper';
import { hydrateSupabaseConfig } from '../src/supabase/client';

const EdgesDark = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    // Transparent so the persistent wallpaper shows through during
    // slide transitions (avoids white/black empty flash).
    background: 'transparent',
    card: 'transparent',
    border: 'transparent',
  },
};

const SLIDE = {
  headerShown: false,
  animation: 'slide_from_right' as const,
  animationDuration: 280,
  animationTypeForReplace: 'push' as const,
  contentStyle: { backgroundColor: 'transparent' },
  freezeOnBlur: true,
};

export default function RootLayout() {
  useEffect(() => {
    void hydrateSupabaseConfig();
  }, []);

  return (
    <SafeAreaProvider>
      <AppStateProvider>
        <ThemeProvider value={EdgesDark}>
          <DarkEdgeChrome>
            {/* Persistent wallpaper — last frame / splash while pages push. */}
            <View style={styles.shell} pointerEvents="box-none">
              <EaBlurWallpaper />
              <Stack screenOptions={SLIDE}>
                <Stack.Screen
                  name="index"
                  options={{
                    ...SLIDE,
                    // Returning home: soft fade keeps wallpaper; no blank card.
                    animation: 'fade',
                    animationDuration: 180,
                  }}
                />
                <Stack.Screen name="quotes" options={SLIDE} />
                <Stack.Screen name="chart-scanner" options={SLIDE} />
                <Stack.Screen name="connect-broker" options={SLIDE} />
                <Stack.Screen
                  name="portal"
                  options={{
                    headerShown: false,
                    animation: 'slide_from_right',
                    contentStyle: { backgroundColor: '#05070D' },
                  }}
                />
              </Stack>
            </View>
          </DarkEdgeChrome>
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
