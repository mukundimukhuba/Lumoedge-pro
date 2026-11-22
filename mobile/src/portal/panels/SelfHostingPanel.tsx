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
  clearMt5Token,
  loadMt5Link,
  type Mt5Link,
} from '../../brokers/mt5Token';
import { publishMirrorSignal } from '../data/signalsApi';

const ACCENT = '#7C5CFF';
const GREEN = '#22C55E';

export function SelfHostingPanel() {
  const { eas, mentor, selected } = useAppState();
  const [link, setLink] = useState<Mt5Link | null>(null);
  const [symbol, setSymbol] = useState(selected[0] || 'EURUSD');
  const [eaId, setEaId] = useState(eas[0]?.id || '');
  const [direction, setDirection] = useState<'buy' | 'sell'>('buy');
  const [lot, setLot] = useState('0.01');
  const [note, setNote] = useState('');
  const [flash, setFlash] = useState('');
  const [flashErr, setFlashErr] = useState(false);
  const [busy, setBusy] = useState(false);

  const refreshLink = useCallback(async () => {
    setLink(await loadMt5Link());
  }, []);

  useEffect(() => {
    void refreshLink();
  }, [refreshLink]);

  useEffect(() => {
    if (!eaId && eas[0]?.id) setEaId(eas[0].id);
  }, [eas, eaId]);

  const activeEa = eas.find((e) => e.id === eaId) || eas[0];
  const symbols =
    activeEa?.symbols?.length
      ? activeEa.symbols
      : ['EURUSD', 'GBPUSD', 'XAUUSD', 'BTCUSD'];

  const onTrigger = async () => {
    setFlash('');
    setFlashErr(false);
    if (!link?.token) {
      setFlashErr(true);
      setFlash('Connect your trading account first (Connect Broker in the app).');
      return;
    }
    if (!activeEa) {
      setFlashErr(true);
      setFlash('Select an EA that will fan out the signal.');
      return;
    }
    const sym = symbol.trim().toUpperCase();
    if (!sym) {
      setFlashErr(true);
      setFlash('Select a symbol to trade.');
      return;
    }

    setBusy(true);
    try {
      const res = await publishMirrorSignal({
        eaId: activeEa.id,
        eaName: activeEa.name,
        symbol: sym,
        direction,
        mentorEmail: mentor?.email,
        lotSize: Number(lot) || 0.01,
        note: note.trim() || undefined,
      });
      if (!res.ok) {
        setFlashErr(true);
        setFlash(res.error || 'Could not publish mirror signal');
        return;
      }
      setFlashErr(false);
      setFlash(
        `Signal sent · ${sym} ${direction.toUpperCase()} → students linked to ${activeEa.name}. They will see a popup on their EA control screen.`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>
        Trade / signal mirror for students linked under your EA. Connect your
        account first, pick a symbol and EA, then trigger — linked clients get a
        popup.
      </Text>

      <View style={styles.card}>
        <Text style={styles.h2}>1. Mentor trading account</Text>
        {link?.token ? (
          <>
            <Text style={styles.ok}>
              Connected · {link.broker}
              {link.server ? ` · ${link.server}` : ''}
              {link.login ? ` · ${link.login}` : ''}
            </Text>
            <Pressable
              onPress={async () => {
                await clearMt5Token();
                await refreshLink();
              }}
              style={styles.secondary}
            >
              <Text style={styles.secondaryText}>Disconnect</Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.warn}>
            No MT5 link on this device. Open the main app → Connect Broker, then
            return here and refresh.
          </Text>
        )}
        <Pressable onPress={() => void refreshLink()} style={styles.secondary}>
          <Text style={styles.secondaryText}>Refresh connection</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>2. Symbol</Text>
        <View style={styles.chips}>
          {symbols.map((s) => {
            const on = symbol === s;
            return (
              <Pressable
                key={s}
                onPress={() => setSymbol(s)}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>
                  {s}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          style={styles.input}
          value={symbol}
          onChangeText={setSymbol}
          autoCapitalize="characters"
          placeholder="Custom symbol"
          placeholderTextColor="#6B7280"
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>3. EA fan-out</Text>
        {eas.length === 0 ? (
          <Text style={styles.warn}>Create a robot under Manage EAs first.</Text>
        ) : (
          <View style={styles.chips}>
            {eas.map((ea) => {
              const on = ea.id === (activeEa?.id || '');
              return (
                <Pressable
                  key={ea.id}
                  onPress={() => setEaId(ea.id)}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>
                    {ea.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>4. Trigger signal</Text>
        <View style={styles.row}>
          {(['buy', 'sell'] as const).map((d) => (
            <Pressable
              key={d}
              onPress={() => setDirection(d)}
              style={[
                styles.dirBtn,
                direction === d &&
                  (d === 'buy' ? styles.buyOn : styles.sellOn),
              ]}
            >
              <Text style={styles.dirText}>{d.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>LOT SIZE</Text>
        <TextInput
          style={styles.input}
          value={lot}
          onChangeText={setLot}
          keyboardType="decimal-pad"
          placeholder="0.01"
          placeholderTextColor="#6B7280"
        />
        <Text style={styles.label}>NOTE (optional)</Text>
        <TextInput
          style={styles.input}
          value={note}
          onChangeText={setNote}
          placeholder="e.g. follow mentor entry"
          placeholderTextColor="#6B7280"
        />
        <Pressable
          style={[styles.trigger, busy && { opacity: 0.6 }]}
          onPress={() => void onTrigger()}
          disabled={busy}
        >
          <Text style={styles.triggerText}>
            {busy ? 'SENDING…' : 'TRIGGER MIRROR SIGNAL'}
          </Text>
        </Pressable>
        {flash ? (
          <Text style={flashErr ? styles.err : styles.ok}>{flash}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, marginTop: 8 },
  hint: { color: '#9CA3AF', fontSize: 12, lineHeight: 17 },
  card: {
    backgroundColor: '#12151C',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 14,
    gap: 10,
  },
  h2: { color: '#fff', fontWeight: '800', fontSize: 15 },
  ok: { color: '#86EFAC', fontSize: 13, lineHeight: 18 },
  warn: { color: '#FCA5A5', fontSize: 13, lineHeight: 18 },
  err: { color: '#FCA5A5', fontSize: 13, lineHeight: 18 },
  secondary: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secondaryText: { color: '#E5E7EB', fontWeight: '700', fontSize: 12 },
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
  chipText: { color: '#E5E7EB', fontWeight: '600', fontSize: 13 },
  chipTextOn: { color: '#fff' },
  input: {
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    backgroundColor: '#0B0E14',
  },
  label: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  row: { flexDirection: 'row', gap: 8 },
  dirBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    paddingVertical: 12,
    alignItems: 'center',
  },
  buyOn: { backgroundColor: 'rgba(34,197,94,0.25)', borderColor: GREEN },
  sellOn: { backgroundColor: 'rgba(239,68,68,0.25)', borderColor: '#EF4444' },
  dirText: { color: '#fff', fontWeight: '800' },
  trigger: {
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: ACCENT,
    paddingVertical: 14,
    alignItems: 'center',
  },
  triggerText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 0.5,
  },
});
