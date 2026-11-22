import { StyleSheet, Text, View } from 'react-native';

export function CommissionPanel() {
  return (
    <View style={styles.wrap}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Coming soon</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>Mentor commission</Text>
        <Text style={styles.body}>
          Earn <Text style={styles.emph}>10% per subscription</Text> when a
          client you sold a license key to activates Lumo Edge Pro.
        </Text>
        <Text style={styles.meta}>
          No ledger is shown yet — commission tracking will land here without
          mock balances.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, marginTop: 8 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(251, 191, 36, 0.18)',
    borderColor: '#FBBF24',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeText: {
    color: '#FBBF24',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.4,
  },
  card: {
    backgroundColor: '#12151C',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 14,
    gap: 10,
  },
  title: { color: '#fff', fontWeight: '800', fontSize: 16 },
  body: { color: '#E5E7EB', fontSize: 14, lineHeight: 20 },
  emph: { color: '#93C5FD', fontWeight: '800' },
  meta: { color: '#9CA3AF', fontSize: 12, lineHeight: 17 },
});
