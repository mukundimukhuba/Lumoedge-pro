import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAppState } from '../../AppState';
import { DEMO_MENTOR_EMAIL } from '../../auth/mentorAuth';
import {
  listSubscriptions,
  setSubscriptionStatus,
} from '../../subscriptions/remoteApi';
import {
  displaySubscriptionStatus,
  isSubscriptionUsable,
  partitionAdminSubscriptions,
  type SubscriptionRow,
} from '../../subscriptions/types';
import { toSafeUserMessage } from '../safeErrors';
import { CYAN, glassCard } from '../portalTheme';

const GREEN = '#22C55E';
const RED = '#EF4444';

type FilterTab = 'pending' | 'approved' | 'declined';

function emailMatches(row: SubscriptionRow, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return String(row.clientEmail || '')
    .trim()
    .toLowerCase()
    .includes(q);
}

export function SubscriptionsPanel() {
  const { mentor } = useAppState();
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>('pending');
  const [emailQuery, setEmailQuery] = useState('');

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

  const buckets = useMemo(() => partitionAdminSubscriptions(rows), [rows]);

  const searching = Boolean(emailQuery.trim());

  const visible = useMemo(() => {
    // Email search spans Pending / Approved / Declined so mentors can find a
    // client without flipping tabs (e.g. already approved vs still pending).
    if (searching) {
      const pooled = [
        ...buckets.pending,
        ...buckets.approved,
        ...buckets.declined,
      ].filter((row) => emailMatches(row, emailQuery));
      return pooled.sort((a, b) =>
        String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
      );
    }
    if (filter === 'approved') return buckets.approved;
    if (filter === 'declined') return buckets.declined;
    return buckets.pending;
  }, [buckets, filter, emailQuery, searching]);

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
    setFilter('approved');
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
    setFilter('declined');
    await load();
  };

  const emptyLabel = searching
    ? `No clients match “${emailQuery.trim()}”.`
    : filter === 'pending'
      ? 'No pending payment reviews.'
      : filter === 'approved'
        ? 'No approved or active subscriptions.'
        : 'No declined or expired subscriptions.';

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>
        Review client payment submissions. Pending never lists emails that
        already have an active or approved subscription. Approve to activate
        access; decline blocks license generation for that client.
      </Text>

      <TextInput
        style={styles.search}
        value={emailQuery}
        onChangeText={setEmailQuery}
        placeholder="Search by client email…"
        placeholderTextColor="#6B7280"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        accessibilityLabel="Search clients by email"
      />

      <View style={styles.filterRow}>
        <Pressable
          style={[
            styles.filterBtn,
            !searching && filter === 'pending' && styles.filterOn,
          ]}
          onPress={() => {
            setFilter('pending');
            setEmailQuery('');
          }}
          accessibilityRole="button"
          accessibilityLabel="Pending subscriptions"
        >
          <Text style={styles.filterText}>
            Pending ({buckets.pending.length})
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.filterBtn,
            !searching && filter === 'approved' && styles.filterOn,
          ]}
          onPress={() => {
            setFilter('approved');
            setEmailQuery('');
          }}
          accessibilityRole="button"
          accessibilityLabel="Approved subscriptions"
        >
          <Text style={styles.filterText}>
            Approved ({buckets.approved.length})
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.filterBtn,
            !searching && filter === 'declined' && styles.filterOn,
          ]}
          onPress={() => {
            setFilter('declined');
            setEmailQuery('');
          }}
          accessibilityRole="button"
          accessibilityLabel="Declined subscriptions"
        >
          <Text style={styles.filterText}>
            Declined ({buckets.declined.length})
          </Text>
        </Pressable>
      </View>

      {searching ? (
        <Text style={styles.searchMeta}>
          Searching all tabs · {visible.length} match
          {visible.length === 1 ? '' : 'es'}
        </Text>
      ) : null}

      {msg ? <Text style={styles.msg}>{msg}</Text> : null}
      {err ? <Text style={styles.err}>{err}</Text> : null}

      {visible.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.empty}>{emptyLabel}</Text>
        </View>
      ) : (
        visible.map((row) => {
          const busy = busyId === row.id;
          const status = String(row.status || '').toLowerCase();
          const alreadyActive = isSubscriptionUsable(status);
          const canReview = status === 'pending' && !alreadyActive;
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
                      : status === 'declined' || status === 'expired'
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

              {canReview ? (
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
  search: {
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    backgroundColor: '#0B0E14',
    fontSize: 16, // iOS Safari zooms inputs under 16px
  },
  searchMeta: { color: '#9CA3AF', fontSize: 12 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterBtn: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  filterOn: {
    borderColor: CYAN,
    backgroundColor: 'rgba(94,200,255,0.12)',
  },
  filterText: { color: '#E5E7EB', fontWeight: '700', fontSize: 12 },
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
