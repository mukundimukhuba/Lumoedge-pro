import { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAppState } from '../AppState';
import { fetchLicenseStatus } from '../licenses/remoteApi';

const ACCENT = '#7C5CFF';

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

export function LicenseKeysPanel() {
  const { eas, licenseKeys, generateLicenseKey, refreshLicenseCatalog, mentor } =
    useAppState();
  const [eaId, setEaId] = useState<string>(eas[0]?.id ?? '');
  const [assigneeName, setAssigneeName] = useState('');
  const [assigneeEmail, setAssigneeEmail] = useState('');
  const [flash, setFlash] = useState('');
  const [flashError, setFlashError] = useState(false);
  const [envLine, setEnvLine] = useState('Checking Supabase…');

  useEffect(() => {
    void refreshLicenseCatalog();
  }, [refreshLicenseCatalog]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const st = await fetchLicenseStatus();
      if (cancelled) return;
      if (!st.urlConfigured || !st.serviceRoleConfigured) {
        const names =
          st.missingEnvNames?.length
            ? st.missingEnvNames.join(', ')
            : [
                !st.urlConfigured ? 'SUPABASE_URL' : null,
                !st.serviceRoleConfigured
                  ? 'SUPABASE_SERVICE_ROLE_KEY'
                  : null,
              ]
                .filter(Boolean)
                .join(', ');
        setEnvLine(
          `Supabase env incomplete on Vercel — missing: ${names || 'SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY'}. Set in Vercel → Settings → Environment Variables, then redeploy. Cursor secrets do not bind to Vercel.`,
        );
        return;
      }
      const easT = st.tables?.managed_eas || '?';
      const keysT = st.tables?.license_keys || '?';
      if (easT === 'missing' || keysT === 'missing') {
        setEnvLine(
          `Supabase OK · tables missing (eas=${easT}, keys=${keysT}) · Storage fallback active. Apply migrations for full DB.`,
        );
      } else {
        setEnvLine(`Supabase OK · managed_eas=${easT} · license_keys=${keysT}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeId = eas.some((e) => e.id === eaId) ? eaId : eas[0]?.id ?? '';

  const myKeys = mentor?.email
    ? licenseKeys.filter(
        (k) =>
          !k.issuedByEmail ||
          k.issuedByEmail.toLowerCase() === mentor.email.toLowerCase(),
      )
    : licenseKeys;

  const onGenerate = async () => {
    if (!activeId) {
      setFlashError(true);
      setFlash('Create a robot in Manage EAs first.');
      return;
    }
    if (!assigneeName.trim()) {
      setFlashError(true);
      setFlash('Enter the client name before generating a key.');
      return;
    }
    if (!isValidEmail(assigneeEmail)) {
      setFlashError(true);
      setFlash('Enter a valid client email before generating a key.');
      return;
    }
    setFlashError(false);
    setFlash('Saving key to device + Supabase…');
    const result = await generateLicenseKey(activeId, {
      name: assigneeName.trim(),
      email: assigneeEmail.trim(),
    });
    if (!result) {
      setFlashError(true);
      setFlash('Could not generate key — pick a saved EA.');
      return;
    }
    const { key: row, remote } = result;
    if (remote.ok) {
      setFlashError(false);
      setFlash(
        `Generated ${row.key} for ${row.assigneeName} <${row.assigneeEmail}> · ${row.eaName}. Cloud sync OK (${remote.via || 'remote'}).${
          remote.hint ? ` Note: ${remote.hint}` : ''
        }`,
      );
      setAssigneeName('');
      setAssigneeEmail('');
    } else {
      setFlashError(true);
      setFlash(
        `Generated ${row.key} locally, but remote write FAILED: ${remote.error || 'unknown'}${
          remote.hint ? ` (${remote.hint})` : ''
        }. Activate on this device may still work; other devices will not see it until sync succeeds.`,
      );
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.h2}>Generate license keys</Text>
        <Text style={styles.hint}>
          Ask for the client name and email, then generate a key for a saved
          Manage EAs robot. Reuses the existing Generate → Activate path.
        </Text>
        <Text style={styles.env}>{envLine}</Text>

        <Text style={styles.label}>CLIENT NAME</Text>
        <TextInput
          style={styles.input}
          value={assigneeName}
          onChangeText={setAssigneeName}
          placeholder="Full name"
          placeholderTextColor="#6B7280"
        />
        <Text style={styles.label}>CLIENT EMAIL</Text>
        <TextInput
          style={styles.input}
          value={assigneeEmail}
          onChangeText={setAssigneeEmail}
          placeholder="client@email.com"
          placeholderTextColor="#6B7280"
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <Text style={styles.label}>EA</Text>
        {eas.length === 0 ? (
          <Text style={styles.hint}>No robots yet — save one under Manage EAs.</Text>
        ) : (
          <View style={styles.eaList}>
            {eas.map((ea) => {
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

        <Pressable
          style={[styles.gen, !activeId && styles.genDisabled]}
          onPress={onGenerate}
          accessibilityRole="button"
          accessibilityLabel="Generate license key"
        >
          <Text style={styles.genText}>GENERATE KEY</Text>
        </Pressable>
        {flash ? (
          <Text style={flashError ? styles.msgErr : styles.msg}>{flash}</Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Issued keys</Text>
        {myKeys.length === 0 ? (
          <Text style={styles.hint}>No keys yet.</Text>
        ) : (
          myKeys.map((k) => (
            <View key={k.id} style={styles.keyRow}>
              <Text style={styles.keyEa}>{k.eaName}</Text>
              <Text style={styles.keyVal} selectable>
                {k.key}
              </Text>
              {k.assigneeName || k.assigneeEmail ? (
                <Text style={styles.hint}>
                  For {k.assigneeName || '—'}
                  {k.assigneeEmail ? ` · ${k.assigneeEmail}` : ''}
                </Text>
              ) : null}
              <Text style={styles.hint}>
                {k.status || 'unused'} · {new Date(k.createdAt).toLocaleString()}
              </Text>
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
