import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { isSuperAdminEmail } from '../portalAccess';
import { toSafeUserMessage } from '../safeErrors';

const GREEN = '#22C55E';
const RED = '#EF4444';
const AMBER = '#F59E0B';
const BLUE = '#3B82F6';
const GRAY = '#4B5563';

export function MentorsPanel() {
  const { mentor } = useAppState();
  const actorEmail = mentor?.email || '';
  const [rows, setRows] = useState<MentorProfileRow[]>([]);
  const [msg, setMsg] = useState('');
  const [allotDraft, setAllotDraft] = useState<Record<string, string>>({});
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending'>('pending');

  const load = useCallback(async () => {
    const list = await listMentorProfiles();
    setRows(list);
    const drafts: Record<string, string> = {};
    for (const r of list) {
      drafts[r.email] = String(r.keyAllotment || 0);
    }
    setAllotDraft(drafts);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    if (filter === 'pending') {
      return rows.filter((r) => r.status === 'pending');
    }
    return rows;
  }, [rows, filter]);

  if (!isSuperAdminEmail(actorEmail)) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.hint}>
          Only the Super Admin can manage mentor approvals.
        </Text>
      </View>
    );
  }

  const runStatus = async (
    row: MentorProfileRow,
    status: 'approved' | 'declined' | 'pending' | 'suspended',
    allot?: number,
  ) => {
    setBusyEmail(row.email);
    setMsg('');
    const res = await setMentorStatus(actorEmail, row.email, status, allot);
    setBusyEmail(null);
    if (!res.ok) {
      setMsg(toSafeUserMessage(res.error || `${status} failed`, 'portal'));
      return;
    }
    const label =
      status === 'approved'
        ? 'Approved'
        : status === 'declined'
          ? 'Declined'
          : status === 'suspended'
            ? 'Suspended'
            : 'Reactivated (pending)';
    setMsg(
      `${label} ${row.mentorName || row.email}${
        typeof allot === 'number' ? ` · ${allot} keys allotted` : ''
      }`,
    );
    await load();
  };

  const approve = async (row: MentorProfileRow) => {
    const allot = Math.max(
      0,
      Math.floor(Number(allotDraft[row.email] || row.keyAllotment || 0)),
    );
    await runStatus(row, 'approved', allot);
  };

  const decline = (row: MentorProfileRow) => runStatus(row, 'declined');
  const suspend = (row: MentorProfileRow) => runStatus(row, 'suspended');
  const reactivate = (row: MentorProfileRow) => runStatus(row, 'pending');

  const saveAllot = async (row: MentorProfileRow) => {
    setBusyEmail(row.email);
    setMsg('');
    const allot = Math.max(0, Math.floor(Number(allotDraft[row.email] || 0)));
    const res = await setMentorAllotment(actorEmail, row.email, allot);
    setBusyEmail(null);
    if (!res.ok) {
      setMsg(toSafeUserMessage(res.error || 'Could not save allotment', 'portal'));
      return;
    }
    setMsg(`Allotment set to ${allot} for ${row.mentorName || row.email}`);
    await load();
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>
        View pending mentors and details. Approve grants portal access; Decline
        or Suspend removes it. Reactivate returns a suspended/declined mentor to
        Pending for a fresh review.
      </Text>

      <View style={styles.filterRow}>
        <Pressable
          style={[styles.filterBtn, filter === 'pending' && styles.filterOn]}
          onPress={() => setFilter('pending')}
        >
          <Text style={styles.filterText}>
            Pending ({rows.filter((r) => r.status === 'pending').length})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.filterBtn, filter === 'all' && styles.filterOn]}
          onPress={() => setFilter('all')}
        >
          <Text style={styles.filterText}>All ({rows.length})</Text>
        </Pressable>
      </View>

      {msg ? <Text style={styles.msg}>{msg}</Text> : null}

      {visible.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.empty}>
            {filter === 'pending'
              ? 'No pending mentor signups.'
              : 'No mentor signups yet.'}
          </Text>
        </View>
      ) : (
        visible.map((row) => {
          const busy = busyEmail === row.email;
          const isDemo = row.status === 'demo' || isSuperAdminEmail(row.email);
          return (
            <View key={row.email} style={styles.card}>
              <Text style={styles.name}>
                {row.mentorName || row.name || row.email}
              </Text>
              <Text style={styles.meta}>{row.name}</Text>
              <Text style={styles.meta}>{row.email}</Text>
              <Text style={styles.meta}>{row.contact}</Text>
              <Text style={styles.meta}>
                Role: {row.role || 'mentor'} · Registered{' '}
                {new Date(row.createdAt).toLocaleString()}
              </Text>
              <Text style={styles.status}>
                Status: {row.status} · allotted {row.keyAllotment}
              </Text>

              {!isDemo ? (
                <>
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

                  <View style={styles.row}>
                    {row.status === 'approved' ? (
                      <Pressable
                        style={[styles.btn, styles.suspend]}
                        onPress={() => void suspend(row)}
                        disabled={busy}
                      >
                        <Text style={styles.btnText}>
                          {busy ? '…' : 'Suspend'}
                        </Text>
                      </Pressable>
                    ) : null}
                    {row.status === 'suspended' ||
                    row.status === 'declined' ? (
                      <Pressable
                        style={[styles.btn, styles.reactivate]}
                        onPress={() => void reactivate(row)}
                        disabled={busy}
                      >
                        <Text style={styles.btnText}>
                          {busy ? '…' : 'Reactivate'}
                        </Text>
                      </Pressable>
                    ) : null}
                    {row.status === 'pending' ? (
                      <Pressable
                        style={[styles.btn, styles.neutral]}
                        onPress={() => void load()}
                        disabled={busy}
                      >
                        <Text style={styles.btnText}>Refresh</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </>
              ) : (
                <Text style={styles.meta}>
                  Super admin account — lifecycle actions disabled.
                </Text>
              )}
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
  filterRow: { flexDirection: 'row', gap: 8 },
  filterBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#12151C',
  },
  filterOn: { borderColor: BLUE, backgroundColor: 'rgba(59,130,246,0.18)' },
  filterText: { color: '#E5E7EB', fontWeight: '700', fontSize: 12 },
  card: {
    backgroundColor: 'rgba(12, 16, 28, 0.78)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(94, 200, 255, 0.28)',
    padding: 12,
    gap: 5,
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
    fontSize: 16, // iOS Safari zooms inputs under 16px
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
  suspend: { backgroundColor: AMBER },
  reactivate: { backgroundColor: BLUE },
  neutral: { backgroundColor: GRAY },
  btnText: { color: '#fff', fontWeight: '800' },
});
