import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppState } from '../../AppState';
import {
  fetchDashboardStats,
  statsFromLocal,
  type DashboardStats,
} from '../data/portalStats';

const ACCENT = '#7C5CFF';
const REFRESH_TIMEOUT_MS = 4_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (err) => {
        clearTimeout(t);
        reject(err);
      },
    );
  });
}

export function DashboardPanel() {
  const { eas, licenseKeys, mentor, refreshLicenseCatalog } = useAppState();
  const [stats, setStats] = useState<DashboardStats | null>(() =>
    statsFromLocal(licenseKeys, eas, mentor?.email),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const keysRef = useRef(licenseKeys);
  const easRef = useRef(eas);
  const mentorEmailRef = useRef(mentor?.email);
  keysRef.current = licenseKeys;
  easRef.current = eas;
  mentorEmailRef.current = mentor?.email;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Keep stats in sync when catalog changes — never flip busy from this path.
  useEffect(() => {
    if (busyRef.current) return;
    setStats(statsFromLocal(licenseKeys, eas, mentor?.email));
  }, [licenseKeys, eas, mentor?.email]);

  const load = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      await withTimeout(
        refreshLicenseCatalog(),
        REFRESH_TIMEOUT_MS,
        'Catalog refresh',
      ).catch(() => undefined);

      const next = await withTimeout(
        fetchDashboardStats({
          keys: keysRef.current,
          eas: easRef.current,
          mentorEmail: mentorEmailRef.current,
        }),
        REFRESH_TIMEOUT_MS,
        'Dashboard stats',
      ).catch(() =>
        statsFromLocal(
          keysRef.current,
          easRef.current,
          mentorEmailRef.current,
        ),
      );

      if (mountedRef.current) setStats(next);
    } catch (err) {
      if (mountedRef.current) {
        setStats(
          statsFromLocal(
            keysRef.current,
            easRef.current,
            mentorEmailRef.current,
          ),
        );
        setError(
          err instanceof Error ? err.message : 'Refresh failed — showing local stats',
        );
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  }, [refreshLicenseCatalog]);

  // One-shot on mount only — do NOT re-run when catalog updates (that looped forever).
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount-once
  }, []);

  const s = stats;

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>
        Live portal stats for your license keys, managed EAs, and subscribers.
        {s ? ` · source: ${s.source}` : ''}
      </Text>
      {error ? <Text style={styles.err}>{error}</Text> : null}

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
        style={[styles.refresh, busy && styles.refreshBusy]}
        accessibilityRole="button"
        accessibilityLabel="Refresh dashboard stats"
        disabled={busy}
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
  err: { color: '#FCA5A5', fontSize: 12 },
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
  refreshBusy: { opacity: 0.7 },
  refreshText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
