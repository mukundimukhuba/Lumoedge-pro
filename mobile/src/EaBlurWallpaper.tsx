/**
 * iPhone-style full-screen EA wallpaper: cover-fit, ~60% blur, desaturated
 * so neon UI stays readable. Sits behind sharp heroes / glass panels.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import {
  Image,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useAppState } from './AppState';
import { eaPictureImageSource } from './eaPicture';

const fallbackMascot = require('../assets/mascot.jpg');

/** ~60% blur: native blurRadius + web CSS blur(px). */
const BLUR_RADIUS = 28;
/** Remaining colour after desaturation (~40% sat ≈ 60% desaturated). */
const WEB_SATURATE = 0.4;
/** Dark scrim so white/red UI stays readable over the photo. */
const SCRIM = 'rgba(0,0,0,0.52)';

function isUsablePictureUri(uri: string | null | undefined): uri is string {
  return (
    !!uri &&
    (uri.startsWith('data:') ||
      uri.startsWith('blob:') ||
      uri.startsWith('http') ||
      uri.startsWith('file:') ||
      uri.startsWith('/'))
  );
}

/** Resolve active EA picture (or mascot fallback) for wallpaper / hero sharing. */
export function useActiveEaPictureSource(
  layout?: { width: number; height: number },
): {
  source: ImageSourcePropType;
  uri: string | null;
} {
  const { activeEa } = useAppState();
  const { width, height } = useWindowDimensions();
  const raw = isUsablePictureUri(activeEa?.pictureUri)
    ? activeEa.pictureUri
    : null;
  const frame = layout ?? { width: Math.max(1, width), height: Math.max(1, height) };
  const source = useMemo<ImageSourcePropType>(() => {
    if (!raw) return fallbackMascot;
    return eaPictureImageSource(raw, frame);
  }, [raw, frame.width, frame.height]);
  return { source, uri: raw };
}

type Props = {
  /** Override picture; defaults to active EA / mascot. */
  source?: ImageSourcePropType | null;
  /** Optional raw URI for sharper web <img> path (same as hero). */
  uri?: string | null;
  style?: StyleProp<ViewStyle>;
  /** Extra darken (0–1) on top of default scrim — for dense text screens. */
  darken?: number;
};

/**
 * Absolute-fill blurred + desaturated cover wallpaper.
 * pointerEvents="none" — never steals taps from UI above.
 */
export function EaBlurWallpaper({
  source,
  uri,
  style,
  darken = 0,
}: Props) {
  const { width, height } = useWindowDimensions();
  const fallback = useActiveEaPictureSource({ width, height });
  const imgSource = source ?? fallback.source;
  const rawUri = uri === undefined ? fallback.uri : uri;
  const extraScrim =
    darken > 0 ? `rgba(0,0,0,${Math.min(0.85, Math.max(0, darken))})` : null;

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      // @ts-expect-error web-only proof marker
      dataSet={{ wallpaper: '1' }}
      style={[styles.root, style]}
    >
      {Platform.OS === 'web' && rawUri ? (
        // eslint-disable-next-line jsx-a11y/alt-text -- decorative wallpaper
        <img
          src={rawUri}
          alt=""
          aria-hidden
          draggable={false}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center center',
            // Scale past edges so blur doesn't show hard clipped borders.
            transform: 'scale(1.14)',
            filter: `blur(${BLUR_RADIUS}px) saturate(${WEB_SATURATE})`,
            WebkitFilter: `blur(${BLUR_RADIUS}px) saturate(${WEB_SATURATE})`,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />
      ) : (
        <Image
          pointerEvents="none"
          source={imgSource}
          resizeMode="cover"
          blurRadius={Platform.OS === 'web' ? 0 : BLUR_RADIUS}
          style={[
            styles.img,
            { opacity: 0.92, transform: [{ scale: 1.12 }] },
            Platform.OS === 'web'
              ? ({
                  // RN-web Image → background-image; CSS filter still applies.
                  filter: `blur(${BLUR_RADIUS}px) saturate(${WEB_SATURATE})`,
                  WebkitFilter: `blur(${BLUR_RADIUS}px) saturate(${WEB_SATURATE})`,
                  pointerEvents: 'none',
                } as object)
              : null,
          ]}
          accessibilityIgnoresInvertColors
        />
      )}
      {/* Native: gray wash ≈ desaturate (Image blurRadius alone stays colourful). */}
      {Platform.OS !== 'web' ? (
        <View
          pointerEvents="none"
          style={[styles.desatWash, { backgroundColor: 'rgba(20,20,24,0.42)' }]}
        />
      ) : null}
      <View pointerEvents="none" style={[styles.scrim, { backgroundColor: SCRIM }]} />
      {extraScrim ? (
        <View
          pointerEvents="none"
          style={[styles.scrim, { backgroundColor: extraScrim }]}
        />
      ) : null}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0.25)', 'transparent', 'rgba(0,0,0,0.55)']}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
    backgroundColor: '#000000',
    // Stay under UI + dock; never compete for hits (pointerEvents none above).
    zIndex: 0,
    elevation: 0,
  },
  img: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  desatWash: {
    ...StyleSheet.absoluteFill,
  },
  scrim: {
    ...StyleSheet.absoluteFill,
  },
});
