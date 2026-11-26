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

function removeHtmlBoot() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  document.getElementById('lumo-boot-splash')?.remove();
}

/**
 * Boot splash for the main PWA only.
 * Secret giveaway lives on static /g/rcg-* HTML (never mounts this component).
 * Always auto-dismisses by MAX_VISIBLE_MS so Safari/hydrate hangs cannot trap.
 */
export function WelcomeSplash({ children }: { children: ReactNode }) {
  const { accessReady } = useAppState();
  const [dismissed, setDismissed] = useState(false);
  const [canExit, setCanExit] = useState(false);

  const opacity = useRef(new Animated.Value(1)).current;
  const bounce = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textY = useRef(new Animated.Value(10)).current;
  const startedAt = useRef(Date.now());
  const exiting = useRef(false);

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

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    if (dismissed) return;

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
    const maxTimer = setTimeout(() => {
      setCanExit(true);
      beginExit();
    }, MAX_VISIBLE_MS);

    return () => {
      bounceLoop.stop();
      clearTimeout(minTimer);
      clearTimeout(maxTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dismissed, bounce, textOpacity, textY]);

  useEffect(() => {
    if (!accessReady || !canExit || dismissed) return;
    beginExit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessReady, canExit, dismissed]);

  useEffect(() => {
    if (dismissed) removeHtmlBoot();
  }, [dismissed]);

  if (dismissed) return <>{children}</>;

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
