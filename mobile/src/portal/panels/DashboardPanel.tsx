import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppState } from '../../AppState';
import {
  fetchDashboardStats,
  type DashboardStats,
} from '../data/portalStats';

const ACCENT = '#7C5CFF';

export function DashboardPanel() {
  const { eas, licenseKeys, mentor, refreshLicenseCatalog } = useAppState();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      await refreshLicenseCatalog();
      const next = await fetchDashboardStats({
        keys: licenseKeys,
        eas,
        mentorEmail: mentor?.email,
      });
      setStats(next);
    } finally {
      setBusy(false);
    }
  }, [eas, licenseKeys, mentor?.email, refreshLicenseCatalog]);

  useEffect(() => {
    void load();
  }, [load]);

  const s = stats;

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>
        Live portal stats for your license keys, managed EAs, and subscribers.
        {s ? ` · source: ${s.source}` : ''}
      </Text>

      <View style={styles.grid}>
        <Stat
          label="License keys"
          value={s ? String(s.keysTotal) : '—'}
          sub={
            s
              ? `${s.keysActive} active · ${s.keysUnused} unused${
                  s.keysRevoked ? ` · ${s.keysRevoked} revoked` : ''
                }`
              : 'loading…'
          }
        />
        <Stat
          label="EAs available"
          value={s ? String(s.easCount) : '—'}
          sub="managed robots"
        />
        <Stat
          label="Subscribers"
          value={s ? String(s.subscribers) : '—'}
          sub="people under this mentor"
        />
      </View>

      <Pressable
        onPress={() => void load()}
        style={styles.refresh}
        accessibilityRole="button"
        accessibilityLabel="Refresh dashboard stats"
      >
        <Text style={styles.refreshText}>
          {busy ? 'Refreshing…' : 'Refresh stats'}
        </Text>
      </Pressable>
    </View>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statSub}>{sub}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, marginTop: 8 },
  hint: { color: '#9CA3AF', fontSize: 12, lineHeight: 17 },
  grid: { gap: 10 },
  stat: {
    backgroundColor: '#12151C',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 14,
    gap: 4,
  },
  statLabel: {
    color: '#93C5FD',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  statValue: { color: '#fff', fontSize: 28, fontWeight: '900' },
  statSub: { color: '#9CA3AF', fontSize: 12 },
  refresh: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ACCENT,
    backgroundColor: 'rgba(124,92,255,0.18)',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  refreshText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
