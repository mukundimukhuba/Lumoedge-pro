import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAppState } from '../../AppState';
import {
  listUpcomingSignalEvents,
  publishSignalEvent,
  type SignalEvent,
} from '../data/signalsApi';

const ACCENT = '#7C5CFF';

const DIRS: SignalEvent['direction'][] = ['buy', 'sell', 'watch', 'news'];

function defaultStartsAt() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return d.toISOString().slice(0, 16);
}

export function SignalDirectionPanel() {
  const { mentor } = useAppState();
  const [title, setTitle] = useState('');
  const [direction, setDirection] = useState<SignalEvent['direction']>('buy');
  const [symbol, setSymbol] = useState('');
  const [startsAt, setStartsAt] = useState(defaultStartsAt());
  const [note, setNote] = useState('');
  const [events, setEvents] = useState<SignalEvent[]>([]);
  const [flash, setFlash] = useState('');
  const [flashErr, setFlashErr] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setEvents(await listUpcomingSignalEvents());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onPublish = async () => {
    setFlash('');
    setFlashErr(false);
    if (!title.trim()) {
      setFlashErr(true);
      setFlash('Enter an event / direction title');
      return;
    }
    const iso = new Date(startsAt).toISOString();
    if (Number.isNaN(Date.parse(iso))) {
      setFlashErr(true);
      setFlash('Enter a valid start time (YYYY-MM-DDTHH:mm)');
      return;
    }

    setBusy(true);
    try {
      const res = await publishSignalEvent({
        title: title.trim(),
        direction,
        symbol: symbol.trim() || undefined,
        startsAt: iso,
        note: note.trim() || undefined,
        publishedByEmail: mentor?.email,
      });
      if (!res.ok) {
        setFlashErr(true);
        setFlash(res.error || 'Publish failed');
      } else {
        setFlashErr(false);
        setFlash(
          'Published — the global events chip will show this for everyone with upcoming events.',
        );
        setTitle('');
        setNote('');
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>
        Write an event direction and publish it to the global floating events
        surface so people can see and execute if they want.
      </Text>

      <View style={styles.card}>
        <Text style={styles.h2}>New signal direction</Text>
        <Text style={styles.label}>TITLE</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. NFP long bias"
          placeholderTextColor="#6B7280"
        />
        <Text style={styles.label}>DIRECTION</Text>
        <View style={styles.chips}>
          {DIRS.map((d) => {
            const on = direction === d;
            return (
              <Pressable
                key={d}
                onPress={() => setDirection(d)}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>
                  {d.toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.label}>SYMBOL (optional)</Text>
        <TextInput
          style={styles.input}
          value={symbol}
          onChangeText={setSymbol}
          autoCapitalize="characters"
          placeholder="XAUUSD"
          placeholderTextColor="#6B7280"
        />
        <Text style={styles.label}>STARTS AT (local ISO)</Text>
        <TextInput
          style={styles.input}
          value={startsAt}
          onChangeText={setStartsAt}
          placeholder="2026-11-22T15:00"
          placeholderTextColor="#6B7280"
          autoCapitalize="none"
        />
        <Text style={styles.label}>NOTE</Text>
        <TextInput
          style={styles.input}
          value={note}
          onChangeText={setNote}
          placeholder="Optional detail"
          placeholderTextColor="#6B7280"
        />
        <Pressable
          style={[styles.publish, busy && { opacity: 0.6 }]}
          onPress={() => void onPublish()}
          disabled={busy}
        >
          <Text style={styles.publishText}>
            {busy ? 'PUBLISHING…' : 'PUBLISH TO GLOBAL EVENTS'}
          </Text>
        </Pressable>
        {flash ? (
          <Text style={flashErr ? styles.err : styles.ok}>{flash}</Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Upcoming events</Text>
        {events.length === 0 ? (
          <Text style={styles.meta}>No upcoming events yet.</Text>
        ) : (
          events.map((e) => (
            <View key={e.id} style={styles.eventRow}>
              <Text style={styles.eventTitle}>{e.title}</Text>
              <Text style={styles.meta}>
                {e.direction.toUpperCase()}
                {e.symbol ? ` · ${e.symbol}` : ''} ·{' '}
                {new Date(e.startsAt).toLocaleString()}
              </Text>
              {e.note ? <Text style={styles.meta}>{e.note}</Text> : null}
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, marginTop: 8 },
  hint: { color: '#9CA3AF', fontSize: 12, lineHeight: 17 },
  card: {
    backgroundColor: 'rgba(12, 16, 28, 0.78)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(94, 200, 255, 0.28)',
    padding: 12,
    gap: 8,
  },
  h2: { color: '#fff', fontWeight: '800', fontSize: 16 },
  label: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  input: {
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    backgroundColor: '#0B0E14',
    fontSize: 16, // iOS Safari zooms inputs under 16px
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipOn: {
    borderColor: ACCENT,
    backgroundColor: 'rgba(124,92,255,0.25)',
  },
  chipText: { color: '#E5E7EB', fontWeight: '600', fontSize: 12 },
  chipTextOn: { color: '#fff' },
  publish: {
    borderRadius: 12,
    backgroundColor: ACCENT,
    paddingVertical: 14,
    alignItems: 'center',
  },
  publishText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 0.4,
  },
  ok: { color: '#86EFAC', fontSize: 13 },
  err: { color: '#FCA5A5', fontSize: 13 },
  meta: { color: '#9CA3AF', fontSize: 12 },
  eventRow: {
    gap: 2,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1F2937',
  },
  eventTitle: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
