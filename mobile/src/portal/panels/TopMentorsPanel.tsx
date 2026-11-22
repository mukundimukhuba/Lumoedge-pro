import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppState } from '../../AppState';
import { listMentorProfiles } from '../data/mentorsApi';
import { fetchTopMentors, type TopMentorRank } from '../data/portalStats';

export function TopMentorsPanel() {
  const { licenseKeys, mentor } = useAppState();
  const [ranks, setRanks] = useState<TopMentorRank[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const localCounts = new Map<string, number>();
      for (const k of licenseKeys) {
        const email =
          (k as { issuedByEmail?: string }).issuedByEmail ||
          mentor?.email ||
          '';
        if (!email) continue;
        const key = email.toLowerCase();
        localCounts.set(key, (localCounts.get(key) || 0) + 1);
      }
      const profiles = await listMentorProfiles();
      const nameBy = new Map(
        profiles.map((p) => [p.email, p.mentorName || p.name || p.email]),
      );
      const localFallback: TopMentorRank[] = [...localCounts.entries()]
        .map(([email, keysGenerated]) => ({
          email,
          mentorName: nameBy.get(email) || email,
          keysGenerated,
        }))
        .sort((a, b) => b.keysGenerated - a.keysGenerated);

      const remote = await fetchTopMentors(localFallback);
      setRanks(remote);
    } finally {
      setBusy(false);
    }
  }, [licenseKeys, mentor?.email]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>
        Ranked by how many license keys each mentor has generated or sold.
      </Text>
      <Pressable onPress={() => void load()} style={styles.refresh}>
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
