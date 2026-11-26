import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAppState } from '../AppState';
import {
  fetchCaptchaConfig,
  fetchLicenseStatus,
  issueCheckboxChallenge,
  type CaptchaPublicConfig,
} from '../licenses/remoteApi';
import { listSubscriptions } from '../subscriptions/remoteApi';
import {
  LICENSE_DURATIONS,
  type LicenseDurationId,
  type SubscriptionRow,
} from '../subscriptions/types';
import { toSafeUserMessage } from './safeErrors';
import {
  groupKeysByIssuer,
  isSuperAdminEmail,
  scopeCatalogForMentor,
} from './mentorScope';

const ACCENT = '#7C5CFF';

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

/** Match Subscriptions search UX: case-insensitive substring across key fields. */
function keyMatches(
  k: {
    key?: string | null;
    eaName?: string | null;
    assigneeEmail?: string | null;
    issuedByEmail?: string | null;
    mentorId?: string | null;
  },
  query: string,
) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystacks = [
    k.assigneeEmail,
    k.key,
    k.issuedByEmail,
    k.mentorId,
    k.eaName,
  ];
  return haystacks.some((v) =>
    String(v || '')
      .trim()
      .toLowerCase()
      .includes(q),
  );
}

export function LicenseKeysPanel() {
  const {
    eas,
    licenseKeys,
    generateLicenseKey,
    deleteLicenseKey,
    refreshScopedLicenseKeys,
    mentor,
  } = useAppState();
  const scoped = useMemo(
    () => scopeCatalogForMentor(eas, licenseKeys, mentor?.email),
    [eas, licenseKeys, mentor?.email],
  );
  const myEas = scoped.eas;
  const myKeys = scoped.keys;
  const isAdmin = isSuperAdminEmail(mentor?.email);
  const [keysQuery, setKeysQuery] = useState('');
  const searchingKeys = Boolean(keysQuery.trim());
  const filteredKeys = useMemo(
    () =>
      searchingKeys
        ? myKeys.filter((k) => keyMatches(k, keysQuery))
        : myKeys,
    [myKeys, keysQuery, searchingKeys],
  );
  const keysByIssuer = useMemo(
    () => (isAdmin ? groupKeysByIssuer(filteredKeys) : []),
    [isAdmin, filteredKeys],
  );
  const [eaId, setEaId] = useState<string>(myEas[0]?.id ?? '');
  const [assigneeName, setAssigneeName] = useState('');
  const [assigneeEmail, setAssigneeEmail] = useState('');
  const [duration, setDuration] = useState<LicenseDurationId>('30d');
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
  const [captcha, setCaptcha] = useState<CaptchaPublicConfig>({
    provider: 'checkbox',
    siteKey: null,
  });
  const [robotChecked, setRobotChecked] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [challengeBusy, setChallengeBusy] = useState(false);
  const [providerToken, setProviderToken] = useState<string | null>(null);

  const mentorEmail = mentor?.email?.trim().toLowerCase() || '';
  const robotVerified = Boolean(
    captcha.provider === 'checkbox'
      ? robotChecked && challengeToken
      : providerToken,
  );
  const activeId = myEas.some((e) => e.id === eaId)
    ? eaId
    : myEas[0]?.id ?? '';
  const canGenerate = Boolean(activeId && robotVerified);

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
    let cancelled = false;
    (async () => {
      const res = await fetchCaptchaConfig();
      if (cancelled) return;
      if (res.captcha) setCaptcha(res.captcha);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-link approved subscription for the typed client email (no picker UI).
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
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mentorEmail, assigneeEmail]);

  // Load Turnstile/reCAPTCHA widget script when site keys exist (web only).
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (captcha.provider === 'turnstile' && captcha.siteKey) {
      const id = 'cf-turnstile-script';
      if (!document.getElementById(id)) {
        const s = document.createElement('script');
        s.id = id;
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        s.async = true;
        document.head.appendChild(s);
      }
    }
    if (captcha.provider === 'recaptcha' && captcha.siteKey) {
      const id = 'g-recaptcha-script';
      if (!document.getElementById(id)) {
        const s = document.createElement('script');
        s.id = id;
        s.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(captcha.siteKey)}`;
        s.async = true;
        document.head.appendChild(s);
      }
    }
  }, [captcha.provider, captcha.siteKey]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (captcha.provider !== 'turnstile' || !captcha.siteKey) return;
    const host =
      document.getElementById('license-turnstile') ||
      (document.querySelector(
        '[data-nativeid="license-turnstile"], [id="license-turnstile"]',
      ) as HTMLElement | null);
    if (!host) return;
    host.setAttribute('id', 'license-turnstile');
    let widgetId: string | null = null;
    let cancelled = false;
    const tryRender = () => {
      const w = (window as unknown as {
        turnstile?: {
          render: (
            el: HTMLElement,
            opts: {
              sitekey: string;
              callback: (t: string) => void;
              'expired-callback'?: () => void;
              'error-callback'?: () => void;
            },
          ) => string;
        };
      }).turnstile;
      if (!w || cancelled) return false;
      host.innerHTML = '';
      widgetId = w.render(host, {
        sitekey: captcha.siteKey!,
        callback: (t: string) => setProviderToken(t),
        'expired-callback': () => setProviderToken(null),
        'error-callback': () => setProviderToken(null),
      });
      return true;
    };
    if (tryRender()) return;
    const timer = setInterval(() => {
      if (tryRender()) clearInterval(timer);
    }, 300);
    return () => {
      cancelled = true;
      clearInterval(timer);
      if (widgetId) host.innerHTML = '';
    };
  }, [captcha.provider, captcha.siteKey]);

  const resetRobot = () => {
    setRobotChecked(false);
    setChallengeToken(null);
    setProviderToken(null);
  };

  const onToggleRobot = async () => {
    if (captcha.provider !== 'checkbox') return;
    if (robotChecked) {
      resetRobot();
      return;
    }
    setChallengeBusy(true);
    setFlash('');
    const res = await issueCheckboxChallenge({ actorEmail: mentorEmail });
    setChallengeBusy(false);
    if (!res.ok || !res.token) {
      setFlashError(true);
      setFlash(res.error || 'Could not complete robot check.');
      resetRobot();
      return;
    }
    setRobotChecked(true);
    setChallengeToken(res.token);
  };

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
    const token =
      captcha.provider === 'checkbox' ? challengeToken : providerToken;
    if (!token) {
      setFlashError(true);
      setFlash('Confirm you’re not a robot before generating a key.');
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
    const subId = matching[0]!.id;
    const ea = myEas.find((e) => e.id === activeId);
    setFlashError(false);
    setFlash('Generating license key…');
    const result = await generateLicenseKey(activeId, {
      name: assigneeName.trim() || matching[0]!.clientName || email,
      email,
      duration,
      subscriptionId: subId,
      regenerate,
      challengeToken: token,
    });
    if (!result) {
      setFlashError(true);
      setFlash('Could not generate key — pick a saved EA.');
      return;
    }
    const { key: row, remote } = result;
    if (!remote.ok) {
      setFlashError(true);
      if (
        remote.code === 'email_has_mentor' ||
        /this email has a mentor/i.test(String(remote.error || ''))
      ) {
        setFlash(
          'This email has a mentor. Delete the existing license key first, then generate a new one.',
        );
      } else {
        setFlash(toSafeUserMessage(remote.error, 'portal'));
      }
      return;
    }
    setLastGenerated({
      clientEmail: row.assigneeEmail || email,
      eaName: row.eaName || ea?.name || '',
      key: row.key,
      duration: row.licenseDuration || duration,
      status: row.licenseStatus || row.status || 'unused',
    });
    setFlashError(false);
    setFlash(
      `License key generated · cloud sync OK (${remote.via || 'remote'}).`,
    );
    setAssigneeName('');
    setAssigneeEmail('');
    setRegenerate(false);
    resetRobot();
    await refreshScopedLicenseKeys({ role: 'mentor', email: mentorEmail });
  };

  const onDeleteKey = async (keyId: string, label: string) => {
    const confirmMsg = `Delete license key for ${label}? The client will lose EA access immediately and must subscribe again.`;
    if (typeof window !== 'undefined') {
      if (!window.confirm(confirmMsg)) return;
    }
    setFlashError(false);
    setFlash('Deleting license key…');
    const res = await deleteLicenseKey(keyId);
    if (!res.ok) {
      setFlashError(true);
      setFlash(toSafeUserMessage(res.error, 'portal'));
      return;
    }
    setFlashError(false);
    setFlash('License key deleted. Client access revoked — they must subscribe again.');
    if (lastGenerated) setLastGenerated(null);
    await refreshScopedLicenseKeys({ role: 'mentor', email: mentorEmail });
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.h2}>
          {isAdmin ? 'License keys oversight' : 'Generate license keys'}
        </Text>
        <Text style={styles.hint}>
          {isAdmin
            ? 'Super Admin can review keys issued by mentors (grouped below). Other mentors’ EA catalogs stay private — only your own EAs appear for generate.'
            : 'Select your EA, enter the client’s registered email, choose duration, confirm you’re not a robot, then generate. Keys are linked to you + EA + client email. Other mentors’ EAs never appear here.'}
        </Text>
        <Text style={styles.env}>{envLine}</Text>
        {mentor?.email ? (
          <Text style={styles.env}>
            {isAdmin
              ? `Keys oversight · your EAs: ${myEas.length}`
              : `Scoped to ${mentor.email} · ${myEas.length} EA${
                  myEas.length === 1 ? '' : 's'
                }`}
          </Text>
        ) : null}

        <Text style={styles.label}>1 · SELECT YOUR EA</Text>
        {myEas.length === 0 ? (
          <Text style={styles.hint}>
            {isAdmin
              ? 'No EAs owned by Super Admin — mentors generate keys from their own robots.'
              : 'No robots yet — save one under Manage EAs.'}
          </Text>
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

        <Pressable
          onPress={() => setRegenerate((v) => !v)}
          style={styles.regenRow}
        >
          <Text style={styles.hint}>
            {regenerate ? '☑' : '☐'} Allow regenerate (revoke existing key for
            this subscription)
          </Text>
        </Pressable>

        <Text style={styles.label}>4 · ROBOT CHECK</Text>
        {captcha.provider === 'checkbox' ? (
          <Pressable
            onPress={onToggleRobot}
            disabled={challengeBusy}
            style={[styles.robotRow, robotChecked && styles.robotRowOn]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: robotChecked, busy: challengeBusy }}
            accessibilityLabel="I'm not a robot"
          >
            <View
              style={[styles.robotBox, robotChecked && styles.robotBoxOn]}
              accessibilityElementsHidden
            >
              <Text style={styles.robotMark}>{robotChecked ? '✓' : ''}</Text>
            </View>
            <Text style={styles.robotLabel}>
              {challengeBusy ? 'Verifying…' : "I'm not a robot"}
            </Text>
          </Pressable>
        ) : captcha.provider === 'turnstile' ? (
          <View nativeID="license-turnstile" style={styles.widgetHost} />
        ) : captcha.provider === 'recaptcha' && captcha.siteKey ? (
          <Pressable
            onPress={async () => {
              const g = (
                window as unknown as {
                  grecaptcha?: {
                    ready: (cb: () => void) => void;
                    execute: (
                      siteKey: string,
                      opts: { action: string },
                    ) => Promise<string>;
                  };
                }
              ).grecaptcha;
              if (!g) {
                setFlashError(true);
                setFlash('reCAPTCHA is still loading — try again in a moment.');
                return;
              }
              g.ready(() => {
                void g
                  .execute(captcha.siteKey!, { action: 'generate_license' })
                  .then((t) => setProviderToken(t))
                  .catch(() => {
                    setProviderToken(null);
                    setFlashError(true);
                    setFlash('reCAPTCHA failed — try again.');
                  });
              });
            }}
            style={[styles.robotRow, providerToken && styles.robotRowOn]}
            accessibilityRole="button"
            accessibilityLabel="Verify with reCAPTCHA"
          >
            <Text style={styles.robotLabel}>
              {providerToken ? '✓ Verified with reCAPTCHA' : 'Verify with reCAPTCHA'}
            </Text>
          </Pressable>
        ) : (
          <Text style={styles.hint}>Robot check unavailable.</Text>
        )}

        <Pressable
          style={[styles.gen, !canGenerate && styles.genDisabled]}
          onPress={onGenerate}
          disabled={!canGenerate}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canGenerate }}
          accessibilityLabel="Generate license key"
        >
          <Text style={styles.genText}>GENERATE LICENSE KEY</Text>
        </Pressable>
        {!robotVerified ? (
          <Text style={styles.hint}>
            Generate stays disabled until the robot check is complete.
          </Text>
        ) : null}
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
        <Text style={styles.h2}>
          {isAdmin ? 'Keys by mentor / issuer' : 'Your issued keys'}
        </Text>
        {/* Always visible like Subscriptions email search — do not hide when empty. */}
        <TextInput
          style={styles.search}
          value={keysQuery}
          onChangeText={setKeysQuery}
          placeholder="Search by client email, key, mentor, or EA…"
          placeholderTextColor="#6B7280"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search license keys by client email, key code, mentor email, or EA name"
        />
        {searchingKeys ? (
          <Text style={styles.searchMeta}>
            {filteredKeys.length} match
            {filteredKeys.length === 1 ? '' : 'es'}
          </Text>
        ) : null}
        {myKeys.length === 0 ? (
          <Text style={styles.hint}>No keys yet.</Text>
        ) : searchingKeys && filteredKeys.length === 0 ? (
          <Text style={styles.hint}>
            No keys match “{keysQuery.trim()}”.
          </Text>
        ) : isAdmin ? (
          keysByIssuer.map((group) => (
            <View key={group.issuer} style={styles.issuerGroup}>
              <Text style={styles.issuerTitle}>{group.issuer}</Text>
              <Text style={styles.hint}>
                {group.keys.length} key{group.keys.length === 1 ? '' : 's'}
              </Text>
              {group.keys.map((k) => (
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
                  {String(k.licenseStatus || k.status || '').toLowerCase() !==
                  'revoked' ? (
                    <Pressable
                      onPress={() =>
                        void onDeleteKey(
                          k.id,
                          k.assigneeEmail || k.assigneeName || k.key,
                        )
                      }
                      style={styles.deleteBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete license key for ${k.assigneeEmail || k.eaName}`}
                    >
                      <Text style={styles.deleteText}>Delete key</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
          ))
        ) : (
          filteredKeys.map((k) => (
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
              {String(k.licenseStatus || k.status || '').toLowerCase() !==
              'revoked' ? (
                <Pressable
                  onPress={() =>
                    void onDeleteKey(
                      k.id,
                      k.assigneeEmail || k.assigneeName || k.key,
                    )
                  }
                  style={styles.deleteBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete license key for ${k.assigneeEmail || k.eaName}`}
                >
                  <Text style={styles.deleteText}>Delete key</Text>
                </Pressable>
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
    backgroundColor: 'rgba(12, 16, 28, 0.78)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(94, 200, 255, 0.28)',
    padding: 12,
    gap: 8,
  },
  h2: { color: '#fff', fontWeight: '800', fontSize: 16 },
  hint: { color: '#9CA3AF', fontSize: 12, lineHeight: 17 },
  meta: { color: '#E5E7EB', fontSize: 13, lineHeight: 18 },
  env: { color: '#93C5FD', fontSize: 11, lineHeight: 16 },
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
  issuerGroup: {
    gap: 6,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1F2937',
  },
  issuerTitle: { color: '#93C5FD', fontWeight: '800', fontSize: 13 },
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
    fontSize: 16, // iOS Safari zooms inputs under 16px
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
  regenRow: { paddingVertical: 4 },
  robotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#0B0E14',
  },
  robotRowOn: {
    borderColor: ACCENT,
    backgroundColor: 'rgba(124,92,255,0.12)',
  },
  robotBox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#9CA3AF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
  },
  robotBoxOn: {
    borderColor: ACCENT,
    backgroundColor: ACCENT,
  },
  robotMark: { color: '#fff', fontWeight: '900', fontSize: 14, lineHeight: 16 },
  robotLabel: { color: '#E5E7EB', fontWeight: '700', fontSize: 14 },
  widgetHost: { minHeight: 70, alignSelf: 'stretch' },
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
  deleteBtn: {
    alignSelf: 'flex-start',
    marginTop: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(127,29,29,0.35)',
  },
  deleteText: { color: '#FCA5A5', fontWeight: '800', fontSize: 12 },
});
