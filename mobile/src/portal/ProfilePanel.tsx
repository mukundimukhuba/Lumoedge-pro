import { StyleSheet, Text, View } from 'react-native';
import type { MentorSession } from '../auth/mentorAuth';

export function ProfilePanel({ mentor }: { mentor: MentorSession }) {
  const rows: { label: string; value: string }[] = [
    { label: 'NAME', value: mentor.name },
    { label: 'MENTOR NAME', value: mentor.mentorName },
    { label: 'EMAIL', value: mentor.email },
    { label: 'CONTACT NUMBER', value: mentor.contact },
    {
      label: 'ACCOUNT STATUS',
      value:
        mentor.status === 'demo'
          ? 'Super admin'
          : mentor.status === 'approved'
            ? 'Approved'
            : mentor.status === 'declined'
              ? 'Declined'
              : mentor.status === 'suspended'
                ? 'Suspended'
                : 'Pending Super Admin approval',
    },
    {
      label: 'PORTAL ROLE',
      value:
        mentor.role === 'super_admin' || mentor.status === 'demo'
          ? 'Super Admin'
          : mentor.role === 'regular_admin'
            ? 'Regular Admin'
            : 'Mentor',
    },
    {
      label: 'REGISTERED',
      value: new Date(mentor.createdAt).toLocaleString(),
    },
  ];

  return (
    <View style={styles.card}>
      <Text style={styles.h2}>Your profile</Text>
      <Text style={styles.hint}>
        Details from your Edges Mentors Portal registration / login.
      </Text>
      {rows.map((row) => (
        <View key={row.label} style={styles.row}>
          <Text style={styles.label}>{row.label}</Text>
          <Text style={styles.value} selectable>
            {row.value || '—'}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    backgroundColor: 'rgba(12, 16, 28, 0.78)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(94, 200, 255, 0.28)',
    padding: 12,
    gap: 10,
  },
  h2: { color: '#fff', fontWeight: '800', fontSize: 16 },
  hint: { color: '#9CA3AF', fontSize: 12, lineHeight: 17 },
  row: {
    gap: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1F2937',
  },
  label: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  value: { color: '#F9FAFB', fontSize: 15, fontWeight: '600' },
});
