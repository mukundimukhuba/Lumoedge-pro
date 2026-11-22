import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppStateProvider } from '../src/AppState';
import { DarkEdgeChrome } from '../src/DarkEdgeChrome';

const EdgesDark = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#000000',
    card: '#000000',
    border: '#000000',
  },
};

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppStateProvider>
        <ThemeProvider value={EdgesDark}>
          <DarkEdgeChrome>
            <Stack
              screenOptions={{
                headerShown: false,
                // Avoid fade-through-black flash when switching dock tabs
                animation: 'none',
                contentStyle: { backgroundColor: '#000000' },
                animationDuration: 0,
              }}
            />
          </DarkEdgeChrome>
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}
