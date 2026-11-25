import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
import { toSafeUserMessage } from '../safeErrors';
import { CYAN, glassCard } from '../portalTheme';

const GREEN = '#22C55E';
const RED = '#EF4444';

export function SubscriptionsPanel() {
  const { mentor } = useAppState();
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
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
      setErr(toSafeUserMessage(res.error, 'portal'));
      setRows([]);
      return;
    }
    setErr('');
    setRows(res.subscriptions);
  }, [isAdmin, mentor?.email]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isAdmin) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.hint}>
          Subscriptions approval is only available to the Super Admin.
        </Text>
      </View>
    );
  }

  const approve = async (row: SubscriptionRow) => {
    setBusyId(row.id);
    setMsg('');
    setErr('');
    const res = await setSubscriptionStatus({
      actorEmail: mentor!.email,
      subscriptionId: row.id,
      status: 'approved',
    });
    setBusyId(null);
    if (!res.ok) {
      setErr(toSafeUserMessage(res.error, 'portal'));
      return;
    }
    setMsg(`Approved ${row.clientEmail} — subscription active`);
    await load();
  };

  const decline = async (row: SubscriptionRow) => {
    setBusyId(row.id);
    setMsg('');
    setErr('');
    const res = await setSubscriptionStatus({
      actorEmail: mentor!.email,
      subscriptionId: row.id,
      status: 'declined',
    });
    setBusyId(null);
    if (!res.ok) {
      setErr(toSafeUserMessage(res.error, 'portal'));
      return;
    }
    setMsg(`Declined ${row.clientEmail}`);
    await load();
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>
        Review client payment submissions. Approve to activate access; decline
        blocks license generation for that client.
      </Text>
      {msg ? <Text style={styles.msg}>{msg}</Text> : null}
      {err ? <Text style={styles.err}>{err}</Text> : null}

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
          const statusLabel = displaySubscriptionStatus(row.status);
          return (
            <View key={row.id} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.name} numberOfLines={1}>
                  {row.clientName || row.clientEmail || '—'}
                </Text>
                <View
                  style={[
                    styles.badge,
                    alreadyActive
                      ? styles.badgeOk
                      : status === 'declined'
                        ? styles.badgeBad
                        : styles.badgePending,
                  ]}
                >
                  <Text style={styles.badgeText}>{statusLabel}</Text>
                </View>
              </View>
              <Text style={styles.meta}>{row.clientEmail}</Text>
              <Text style={styles.meta}>
                EA · {row.eaName || '—'}
                {row.mentorName || row.mentorEmail
                  ? ` · Mentor · ${row.mentorName || row.mentorEmail}`
                  : ''}
              </Text>
              <Text style={styles.amount}>
                ${row.amountUsd}
                <Text style={styles.meta}> · {row.paymentMethod}</Text>
              </Text>
              {(row.paymentReference || row.paymentProof) && (
                <Text style={styles.meta} numberOfLines={2}>
                  Ref · {row.paymentReference || row.paymentProof}
                </Text>
              )}
              {row.paymentDate ? (
                <Text style={styles.metaDim}>
                  {new Date(row.paymentDate).toLocaleString()}
                </Text>
              ) : null}

              {!alreadyActive ? (
                <View style={styles.actions}>
                  <Pressable
                    style={[styles.btn, styles.approve, busy && styles.disabled]}
                    onPress={() => void approve(row)}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel="Approve payment"
                  >
                    <Text style={styles.btnText}>Approve</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.btn, styles.decline, busy && styles.disabled]}
                    onPress={() => void decline(row)}
                    disabled={busy || status === 'declined'}
                    accessibilityRole="button"
                    accessibilityLabel="Decline payment"
                  >
                    <Text style={styles.btnText}>Decline</Text>
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
  wrap: { gap: 10, marginTop: 6 },
  hint: { color: '#9CA3AF', fontSize: 13, lineHeight: 18 },
  msg: { color: '#86EFAC', fontSize: 13 },
  err: { color: '#FCA5A5', fontSize: 13 },
  card: {
    ...glassCard,
    gap: 5,
    padding: 12,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  empty: { color: '#9CA3AF', fontSize: 13 },
  name: { color: '#fff', fontWeight: '800', fontSize: 15, flex: 1 },
  meta: { color: '#D1D5DB', fontSize: 12, lineHeight: 17 },
  metaDim: { color: '#6B7280', fontSize: 11, marginTop: 2 },
  amount: { color: CYAN, fontWeight: '800', fontSize: 14, marginTop: 2 },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeOk: { backgroundColor: 'rgba(34,197,94,0.2)' },
  badgeBad: { backgroundColor: 'rgba(239,68,68,0.2)' },
  badgePending: { backgroundColor: 'rgba(94,200,255,0.15)' },
  badgeText: { color: '#E5E7EB', fontWeight: '700', fontSize: 11 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  btn: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 96,
    alignItems: 'center',
  },
  approve: { backgroundColor: GREEN },
  decline: { backgroundColor: RED },
  disabled: { opacity: 0.45 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
