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
  listMentorProfiles,
  setMentorAllotment,
  setMentorStatus,
  type MentorProfileRow,
} from '../data/mentorsApi';
import { SUPER_ADMIN_EMAIL, isSuperAdminEmail } from '../portalAccess';

const GREEN = '#22C55E';
const RED = '#EF4444';

export function MentorsPanel() {
  const { mentor } = useAppState();
  const [rows, setRows] = useState<MentorProfileRow[]>([]);
  const [msg, setMsg] = useState('');
  const [allotDraft, setAllotDraft] = useState<Record<string, string>>({});
  const [busyEmail, setBusyEmail] = useState<string | null>(null);

  const actorEmail = mentor?.email || '';
  const canAdmin = isSuperAdminEmail(actorEmail);

  const load = useCallback(async () => {
    if (!canAdmin) {
      setRows([]);
      return;
    }
    const list = await listMentorProfiles(actorEmail);
    setRows(list);
    const drafts: Record<string, string> = {};
    for (const r of list) {
      drafts[r.email] = String(r.keyAllotment || 0);
    }
    setAllotDraft(drafts);
  }, [actorEmail, canAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = async (row: MentorProfileRow) => {
    setBusyEmail(row.email);
    setMsg('');
    const allot = Math.max(
      0,
      Math.floor(Number(allotDraft[row.email] || row.keyAllotment || 0)),
    );
    const res = await setMentorStatus(actorEmail, row.email, 'approved', allot);
    setBusyEmail(null);
    if (!res.ok) {
      setMsg(res.error || 'Approve failed');
      return;
    }
    setMsg(`Approved ${row.mentorName || row.email} · ${allot} keys allotted`);
    await load();
  };

  const decline = async (row: MentorProfileRow) => {
    setBusyEmail(row.email);
    setMsg('');
    const res = await setMentorStatus(actorEmail, row.email, 'declined');
    setBusyEmail(null);
    if (!res.ok) {
      setMsg(res.error || 'Decline failed');
      return;
    }
    setMsg(`Declined ${row.mentorName || row.email}`);
    await load();
  };

  const saveAllot = async (row: MentorProfileRow) => {
    setBusyEmail(row.email);
    setMsg('');
    const allot = Math.max(0, Math.floor(Number(allotDraft[row.email] || 0)));
    const res = await setMentorAllotment(actorEmail, row.email, allot);
    setBusyEmail(null);
    if (!res.ok) {
      setMsg(res.error || 'Could not save allotment');
      return;
    }
    setMsg(`Allotment set to ${allot} for ${row.mentorName || row.email}`);
    await load();
  };

  if (!canAdmin) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.hint}>
          Only the super admin ({SUPER_ADMIN_EMAIL}) can approve mentor
          signups.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>
        Mentors who signed up via the portal register flow. Approve or decline,
        then set how many license keys they may generate. Super admin:{' '}
        {SUPER_ADMIN_EMAIL}
      </Text>
      {msg ? <Text style={styles.msg}>{msg}</Text> : null}

      {rows.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.empty}>No mentor signups yet.</Text>
        </View>
      ) : (
        rows.map((row) => {
          const busy = busyEmail === row.email;
          return (
            <View key={row.email} style={styles.card}>
              <Text style={styles.name}>
                {row.mentorName || row.name || row.email}
              </Text>
              <Text style={styles.meta}>{row.name}</Text>
              <Text style={styles.meta}>{row.email}</Text>
              <Text style={styles.meta}>{row.contact}</Text>
              <Text style={styles.status}>
                Status: {row.status} · allotted {row.keyAllotment}
              </Text>

              <Text style={styles.label}>KEY ALLOTMENT</Text>
              <TextInput
                style={styles.input}
                value={allotDraft[row.email] ?? '0'}
                onChangeText={(t) =>
                  setAllotDraft((prev) => ({ ...prev, [row.email]: t }))
                }
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor="#6B7280"
              />

              <View style={styles.row}>
                {row.status !== 'approved' ? (
                  <Pressable
                    style={[styles.btn, styles.approve]}
                    onPress={() => void approve(row)}
                    disabled={busy}
                  >
                    <Text style={styles.btnText}>
                      {busy ? '…' : 'Approve'}
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={[styles.btn, styles.approve]}
                    onPress={() => void saveAllot(row)}
                    disabled={busy}
                  >
                    <Text style={styles.btnText}>
                      {busy ? '…' : 'Save allotment'}
                    </Text>
                  </Pressable>
                )}
                {row.status !== 'declined' ? (
                  <Pressable
                    style={[styles.btn, styles.decline]}
                    onPress={() => void decline(row)}
                    disabled={busy}
                  >
                    <Text style={styles.btnText}>
                      {busy ? '…' : 'Decline'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, marginTop: 8 },
  hint: { color: '#9CA3AF', fontSize: 12, lineHeight: 17 },
  msg: { color: '#86EFAC', fontSize: 13 },
  card: {
    backgroundColor: '#12151C',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 14,
    gap: 6,
  },
  empty: { color: '#9CA3AF', fontSize: 13 },
  name: { color: '#fff', fontWeight: '800', fontSize: 16 },
  meta: { color: '#9CA3AF', fontSize: 12 },
  status: { color: '#93C5FD', fontSize: 12, marginTop: 4, fontWeight: '600' },
  label: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    backgroundColor: '#0B0E14',
  },
  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  btn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  approve: { backgroundColor: GREEN },
  decline: { backgroundColor: RED },
  btnText: { color: '#fff', fontWeight: '800' },
});
