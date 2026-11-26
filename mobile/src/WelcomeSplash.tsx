import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SplashScreen } from 'expo-router';
import { useAppState } from './AppState';

const BLACK = '#000000';
const WELCOME = 'Welcome to Lumo Edge Pro';
const MIN_VISIBLE_MS = 1600;
const FADE_OUT_MS = 420;
/** Never leave users stuck on the bounce overlay (Safari / hung hydrate). */
const MAX_VISIBLE_MS = 4500;

const mascot = require('../assets/splash-mascot.png');

/** Public marketing / claim deep links — never block with the boot splash. */
export function isGiveawayPath(pathname?: string): boolean {
  if (Platform.OS !== 'web') return false;
  const p =
    pathname ||
    (typeof window !== 'undefined' ? window.location?.pathname || '' : '');
  return /^\/giveaway(\/|$)/i.test(p);
}

function removeHtmlBoot() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  document.getElementById('lumo-boot-splash')?.remove();
}

/**
 * Boot splash: bouncing mascot + welcome copy, then reveal the app.
 * Skipped entirely on `/giveaway/*`. Always auto-dismisses by MAX_VISIBLE_MS.
 */
export function WelcomeSplash({ children }: { children: ReactNode }) {
  const skipSplash = isGiveawayPath();
  const { accessReady } = useAppState();
  const [dismissed, setDismissed] = useState(skipSplash);
  const [canExit, setCanExit] = useState(skipSplash);

  const opacity = useRef(new Animated.Value(1)).current;
  const bounce = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textY = useRef(new Animated.Value(10)).current;
  const startedAt = useRef(Date.now());
  const exiting = useRef(skipSplash);

  const beginExit = () => {
    if (exiting.current) return;
    exiting.current = true;
    const elapsed = Date.now() - startedAt.current;
    const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
    const run = () => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_OUT_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        removeHtmlBoot();
        setDismissed(true);
      });
    };
    if (wait === 0) run();
    else setTimeout(run, wait);
  };

  // Drop native splash. Kill HTML boot immediately on giveaway deep links.
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    if (skipSplash) removeHtmlBoot();
  }, [skipSplash]);

  useEffect(() => {
    if (skipSplash || dismissed) return;

    const bounceLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, {
          toValue: 1,
          duration: 520,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(bounce, {
          toValue: 0,
          duration: 520,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    bounceLoop.start();

    Animated.parallel([
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 480,
        delay: 180,
        useNativeDriver: true,
      }),
      Animated.timing(textY, {
        toValue: 0,
        duration: 480,
        delay: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const minTimer = setTimeout(() => setCanExit(true), MIN_VISIBLE_MS);
    // Hard ceiling — dismiss even if accessReady never flips.
    const maxTimer = setTimeout(() => {
      setCanExit(true);
      beginExit();
    }, MAX_VISIBLE_MS);

    return () => {
      bounceLoop.stop();
      clearTimeout(minTimer);
      clearTimeout(maxTimer);
    };
    // beginExit is stable enough via refs; intentionally omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipSplash, dismissed, bounce, textOpacity, textY]);

  useEffect(() => {
    if (skipSplash || !accessReady || !canExit || dismissed) return;
    beginExit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipSplash, accessReady, canExit, dismissed]);

  useEffect(() => {
    if (dismissed) removeHtmlBoot();
  }, [dismissed]);

  if (dismissed || skipSplash) return <>{children}</>;

  const translateY = bounce.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -18],
  });
  const scale = bounce.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
  });

  return (
    <View style={styles.root} pointerEvents="box-none">
      {children}
      <Animated.View
        style={[styles.overlay, { opacity }]}
        pointerEvents="auto"
        accessibilityRole="progressbar"
        accessibilityLabel={WELCOME}
      >
        <Animated.View style={{ transform: [{ translateY }, { scale }] }}>
          <Image
            source={mascot}
            style={styles.mascot}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        </Animated.View>
        <Animated.View
          style={{
            opacity: textOpacity,
            transform: [{ translateY: textY }],
          }}
        >
          <Text style={styles.title}>{WELCOME}</Text>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BLACK,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: BLACK,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    paddingHorizontal: 28,
  },
  mascot: {
    width: 168,
    height: 168,
    marginBottom: 22,
  },
  title: {
    color: '#F3F4F6',
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
});
