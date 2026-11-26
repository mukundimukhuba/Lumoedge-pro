import { BlurView } from 'expo-blur';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppState } from './AppState';

const BASE = {
  black: '#000000',
  muted: '#8B8B8B',
};

export type DockTab = 'home' | 'scanner' | 'broker';

const TABS: {
  id: DockTab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: '/' | '/chart-scanner' | '/connect-broker';
}[] = [
  { id: 'home', label: 'Home', icon: 'home-outline', href: '/' },
  {
    id: 'scanner',
    label: 'Chart scanner',
    icon: 'scan-outline',
    href: '/chart-scanner',
  },
  {
    id: 'broker',
    label: 'Connect your broker',
    icon: 'link-outline',
    href: '/connect-broker',
  },
];

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function dockTabFromPath(pathname: string | null | undefined): DockTab {
  const p = pathname || '';
  if (p.includes('chart-scanner')) return 'scanner';
  if (p.includes('connect-broker')) return 'broker';
  return 'home';
}

/**
 * Stable bottom dock: Home → /, Chart scanner → /chart-scanner,
 * Connect → /connect-broker. Always uses replace() so back-stack never
 * swaps destinations. Active tab follows the current pathname.
 */
export function EdgesBottomDock({
  onHomeRetap,
}: {
  /** Called when Home is pressed while already on EA home (e.g. close sheets). */
  onHomeRetap?: () => void;
} = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { accent } = useAppState();
  const active = dockTabFromPath(pathname);
  const dockPad = Math.max(insets.bottom, Platform.OS === 'web' ? 12 : 8);

  const go = (tab: DockTab) => {
    if (tab === active) {
      if (tab === 'home') onHomeRetap?.();
      return;
    }
    const href = TABS.find((t) => t.id === tab)!.href;
    router.replace(href);
  };

  return (
    <View
      style={[
        styles.dock,
        {
          paddingBottom: dockPad,
          borderColor: hexToRgba(accent, 0.35),
        },
      ]}
      pointerEvents="box-none"
    >
      {Platform.OS === 'web' ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: 'rgba(0,0,0,0.72)' },
          ]}
        />
      ) : (
        <BlurView
          pointerEvents="none"
          intensity={40}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
      )}
      <View style={styles.dockRow}>
        {TABS.map((tab) => {
          const on = active === tab.id;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="button"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: on }}
              testID={`dock-${tab.id}`}
              // @ts-expect-error web-only active marker for proofs / QA
              dataSet={{ active: on ? '1' : '0', dock: tab.id }}
              onPress={() => go(tab.id)}
              style={styles.dockItem}
            >
              <Ionicons
                name={tab.icon}
                size={22}
                color={on ? accent : BASE.muted}
              />
              <Text
                style={[
                  styles.dockLabel,
                  { color: on ? accent : BASE.muted },
                ]}
                numberOfLines={2}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  dockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: 10,
    paddingHorizontal: 8,
    zIndex: 2,
  },
  dockItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingBottom: 4,
    minHeight: 44,
    justifyContent: 'center',
  },
  dockLabel: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
});
