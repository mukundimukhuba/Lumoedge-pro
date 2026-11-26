import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const RCG_REGISTER_URL =
  'https://my.rcgmarkets.com/auth/register?partner_code=9113864';

const DEFAULT_SERVERS = ['RCGMarkets-Real', 'RCGMarkets-Demo'];
const SHARE_URL = 'https://lumoedgepro.vercel.app/giveaway/rcg';

type Step = 'verify' | 'claim' | 'done';

function apiBase(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'https://lumoedgepro.vercel.app';
}

async function api(path: string, opts?: { method?: string; body?: object }) {
  const res = await fetch(`${apiBase()}${path}`, {
    method: opts?.method || 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
  let data: any = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  return { res, data };
}

/**
 * RCG giveaway UI (Expo / SPA fallback when static HTML is not the response).
 * Same flow as /giveaway/rcg static page: verify MT5 → claim email → key.
 */
export function GiveawayRcgScreen() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('verify');
  const [servers, setServers] = useState<string[]>(DEFAULT_SERVERS);
  const [server, setServer] = useState(DEFAULT_SERVERS[0]!);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [claimToken, setClaimToken] = useState<string | null>(null);
  const [licenseKey, setLicenseKey] = useState('');
  const [msg, setMsg] = useState<{ text: string; kind: 'err' | 'ok' | 'info' } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [successNote, setSuccessNote] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { res, data } = await api('/api/giveaway/verify');
        if (cancelled || !res.ok || !Array.isArray(data?.servers) || !data.servers.length) {
          return;
        }
        setServers(data.servers);
        setServer((prev) =>
          data.servers.includes(prev) ? prev : String(data.servers[0]),
        );
      } catch {
        /* keep defaults */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openRegister = useCallback(() => {
    void Linking.openURL(RCG_REGISTER_URL);
  }, []);

  const onVerify = useCallback(async () => {
    setMsg(null);
    setBusy(true);
    try {
      const { res, data } = await api('/api/giveaway/verify', {
        method: 'POST',
        body: { server, login: login.trim(), password },
      });
      if (!res.ok || !data?.ok) {
        setMsg({
          text:
            data?.userMessage ||
            data?.error ||
            'Verification failed. Check login, password, and RCG server.',
          kind: 'err',
        });
        return;
      }
      setClaimToken(String(data.claimToken || ''));
      setPassword('');
      setStep('claim');
      if (data.alreadyClaimed) {
        setMsg({
          text: 'This RCG login already claimed — enter your email to retrieve your key.',
          kind: 'info',
        });
      }
    } catch {
      setMsg({
        text: 'Network error. Check your connection and try again.',
        kind: 'err',
      });
    } finally {
      setBusy(false);
    }
  }, [server, login, password]);

  const onClaim = useCallback(async () => {
    setMsg(null);
    if (!claimToken) {
      setMsg({ text: 'Please verify your RCG account first.', kind: 'err' });
      return;
    }
    setBusy(true);
    try {
      const { res, data } = await api('/api/giveaway/claim', {
        method: 'POST',
        body: {
          claimToken,
          email: email.trim(),
          name: name.trim(),
        },
      });
      if (!res.ok || !data?.ok) {
        setMsg({
          text: data?.userMessage || data?.error || 'Could not claim. Try again.',
          kind: 'err',
        });
        return;
      }
      setLicenseKey(String(data.key || ''));
      setSuccessNote(
        data.message ||
          'Claim successful — free robot + app access unlocked.',
      );
      setStep('done');
    } catch {
      setMsg({
        text: 'Network error. Check your connection and try again.',
        kind: 'err',
      });
    } finally {
      setBusy(false);
    }
  }, [claimToken, email, name]);

  const share = useCallback(async () => {
    const text = `Lumo Edge Pro free for RCG Markets accounts — verify your MT5 and claim a free robot + app key: ${SHARE_URL}`;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        await (navigator as any).share({
          title: 'Lumo Edge Pro RCG Giveaway',
          text,
          url: SHARE_URL,
        });
        return;
      } catch {
        /* fall through */
      }
    }
    void Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`);
  }, []);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: Math.max(insets.top, 18) + 8,
          paddingBottom: Math.max(insets.bottom, 28),
        },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.eyebrow}>Official giveaway</Text>
      <Text style={styles.brand}>
        Lumo Edge <Text style={styles.brandAccent}>Pro</Text>
      </Text>
      <Text style={styles.headline}>
        Free robot + free app access for RCG Markets accounts
      </Text>
      <Text style={styles.sub}>
        Verify your RCG trading account, then claim one free license key.
        Non-RCG brokers are not eligible.
      </Text>

      <Pressable
        style={styles.registerBtn}
        onPress={openRegister}
        accessibilityRole="link"
        accessibilityLabel="Open RCG account"
      >
        <Text style={styles.registerBtnText}>Open RCG account</Text>
        <Text style={styles.registerHint}>
          No account yet? Register with partner code 9113864
        </Text>
      </Pressable>

      <View style={styles.panel}>
        <View style={styles.steps}>
          {(['Verify', 'Claim', 'Key'] as const).map((label, i) => {
            const n = i + 1;
            const on =
              (step === 'verify' && n === 1) ||
              (step === 'claim' && n === 2) ||
              (step === 'done' && n === 3);
            const done =
              (step === 'claim' && n === 1) ||
              (step === 'done' && n < 3);
            return (
              <View
                key={label}
                style={[
                  styles.stepPill,
                  on && styles.stepOn,
                  done && styles.stepDone,
                ]}
              >
                <Text
                  style={[
                    styles.stepText,
                    on && styles.stepTextOn,
                    done && styles.stepTextDone,
                  ]}
                >
                  {n} · {label}
                </Text>
              </View>
            );
          })}
        </View>

        {step === 'verify' ? (
          <>
            <Text style={styles.label}>RCG MT5 server</Text>
            <View style={styles.serverRow}>
              {servers.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setServer(s)}
                  style={[
                    styles.serverChip,
                    server === s && styles.serverChipOn,
                  ]}
                >
                  <Text
                    style={[
                      styles.serverChipText,
                      server === s && styles.serverChipTextOn,
                    ]}
                  >
                    {/demo/i.test(s) ? `${s} (Demo)` : /real|live/i.test(s) ? `${s} (Live)` : s}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>MT5 login</Text>
            <TextInput
              style={styles.input}
              value={login}
              onChangeText={setLogin}
              placeholder="Your RCG account number"
              placeholderTextColor="#6B7280"
              keyboardType="number-pad"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>Trading password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Trading password (not investor)"
              placeholderTextColor="#6B7280"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Pressable
              style={[styles.btn, busy && styles.btnDisabled]}
              onPress={onVerify}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Verify with trading account</Text>
              )}
            </Pressable>
          </>
        ) : null}

        {step === 'claim' ? (
          <>
            <Text style={styles.label}>Your name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Name on the account"
              placeholderTextColor="#6B7280"
            />
            <Text style={styles.label}>Email for your license</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@email.com"
              placeholderTextColor="#6B7280"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              style={[styles.btn, busy && styles.btnDisabled]}
              onPress={onClaim}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Claim free access</Text>
              )}
            </Pressable>
            <Pressable
              style={styles.btnGhost}
              onPress={() => {
                setStep('verify');
                setClaimToken(null);
                setMsg(null);
              }}
            >
              <Text style={styles.btnGhostText}>Back to verify</Text>
            </Pressable>
          </>
        ) : null}

        {step === 'done' ? (
          <>
            <View style={styles.okBox}>
              <Text style={styles.okText}>{successNote}</Text>
            </View>
            <Text style={styles.keyBox} selectable>
              {licenseKey}
            </Text>
            <Pressable
              style={styles.btn}
              onPress={() => {
                if (Platform.OS === 'web' && navigator?.clipboard) {
                  void navigator.clipboard.writeText(licenseKey);
                }
              }}
            >
              <Text style={styles.btnText}>Copy license key</Text>
            </Pressable>
            <Text style={styles.howTitle}>Next steps</Text>
            <Text style={styles.howItem}>
              1. Open lumoedgepro.vercel.app (or the phone app).
            </Text>
            <Text style={styles.howItem}>
              2. Use the same email you entered above.
            </Text>
            <Text style={styles.howItem}>
              3. Paste this key on the Activate screen.
            </Text>
            <Text style={styles.howItem}>
              4. Connect Broker → RCG Markets to trade.
            </Text>
            <Pressable style={styles.btnGhost} onPress={share}>
              <Text style={styles.btnGhostText}>Share this giveaway</Text>
            </Pressable>
          </>
        ) : null}

        {msg ? (
          <View
            style={[
              styles.msg,
              msg.kind === 'err' && styles.msgErr,
              msg.kind === 'ok' && styles.msgOk,
              msg.kind === 'info' && styles.msgInfo,
            ]}
          >
            <Text style={styles.msgText}>{msg.text}</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.fine}>
        RCG Markets holders only · One free key per MT5 login and email ·
        Password is never stored
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05070D' },
  content: { paddingHorizontal: 16, maxWidth: 520, width: '100%', alignSelf: 'center' },
  eyebrow: {
    color: '#9AA3B5',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  brand: {
    color: '#F4F6FA',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.8,
    marginBottom: 12,
  },
  brandAccent: { color: '#E11D2E' },
  headline: {
    color: '#F4F6FA',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
    marginBottom: 8,
  },
  sub: { color: '#9AA3B5', fontSize: 15, lineHeight: 22, marginBottom: 16 },
  registerBtn: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(245, 185, 66, 0.45)',
    backgroundColor: 'rgba(245, 185, 66, 0.1)',
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  registerBtnText: {
    color: '#FFE2A3',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  registerHint: {
    color: '#C4B07A',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  panel: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(10, 14, 24, 0.78)',
    padding: 16,
  },
  steps: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  stepPill: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 4,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
  },
  stepOn: {
    backgroundColor: 'rgba(225, 29, 46, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(225, 29, 46, 0.45)',
  },
  stepDone: { borderWidth: 1, borderColor: 'rgba(45, 212, 168, 0.35)' },
  stepText: { color: '#9AA3B5', fontSize: 11, fontWeight: '600' },
  stepTextOn: { color: '#F4F6FA' },
  stepTextDone: { color: '#2DD4A8' },
  label: {
    color: '#9AA3B5',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    color: '#F4F6FA',
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
  },
  serverRow: { gap: 8 },
  serverChip: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  serverChipOn: {
    borderColor: 'rgba(225, 29, 46, 0.7)',
    backgroundColor: 'rgba(225, 29, 46, 0.16)',
  },
  serverChipText: { color: '#9AA3B5', fontSize: 14, fontWeight: '600' },
  serverChipTextOn: { color: '#F4F6FA' },
  btn: {
    marginTop: 16,
    borderRadius: 14,
    backgroundColor: '#E11D2E',
    paddingVertical: 15,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.55 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnGhost: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnGhostText: { color: '#F4F6FA', fontSize: 15, fontWeight: '600' },
  msg: { marginTop: 12, borderRadius: 12, padding: 11 },
  msgErr: {
    backgroundColor: 'rgba(225, 29, 46, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(225, 29, 46, 0.35)',
  },
  msgOk: {
    backgroundColor: 'rgba(45, 212, 168, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 168, 0.35)',
  },
  msgInfo: {
    backgroundColor: 'rgba(245, 185, 66, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245, 185, 66, 0.35)',
  },
  msgText: { color: '#F4F6FA', fontSize: 14, lineHeight: 20 },
  okBox: {
    backgroundColor: 'rgba(45, 212, 168, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 168, 0.35)',
    borderRadius: 12,
    padding: 11,
  },
  okText: { color: '#B8F5E3', fontSize: 14, lineHeight: 20 },
  keyBox: {
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(45, 212, 168, 0.45)',
    backgroundColor: 'rgba(45, 212, 168, 0.08)',
    color: '#F4F6FA',
    fontSize: 16,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    textAlign: 'center',
    letterSpacing: 0.6,
  },
  howTitle: {
    color: '#F4F6FA',
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 6,
  },
  howItem: { color: '#9AA3B5', fontSize: 14, lineHeight: 22 },
  fine: {
    marginTop: 18,
    color: '#9AA3B5',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
