import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAppState } from '../../AppState';
import { DEMO_MENTOR_EMAIL } from '../../auth/mentorAuth';
import {
  listSubscriptions,
  setSubscriptionStatus,
} from '../../subscriptions/remoteApi';
import {
  displaySubscriptionStatus,
  type SubscriptionRow,
} from '../../subscriptions/types';

const GREEN = '#22C55E';
const RED = '#EF4444';

export function SubscriptionsPanel() {
  const { mentor } = useAppState();
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [msg, setMsg] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const isAdmin =
    (mentor?.email || '').trim().toLowerCase() === DEMO_MENTOR_EMAIL;

  const load = useCallback(async () => {
    if (!isAdmin || !mentor?.email) {
      setRows([]);
      return;
    }
    const res = await listSubscriptions({
      role: 'admin',
      actorEmail: mentor.email,
    });
    if (!res.ok) {
      setMsg(res.error);
      setRows([]);
      return;
    }
    setMsg('');
    setRows(res.subscriptions);
  }, [isAdmin, mentor?.email]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isAdmin) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.hint}>
          Subscriptions approval is only available to the super admin (
          {DEMO_MENTOR_EMAIL}).
        </Text>
      </View>
    );
  }

  const approve = async (row: SubscriptionRow) => {
    setBusyId(row.id);
    setMsg('');
    const res = await setSubscriptionStatus({
      actorEmail: mentor!.email,
      subscriptionId: row.id,
      status: 'approved',
    });
    setBusyId(null);
    if (!res.ok) {
      setMsg(res.error);
      return;
    }
    setMsg(`Approved ${row.clientEmail} — subscription active`);
    await load();
  };

  const decline = async (row: SubscriptionRow) => {
    setBusyId(row.id);
    setMsg('');
    const res = await setSubscriptionStatus({
      actorEmail: mentor!.email,
      subscriptionId: row.id,
      status: 'declined',
    });
    setBusyId(null);
    if (!res.ok) {
      setMsg(res.error);
      return;
    }
    setMsg(`Declined ${row.clientEmail}`);
    await load();
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>
        Client payment submissions. Approve to activate the subscription so the
        client can reach the license section and mentors can generate keys.
        Decline blocks license access.
      </Text>
      {msg ? <Text style={styles.msg}>{msg}</Text> : null}

      {rows.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.empty}>No subscriptions yet.</Text>
        </View>
      ) : (
        rows.map((row) => {
          const busy = busyId === row.id;
          const status = String(row.status || '').toLowerCase();
          // Approve maps to Active in SQL — hide both once already Active/Approved.
          const alreadyActive = status === 'active' || status === 'approved';
          return (
            <View key={row.id} style={styles.card}>
              <Text style={styles.name}>{row.clientName || '—'}</Text>
              <Text style={styles.meta}>Email: {row.clientEmail}</Text>
              <Text style={styles.meta}>EA: {row.eaName || '—'}</Text>
              <Text style={styles.meta}>
                Mentor: {row.mentorName || row.mentorEmail || '—'}
              </Text>
              <Text style={styles.meta}>
                Amount: ${row.amountUsd} · {row.paymentMethod}
              </Text>
              <Text style={styles.meta}>
                Reference / proof: {row.paymentReference || row.paymentProof || '—'}
              </Text>
              <Text style={styles.meta}>
                Payment date:{' '}
                {row.paymentDate
                  ? new Date(row.paymentDate).toLocaleString()
                  : '—'}
              </Text>
              <Text style={styles.status}>
                Status: {displaySubscriptionStatus(row.status)}
              </Text>
              <Text style={styles.id}>{row.id}</Text>

              {!alreadyActive ? (
                <View style={styles.actions}>
                  <Pressable
                    style={[styles.btn, styles.approve, busy && styles.disabled]}
                    onPress={() => void approve(row)}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel="Approve payment"
                  >
                    <Text style={styles.btnText}>Approve Payment</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.btn, styles.decline, busy && styles.disabled]}
                    onPress={() => void decline(row)}
                    disabled={busy || status === 'declined'}
                    accessibilityRole="button"
                    accessibilityLabel="Decline payment"
                  >
                    <Text style={styles.btnText}>Decline Payment</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, marginTop: 8 },
  hint: { color: '#9CA3AF', fontSize: 13, lineHeight: 18 },
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
  meta: { color: '#D1D5DB', fontSize: 13, lineHeight: 18 },
  status: { color: '#93C5FD', fontWeight: '700', fontSize: 13, marginTop: 4 },
  id: { color: '#6B7280', fontSize: 11, fontFamily: 'monospace' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  btn: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  approve: { backgroundColor: GREEN },
  decline: { backgroundColor: RED },
  disabled: { opacity: 0.45 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
