import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchBrokerCounts, type BrokerCount } from '../data/portalStats';

export function SettingsBrokersPanel() {
  const [rows, setRows] = useState<BrokerCount[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setRows(await fetchBrokerCounts());
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>
        Brokers people are connected to, with live counts of real connected
        accounts. Only brokers with at least one connection are listed.
      </Text>
      <Pressable onPress={() => void load()} style={styles.refresh}>
        <Text style={styles.refreshText}>
          {busy ? 'Refreshing…' : 'Refresh connections'}
        </Text>
      </Pressable>

      {rows.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.empty}>
            No broker connections recorded yet. When traders connect MT5 on
            Connect Broker, counts appear here.
          </Text>
        </View>
      ) : (
        rows.map((r) => (
          <View key={r.broker} style={styles.card}>
            <Text style={styles.broker}>{r.broker}</Text>
            <Text style={styles.count}>
              {r.count} {r.count === 1 ? 'person' : 'people'}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, marginTop: 8 },
  hint: { color: '#9CA3AF', fontSize: 12, lineHeight: 17 },
  refresh: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  refreshText: { color: '#E5E7EB', fontWeight: '700', fontSize: 12 },
  card: {
    backgroundColor: '#12151C',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  empty: { color: '#9CA3AF', fontSize: 13, flex: 1 },
  broker: { color: '#fff', fontWeight: '800', fontSize: 15, flex: 1 },
  count: { color: '#93C5FD', fontWeight: '700', fontSize: 14 },
});
