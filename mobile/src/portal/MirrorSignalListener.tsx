import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppState } from '../AppState';
import {
  fetchRecentMirrorForEa,
  isMirrorSeen,
  markMirrorSeen,
  type MirrorSignal,
} from './data/signalsApi';

/**
 * On linked student EA control screens: poll for mentor mirror signals and popup.
 */
export function MirrorSignalListener() {
  const { activeEa } = useAppState();
  const [signal, setSignal] = useState<MirrorSignal | null>(null);
  const checking = useRef(false);

  useEffect(() => {
    if (!activeEa?.eaId) return;

    const tick = async () => {
      if (checking.current) return;
      checking.current = true;
      try {
        const rows = await fetchRecentMirrorForEa(activeEa.eaId);
        for (const row of rows) {
          if (await isMirrorSeen(row.id)) continue;
          setSignal(row);
          break;
        }
      } finally {
        checking.current = false;
      }
    };

    void tick();
    const t = setInterval(() => void tick(), 8_000);
    return () => clearInterval(t);
  }, [activeEa?.eaId]);

  if (!signal) return null;

  const dismiss = async () => {
    await markMirrorSeen(signal.id);
    setSignal(null);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>Mentor mirror signal</Text>
          <Text style={styles.title}>
            {(signal.direction || '').toUpperCase()} {signal.symbol}
          </Text>
          <Text style={styles.meta}>
            From {signal.eaName || 'linked EA'}
            {signal.mentorEmail ? ` · ${signal.mentorEmail}` : ''}
          </Text>
          {signal.lotSize != null ? (
            <Text style={styles.meta}>Suggested lot {signal.lotSize}</Text>
          ) : null}
          {signal.note ? <Text style={styles.note}>{signal.note}</Text> : null}
          <Pressable style={styles.btn} onPress={() => void dismiss()}>
            <Text style={styles.btnText}>Got it</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#12151C',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#5EC8FF',
    padding: 18,
    gap: 8,
  },
  eyebrow: {
    color: '#5EC8FF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  title: { color: '#fff', fontSize: 22, fontWeight: '900' },
  meta: { color: '#9CA3AF', fontSize: 13 },
  note: { color: '#E5E7EB', fontSize: 14, marginTop: 4 },
  btn: {
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: '#7C5CFF',
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '800' },
});
