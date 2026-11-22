import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppState } from '../../AppState';
import { listMentorProfiles } from '../data/mentorsApi';
import { fetchTopMentors, type TopMentorRank } from '../data/portalStats';

const LOAD_TIMEOUT_MS = 4_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timed out')), ms);
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

export function TopMentorsPanel() {
  const { licenseKeys, mentor } = useAppState();
  const [ranks, setRanks] = useState<TopMentorRank[]>([]);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const keysRef = useRef(licenseKeys);
  const mentorEmailRef = useRef(mentor?.email);
  keysRef.current = licenseKeys;
  mentorEmailRef.current = mentor?.email;

  const buildLocal = useCallback(async (): Promise<TopMentorRank[]> => {
    const localCounts = new Map<string, number>();
    for (const k of keysRef.current) {
      const email =
        (k as { issuedByEmail?: string }).issuedByEmail ||
        mentorEmailRef.current ||
        '';
      if (!email) continue;
      const key = email.toLowerCase();
      localCounts.set(key, (localCounts.get(key) || 0) + 1);
    }
    const profiles = await withTimeout(
      listMentorProfiles(),
      LOAD_TIMEOUT_MS,
    ).catch(() => []);
    const nameBy = new Map(
      profiles.map((p) => [p.email, p.mentorName || p.name || p.email]),
    );
    return [...localCounts.entries()]
      .map(([email, keysGenerated]) => ({
        email,
        mentorName: nameBy.get(email) || email,
        keysGenerated,
      }))
      .sort((a, b) => b.keysGenerated - a.keysGenerated);
  }, []);

  const load = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const localFallback = await buildLocal();
      setRanks(localFallback);
      const remote = await withTimeout(
        fetchTopMentors(localFallback),
        LOAD_TIMEOUT_MS,
      ).catch(() => localFallback);
      setRanks(remote);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [buildLocal]);

  useEffect(() => {
    void load();
    // mount-once — avoid licenseKeys-driven refresh loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>
        Ranked by how many license keys each mentor has generated or sold.
      </Text>
      <Pressable
        onPress={() => void load()}
        style={styles.refresh}
        disabled={busy}
      >
        <Text style={styles.refreshText}>
          {busy ? 'Refreshing…' : 'Refresh ranking'}
        </Text>
      </Pressable>

      {ranks.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.empty}>
            No ranked mentors yet — generate keys to appear here.
          </Text>
        </View>
      ) : (
        ranks.map((r, i) => (
          <View key={r.email} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.rank}>#{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{r.mentorName}</Text>
                <Text style={styles.meta}>{r.email}</Text>
              </View>
              <Text style={styles.count}>{r.keysGenerated}</Text>
            </View>
            <Text style={styles.meta}>keys generated</Text>
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
    gap: 4,
  },
  empty: { color: '#9CA3AF', fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rank: { color: '#93C5FD', fontWeight: '900', fontSize: 18, width: 36 },
  name: { color: '#fff', fontWeight: '800', fontSize: 15 },
  meta: { color: '#9CA3AF', fontSize: 12 },
  count: { color: '#fff', fontWeight: '900', fontSize: 22 },
});
