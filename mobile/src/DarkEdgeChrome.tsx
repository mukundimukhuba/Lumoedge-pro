import { useEffect } from 'react';
import { Platform, StyleSheet, View, type ViewProps } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

const BLACK = '#000000';

/**
 * Root chrome for every main screen: light status icons on a black / translucent
 * bar, SafeAreaView that keeps left/right (and leaves top edge-to-edge so the
 * black canvas sits under the notch), plus a web paint pass that kills RN-web's
 * default #f2f2f2 / white stack strip.
 *
 * Top inset is intentionally not applied here — screens pad floating chrome
 * with useSafeAreaInsets() so heroes stay full-bleed under the status bar.
 */
export function DarkEdgeChrome({
  children,
  style,
  ...rest
}: ViewProps) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const ensureMeta = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('name', name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    ensureMeta('theme-color', BLACK);
    ensureMeta('color-scheme', 'dark');
    ensureMeta('apple-mobile-web-app-capable', 'yes');
    ensureMeta('mobile-web-app-capable', 'yes');
    ensureMeta('apple-mobile-web-app-status-bar-style', 'black-translucent');

    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      const cur = viewport.getAttribute('content') || '';
      if (!/viewport-fit\s*=\s*cover/i.test(cur)) {
        viewport.setAttribute(
          'content',
          cur
            ? `${cur.replace(/,?\s*viewport-fit\s*=\s*[^,]+/i, '')}, viewport-fit=cover`
            : 'width=device-width, initial-scale=1, viewport-fit=cover',
        );
      }
    }

    document.documentElement.style.backgroundColor = BLACK;
    document.body.style.backgroundColor = BLACK;

    const paint = () => {
      document.documentElement.style.backgroundColor = BLACK;
      document.body.style.backgroundColor = BLACK;
      document.querySelectorAll('div').forEach((node) => {
        const bg = getComputedStyle(node).backgroundColor;
        if (
          bg === 'rgb(242, 242, 242)' ||
          bg === 'rgb(255, 255, 255)' ||
          bg === 'rgba(255, 255, 255, 1)'
        ) {
          (node as HTMLElement).style.setProperty(
            'background-color',
            BLACK,
            'important',
          );
        }
      });
    };

    paint();
    const id = window.setInterval(paint, 500);
    return () => window.clearInterval(id);
  }, []);

  return (
    <SafeAreaView
      edges={['left', 'right']}
      style={[styles.root, style]}
      {...rest}
    >
      <StatusBar style="light" />
      <View style={styles.fill} pointerEvents="box-none">
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BLACK,
    width: '100%',
  },
  fill: {
    flex: 1,
    backgroundColor: BLACK,
    width: '100%',
  },
});
