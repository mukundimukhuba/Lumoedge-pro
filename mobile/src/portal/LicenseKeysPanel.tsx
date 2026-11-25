import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAppState } from '../AppState';
import { fetchLicenseStatus } from '../licenses/remoteApi';
import { listSubscriptions } from '../subscriptions/remoteApi';
import {
  LICENSE_DURATIONS,
  displaySubscriptionStatus,
  type LicenseDurationId,
  type SubscriptionRow,
} from '../subscriptions/types';
import { toSafeUserMessage } from './safeErrors';
import {
  isSuperAdminEmail,
  scopeCatalogForMentor,
} from './mentorScope';

const ACCENT = '#7C5CFF';

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

export function LicenseKeysPanel() {
  const {
    eas,
    licenseKeys,
    generateLicenseKey,
    refreshScopedLicenseKeys,
    mentor,
  } = useAppState();
  const scoped = useMemo(
    () => scopeCatalogForMentor(eas, licenseKeys, mentor?.email),
    [eas, licenseKeys, mentor?.email],
  );
  const myEas = scoped.eas;
  const myKeys = scoped.keys;
  const [eaId, setEaId] = useState<string>(myEas[0]?.id ?? '');
  const [assigneeName, setAssigneeName] = useState('');
  const [assigneeEmail, setAssigneeEmail] = useState('');
  const [duration, setDuration] = useState<LicenseDurationId>('30d');
  const [subscriptionId, setSubscriptionId] = useState<string>('');
  const [approvedSubs, setApprovedSubs] = useState<SubscriptionRow[]>([]);
  const [lastGenerated, setLastGenerated] = useState<{
    clientEmail: string;
    eaName: string;
    key: string;
    duration: string;
    status: string;
  } | null>(null);
  const [flash, setFlash] = useState('');
  const [flashError, setFlashError] = useState(false);
  const [envLine, setEnvLine] = useState('Checking Supabase…');
  const [regenerate, setRegenerate] = useState(false);

  const mentorEmail = mentor?.email?.trim().toLowerCase() || '';

  useEffect(() => {
    if (!mentorEmail) return;
    void refreshScopedLicenseKeys({ role: 'mentor', email: mentorEmail });
  }, [mentorEmail, refreshScopedLicenseKeys]);

  useEffect(() => {
    if (!myEas.some((e) => e.id === eaId)) {
      setEaId(myEas[0]?.id ?? '');
    }
  }, [myEas, eaId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const st = await fetchLicenseStatus();
      if (cancelled) return;
      if (!st.urlConfigured || !st.serviceRoleConfigured) {
        setEnvLine(toSafeUserMessage('service unavailable', 'portal'));
        return;
      }
      const easT = st.tables?.managed_eas || '?';
      const keysT = st.tables?.license_keys || '?';
      const subT = st.tables?.subscriptions || '?';
      if (easT === 'missing' || keysT === 'missing') {
        setEnvLine('Catalog sync is running in fallback mode.');
      } else {
        setEnvLine(
          `Supabase OK · eas=${easT} · keys=${keysT} · subscriptions=${subT}`,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mentorEmail) return;
    let cancelled = false;
    (async () => {
      const res = await listSubscriptions({
        role: 'mentor',
        actorEmail: mentorEmail,
        clientEmail: isValidEmail(assigneeEmail)
          ? assigneeEmail.trim().toLowerCase()
          : undefined,
      });
      if (cancelled) return;
      if (res.ok) {
        setApprovedSubs(res.subscriptions);
        if (res.subscriptions.length === 1 && !subscriptionId) {
          setSubscriptionId(res.subscriptions[0]!.id);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mentorEmail, assigneeEmail]);

  const activeId = myEas.some((e) => e.id === eaId)
    ? eaId
    : myEas[0]?.id ?? '';

  const onGenerate = async () => {
    if (!activeId) {
      setFlashError(true);
      setFlash('Select your EA first.');
      return;
    }
    if (!mentor?.email) {
      setFlashError(true);
      setFlash('Sign in to the Mentors Portal before generating keys.');
      return;
    }
    if (!isValidEmail(assigneeEmail)) {
      setFlashError(true);
      setFlash('Enter the client’s registered email.');
      return;
    }
    if (!duration) {
      setFlashError(true);
      setFlash('Select a license duration.');
      return;
    }
    const email = assigneeEmail.trim().toLowerCase();
    const matching = approvedSubs.filter((s) => s.clientEmail === email);
    if (!matching.length) {
      setFlashError(true);
      setFlash(
        'No approved subscription for this client email. Super admin must approve payment first.',
      );
      return;
    }
    const subId =
      subscriptionId && matching.some((s) => s.id === subscriptionId)
        ? subscriptionId
        : matching[0]!.id;
    const ea = myEas.find((e) => e.id === activeId);
    setFlashError(false);
    setFlash('Generating license key…');
    const result = await generateLicenseKey(activeId, {
      name: assigneeName.trim() || matching[0]!.clientName || email,
      email,
      duration,
      subscriptionId: subId,
      regenerate,
    });
    if (!result) {
      setFlashError(true);
      setFlash('Could not generate key — pick a saved EA.');
      return;
    }
    const { key: row, remote } = result;
    setLastGenerated({
      clientEmail: row.assigneeEmail || email,
      eaName: row.eaName || ea?.name || '',
      key: row.key,
      duration: row.licenseDuration || duration,
      status: row.licenseStatus || row.status || 'unused',
    });
    if (remote.ok) {
      setFlashError(false);
      setFlash(
        `License key generated · cloud sync OK (${remote.via || 'remote'}).`,
      );
      setAssigneeName('');
      setAssigneeEmail('');
      setSubscriptionId('');
      setRegenerate(false);
      await refreshScopedLicenseKeys({ role: 'mentor', email: mentorEmail });
    } else {
      setFlashError(true);
      setFlash(
        `Key saved on this device, but cloud sync failed. ${toSafeUserMessage(
          remote.error,
          'portal',
        )}`,
      );
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.h2}>Generate license keys</Text>
        <Text style={styles.hint}>
          Select your EA, enter the client’s registered email, choose duration,
          then generate. Keys are linked to you + EA + client email +
          subscription. Other mentors’ EAs never appear here.
        </Text>
        <Text style={styles.env}>{envLine}</Text>
        {mentor?.email && !isSuperAdminEmail(mentor.email) ? (
          <Text style={styles.env}>
            Scoped to {mentor.email} · {myEas.length} EA
            {myEas.length === 1 ? '' : 's'}
          </Text>
        ) : null}

        <Text style={styles.label}>1 · SELECT YOUR EA</Text>
        {myEas.length === 0 ? (
          <Text style={styles.hint}>No robots yet — save one under Manage EAs.</Text>
        ) : (
          <View style={styles.eaList}>
            {myEas.map((ea) => {
              const on = ea.id === activeId;
              return (
                <Pressable
                  key={ea.id}
                  onPress={() => setEaId(ea.id)}
                  style={[styles.eaChip, on && styles.eaChipOn]}
                >
                  <Text style={[styles.eaChipText, on && styles.eaChipTextOn]}>
                    {ea.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <Text style={styles.label}>2 · CLIENT REGISTERED EMAIL</Text>
        <TextInput
          style={styles.input}
          value={assigneeEmail}
          onChangeText={setAssigneeEmail}
          placeholder="client@email.com"
          placeholderTextColor="#6B7280"
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Text style={styles.label}>CLIENT NAME (optional)</Text>
        <TextInput
          style={styles.input}
          value={assigneeName}
          onChangeText={setAssigneeName}
          placeholder="Full name"
          placeholderTextColor="#6B7280"
        />

        <Text style={styles.label}>3 · LICENSE DURATION</Text>
        <View style={styles.eaList}>
          {LICENSE_DURATIONS.map((d) => {
            const on = d.id === duration;
            return (
              <Pressable
                key={d.id}
                onPress={() => setDuration(d.id)}
                style={[styles.eaChip, on && styles.eaChipOn]}
              >
                <Text style={[styles.eaChipText, on && styles.eaChipTextOn]}>
                  {d.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {approvedSubs.length > 0 ? (
          <>
            <Text style={styles.label}>APPROVED SUBSCRIPTION</Text>
            {approvedSubs.map((s) => {
              const on = s.id === subscriptionId;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => setSubscriptionId(s.id)}
                  style={[styles.subRow, on && styles.subRowOn]}
                >
                  <Text style={styles.subText}>
                    {s.clientEmail} · {displaySubscriptionStatus(s.status)} · $
                    {s.amountUsd}
                  </Text>
                  <Text style={styles.hint}>{s.id}</Text>
                </Pressable>
              );
            })}
          </>
        ) : (
          <Text style={styles.hint}>
            Enter an approved client email to link a subscription. Pending
            payments cannot receive keys.
          </Text>
        )}

        <Pressable
          onPress={() => setRegenerate((v) => !v)}
          style={styles.regenRow}
        >
          <Text style={styles.hint}>
            {regenerate ? '☑' : '☐'} Allow regenerate (revoke existing key for
            this subscription)
          </Text>
        </Pressable>

        <Pressable
          style={[styles.gen, !activeId && styles.genDisabled]}
          onPress={onGenerate}
          accessibilityRole="button"
          accessibilityLabel="Generate license key"
        >
          <Text style={styles.genText}>GENERATE LICENSE KEY</Text>
        </Pressable>
        {flash ? (
          <Text style={flashError ? styles.msgErr : styles.msg}>{flash}</Text>
        ) : null}
      </View>

      {lastGenerated ? (
        <View style={styles.card}>
          <Text style={styles.h2}>Generated key</Text>
          <Text style={styles.meta}>Client Email: {lastGenerated.clientEmail}</Text>
          <Text style={styles.meta}>EA Name: {lastGenerated.eaName}</Text>
          <Text style={styles.keyVal} selectable>
            {lastGenerated.key}
          </Text>
          <Text style={styles.meta}>
            License Duration: {lastGenerated.duration}
          </Text>
          <Text style={styles.meta}>
            License Status: {lastGenerated.status}
          </Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.h2}>Your issued keys</Text>
        {myKeys.length === 0 ? (
          <Text style={styles.hint}>No keys yet.</Text>
        ) : (
          myKeys.map((k) => (
            <View key={k.id} style={styles.keyRow}>
              <Text style={styles.keyEa}>{k.eaName}</Text>
              <Text style={styles.keyVal} selectable>
                {k.key}
              </Text>
              <Text style={styles.hint}>
                For {k.assigneeName || '—'}
                {k.assigneeEmail ? ` · ${k.assigneeEmail}` : ''}
              </Text>
              <Text style={styles.hint}>
                {k.licenseDuration || '—'} ·{' '}
                {k.licenseStatus || k.status || 'unused'} ·{' '}
                {new Date(k.createdAt).toLocaleString()}
              </Text>
              {k.subscriptionId ? (
                <Text style={styles.hint}>Sub: {k.subscriptionId}</Text>
              ) : null}
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, marginTop: 8 },
  card: {
    backgroundColor: '#12151C',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 14,
    gap: 10,
  },
  h2: { color: '#fff', fontWeight: '800', fontSize: 16 },
  hint: { color: '#9CA3AF', fontSize: 12, lineHeight: 17 },
  meta: { color: '#E5E7EB', fontSize: 13, lineHeight: 18 },
  env: { color: '#93C5FD', fontSize: 11, lineHeight: 16 },
  label: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
    marginTop: 4,
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
  eaList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  eaChip: {
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  eaChipOn: {
    borderColor: ACCENT,
    backgroundColor: 'rgba(124,92,255,0.25)',
  },
  eaChipText: { color: '#E5E7EB', fontWeight: '600', fontSize: 13 },
  eaChipTextOn: { color: '#fff' },
  subRow: {
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 10,
    padding: 10,
    gap: 2,
  },
  subRowOn: {
    borderColor: ACCENT,
    backgroundColor: 'rgba(124,92,255,0.15)',
  },
  subText: { color: '#E5E7EB', fontWeight: '600', fontSize: 13 },
  regenRow: { paddingVertical: 4 },
  gen: {
    marginTop: 6,
    borderRadius: 12,
    backgroundColor: ACCENT,
    paddingVertical: 14,
    alignItems: 'center',
  },
  genDisabled: { opacity: 0.45 },
  genText: { color: '#fff', fontWeight: '900', fontSize: 15, letterSpacing: 0.6 },
  msg: { color: '#86EFAC', fontSize: 13 },
  msgErr: { color: '#FCA5A5', fontSize: 13, lineHeight: 18 },
  keyRow: {
    gap: 4,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1F2937',
  },
  keyEa: { color: '#E5E7EB', fontWeight: '700', fontSize: 13 },
  keyVal: {
    color: '#fff',
    fontFamily: 'monospace',
    fontSize: 14,
    letterSpacing: 0.5,
  },
});
