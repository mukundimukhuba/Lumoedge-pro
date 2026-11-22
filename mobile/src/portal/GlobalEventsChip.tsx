import { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  listUpcomingSignalEvents,
  type SignalEvent,
} from './data/signalsApi';

/**
 * Floating global events signal chip — always visible when upcoming events exist.
 * Tap opens the upcoming events list.
 */
export function GlobalEventsChip({ topOffset = 56 }: { topOffset?: number }) {
  const [events, setEvents] = useState<SignalEvent[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setEvents(await listUpcomingSignalEvents());
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  if (events.length === 0) return null;

  const next = events[0]!;

  return (
    <>
      <Pressable
        onPress={() => {
          void load();
          setOpen(true);
        }}
        style={[styles.chip, { top: topOffset }]}
        accessibilityRole="button"
        accessibilityLabel="Open upcoming events signals"
      >
        <Text style={styles.chipLabel}>Events signal</Text>
        <Text style={styles.chipTitle} numberOfLines={1}>
          {next.direction.toUpperCase()}
          {next.symbol ? ` · ${next.symbol}` : ''} · {next.title}
        </Text>
        <Text style={styles.chipMeta}>
          {events.length} upcoming · tap to open
        </Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.scrim} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation?.()}>
            <Text style={styles.sheetTitle}>Upcoming events</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {events.map((e) => (
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
              ))}
            </ScrollView>
            <Pressable
              style={styles.close}
              onPress={() => setOpen(false)}
              accessibilityRole="button"
            >
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 40,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(94,200,255,0.55)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 2,
  },
  chipLabel: {
    color: '#5EC8FF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  chipTitle: { color: '#fff', fontWeight: '800', fontSize: 13 },
  chipMeta: { color: '#9CA3AF', fontSize: 11 },
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 20,
  },
  sheet: {
    backgroundColor: '#12151C',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 16,
    gap: 10,
  },
  sheetTitle: { color: '#fff', fontWeight: '900', fontSize: 18 },
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
    backgroundColor: '#7C5CFF',
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeText: { color: '#fff', fontWeight: '800' },
});
