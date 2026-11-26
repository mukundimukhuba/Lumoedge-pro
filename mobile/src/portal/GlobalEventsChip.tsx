import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  listUpcomingSignalEvents,
  type SignalEvent,
} from './data/signalsApi';

const ORB = 46;
const RING = 58;
const BELT = 70;
const NEON = '#FF2A2A';

/** Web CSS keyframes for a smoother orbital spin than JS Animated. */
const WEB_SPIN_CSS =
  Platform.OS === 'web'
    ? `
@keyframes lumoEventsOrbSpin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes lumoEventsOrbSpinRev {
  from { transform: rotate(360deg); }
  to { transform: rotate(0deg); }
}
`.trim()
    : '';

/**
 * Floating global events signal orb on EA Home.
 * Compact circle + continuous orbital belt; tap opens calendar / signals.
 */
export function GlobalEventsChip({
  topOffset = 56,
  /** Leave room for settings gear on the right */
  rightInset = 56,
  accent = NEON,
}: {
  topOffset?: number;
  rightInset?: number;
  accent?: string;
}) {
  const [events, setEvents] = useState<SignalEvent[]>([]);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  const spin = useRef(new Animated.Value(0)).current;
  const spinSlow = useRef(new Animated.Value(0)).current;
  const nativeAnim = Platform.OS !== 'web';
  const useCssSpin = Platform.OS === 'web';

  const load = useCallback(async () => {
    try {
      setEvents(await listUpcomingSignalEvents());
    } catch {
      /* keep prior */
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  // Inject CSS keyframes once on web for premium continuous spin.
  useEffect(() => {
    if (!useCssSpin || typeof document === 'undefined') return;
    const id = 'lumo-events-orb-spin-css';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = WEB_SPIN_CSS;
    document.head.appendChild(el);
  }, [useCssSpin]);

  useEffect(() => {
    if (useCssSpin) return;
    const belt = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 7200,
        easing: Easing.linear,
        useNativeDriver: nativeAnim,
      }),
    );
    const reverse = Animated.loop(
      Animated.timing(spinSlow, {
        toValue: 1,
        duration: 14000,
        easing: Easing.linear,
        useNativeDriver: nativeAnim,
      }),
    );
    belt.start();
    reverse.start();
    return () => {
      belt.stop();
      reverse.stop();
    };
  }, [spin, spinSlow, nativeAnim, useCssSpin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const rotateRev = spinSlow.interpolate({
    inputRange: [0, 1],
    outputRange: ['360deg', '0deg'],
  });

  const next = events[0];
  const hasEvents = events.length > 0;
  const countLabel = !ready ? '…' : hasEvents ? String(events.length) : '0';
  const statusLabel = !ready
    ? '…'
    : hasEvents
      ? next!.direction.toUpperCase()
      : 'none';

  const glow = useMemo(
    () =>
      Platform.OS === 'web'
        ? ({
            boxShadow: `0 0 12px ${accent}77, 0 0 22px ${accent}33`,
          } as object)
        : null,
    [accent],
  );

  const cssSpin = useCssSpin
    ? ({
        animation: 'lumoEventsOrbSpin 7.2s linear infinite',
      } as object)
    : null;
  const cssSpinRev = useCssSpin
    ? ({
        animation: 'lumoEventsOrbSpinRev 14s linear infinite',
      } as object)
    : null;

  return (
    <>
      <View
        style={[styles.anchor, { top: topOffset, right: rightInset }]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={() => {
            void load();
            setOpen(true);
          }}
          style={styles.hit}
          accessibilityRole="button"
          accessibilityLabel={
            hasEvents
              ? `Open events signals, ${events.length} upcoming`
              : 'Open upcoming events signals'
          }
        >
          {/* Outer dashed counter-rotating belt */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.belt,
              {
                borderColor: `${accent}AA`,
              },
              useCssSpin
                ? cssSpinRev
                : { transform: [{ rotate: rotateRev }] },
            ]}
          />
          {/* Bright orbital arc (comet segment) */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ring,
              {
                borderColor: 'transparent',
                borderTopColor: accent,
                borderRightColor: `${accent}CC`,
                borderBottomColor: `${accent}22`,
              },
              useCssSpin ? cssSpin : { transform: [{ rotate }] },
            ]}
          />
          {/* Soft trailing tick on a second phase */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.tick,
              {
                borderColor: 'transparent',
                borderLeftColor: `${accent}EE`,
              },
              useCssSpin
                ? ({
                    animation: 'lumoEventsOrbSpin 7.2s linear infinite',
                    animationDelay: '-1.8s',
                  } as object)
                : { transform: [{ rotate }] },
            ]}
          />
          {/* Orb core */}
          <View
            style={[
              styles.orb,
              {
                borderColor: hasEvents ? accent : `${accent}BB`,
              },
              glow,
            ]}
          >
            <Ionicons
              name="calendar-outline"
              size={13}
              color={hasEvents ? accent : '#C4C4C4'}
            />
            <Text
              style={[
                styles.count,
                { color: hasEvents ? '#fff' : '#9A9A9A' },
              ]}
              numberOfLines={1}
            >
              {countLabel}
            </Text>
          </View>
        </Pressable>
        <Text
          style={[styles.status, { color: hasEvents ? accent : '#8A8A8A' }]}
          numberOfLines={1}
        >
          {statusLabel}
        </Text>
      </View>

      {/* In-tree overlay (not RN Modal) so it stays inside phone chrome on web. */}
      {open ? (
        <View style={styles.overlayRoot} pointerEvents="box-none">
          <Pressable style={styles.scrim} onPress={() => setOpen(false)}>
            <Pressable
              style={[styles.sheet, { borderColor: `${accent}55` }]}
              onPress={(e) => e.stopPropagation?.()}
            >
              <Text style={styles.sheetTitle}>Upcoming events</Text>
              <Text style={styles.sheetHint}>
                Published from Mentors Portal → Add Signal Direction
              </Text>
              <ScrollView style={{ maxHeight: 320 }}>
                {events.length === 0 ? (
                  <Text style={styles.empty}>
                    No upcoming events yet. When a mentor publishes a
                    direction, it appears here for everyone.
                  </Text>
                ) : (
                  events.map((e) => (
                    <View key={e.id} style={styles.row}>
                      <Text style={styles.rowTitle}>{e.title}</Text>
                      <Text style={styles.rowMeta}>
                        {e.direction.toUpperCase()}
                        {e.symbol ? ` · ${e.symbol}` : ''}
                      </Text>
                      <Text style={styles.rowMeta}>
                        {new Date(e.startsAt).toLocaleString()}
                      </Text>
                      {e.note ? (
                        <Text style={styles.rowNote}>{e.note}</Text>
                      ) : null}
                    </View>
                  ))
                )}
              </ScrollView>
              <Pressable
                style={[styles.close, { backgroundColor: accent }]}
                onPress={() => setOpen(false)}
                accessibilityRole="button"
              >
                <Text style={styles.closeText}>Close</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    left: 12,
    zIndex: 200,
    elevation: 24,
    width: BELT,
    alignItems: 'center',
    overflow: 'visible',
    ...( { pointerEvents: 'box-none' } as object),
  },
  hit: {
    width: BELT,
    height: BELT,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  belt: {
    position: 'absolute',
    width: BELT,
    height: BELT,
    borderRadius: BELT / 2,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  ring: {
    position: 'absolute',
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 2.5,
  },
  tick: {
    position: 'absolute',
    width: RING + 4,
    height: RING + 4,
    borderRadius: (RING + 4) / 2,
    borderWidth: 2,
  },
  orb: {
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2,
    backgroundColor: 'rgba(8, 8, 12, 0.96)',
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  count: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
    lineHeight: 13,
  },
  status: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  overlayRoot: {
    ...StyleSheet.absoluteFill,
    zIndex: 400,
    elevation: 40,
  },
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    padding: 18,
  },
  sheet: {
    backgroundColor: '#12151C',
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 10,
    maxWidth: '100%',
    alignSelf: 'stretch',
  },
  sheetTitle: { color: '#fff', fontWeight: '900', fontSize: 18 },
  sheetHint: { color: '#9CA3AF', fontSize: 12, marginTop: -4 },
  empty: { color: '#9CA3AF', fontSize: 13, lineHeight: 18, paddingVertical: 12 },
  row: {
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1F2937',
    gap: 2,
  },
  rowTitle: { color: '#fff', fontWeight: '700', fontSize: 14 },
  rowMeta: { color: '#9CA3AF', fontSize: 12 },
  rowNote: { color: '#E5E7EB', fontSize: 12, marginTop: 2 },
  close: {
    marginTop: 4,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeText: { color: '#fff', fontWeight: '800' },
});
