import { useEffect, type ReactNode } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, SplashScreen } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppStateProvider, useAppState } from '../src/AppState';
import { DarkEdgeChrome } from '../src/DarkEdgeChrome';
import { EaBlurWallpaper } from '../src/EaBlurWallpaper';
import { hydrateSupabaseConfig } from '../src/supabase/client';

/** Keep initial route stable — avoid remount loops / blank first frame. */
export const unstable_settings = {
  initialRouteName: 'index',
};

// Hold native splash until AppState hydrate finishes (no white/blank flash).
SplashScreen.preventAutoHideAsync().catch(() => {});

const BLACK = '#000000';

const EdgesDark = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    // Native ScreenStack uses theme.background for nativeContainerStyle.
    // Must be black (not transparent) — transparent/unset flashes white on iOS.
    background: BLACK,
    // Cards stay transparent so each screen's wallpaper / root underlay shows.
    card: 'transparent',
    border: 'transparent',
  },
};

const SLIDE = {
  headerShown: false,
  animation: 'slide_from_right' as const,
  animationDuration: 280,
  animationTypeForReplace: 'push' as const,
  // Transparent cards: wallpaper under stack + per-screen wallpaper show through.
  contentStyle: { backgroundColor: 'transparent' },
  freezeOnBlur: true,
  // Web native-stack falls back to display toggling; keep card paint black-safe.
  ...(Platform.OS === 'web'
    ? { animation: 'fade' as const, animationDuration: 160 }
    : null),
};

function SplashGate({ children }: { children: ReactNode }) {
  const { accessReady } = useAppState();
  useEffect(() => {
    if (!accessReady) return;
    SplashScreen.hideAsync().catch(() => {});
  }, [accessReady]);
  return <>{children}</>;
}

export default function RootLayout() {
  useEffect(() => {
    void hydrateSupabaseConfig();
  }, []);

  return (
    <SafeAreaProvider>
      <AppStateProvider>
        <ThemeProvider value={EdgesDark}>
          <DarkEdgeChrome>
            <SplashGate>
              {/* Persistent black + wallpaper under stack — never a white card. */}
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
            </SplashGate>
          </DarkEdgeChrome>
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: BLACK,
  },
});
