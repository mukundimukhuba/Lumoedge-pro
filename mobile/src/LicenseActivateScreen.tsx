import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppState } from './AppState';
import { normalizeLicenseKey } from './licenseStorage';
import { TripleTapLogo } from './TripleTapLogo';
import { toSafeUserMessage } from './portal/safeErrors';
import {
  displaySubscriptionStatus,
  isSubscriptionUsable,
} from './subscriptions/types';

const CYAN = '#38BDF8';
const BG = '#070B14';

/**
 * License activation only — shown after a genuine approved/active subscription.
 * Payment-pending UI lives in PaymentPendingScreen (never invent pending here).
 */
export function LicenseActivateScreen() {
  const insets = useSafeAreaInsets();
  const {
    activateLicenseKey,
    eaAccess,
    clientSubscription,
    refreshClientSubscription,
    refreshScopedLicenseKeys,
    licenseKeys,
  } = useAppState();
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setChecking(true);
      const sub = await refreshClientSubscription();
      if (eaAccess?.email && isSubscriptionUsable(sub?.status)) {
        await refreshScopedLicenseKeys({
          role: 'client',
          email: eaAccess.email,
        });
      }
      if (!cancelled) setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [eaAccess?.email, refreshClientSubscription, refreshScopedLicenseKeys]);

  const status = clientSubscription?.status || 'active';
  const myKey =
    licenseKeys.find(
      (k) =>
        (k.assigneeEmail || '').toLowerCase() ===
        (eaAccess?.email || '').toLowerCase(),
    ) || null;

  const runActivate = async (raw: string) => {
    setError('');
    setBusy(true);
    try {
      const result = await activateLicenseKey(raw);
      if (!result.ok) setError(toSafeUserMessage(result.error, 'generic'));
    } catch (err) {
      setError(toSafeUserMessage(err, 'generic'));
    } finally {
      setBusy(false);
    }
  };

  if (checking) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={CYAN} />
        <Text style={styles.fine}>Preparing license…</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: BG }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scroll,
            {
              paddingTop: Math.max(insets.top, 24) + 24,
              paddingBottom: Math.max(insets.bottom, 24) + 16,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          bounces={false}
          overScrollMode="never"
        >
          <TripleTapLogo size={72} borderColor={CYAN} />
          <Text style={styles.heading}>
            Enter your license key to activate your Expert Advisor.
          </Text>

          <View style={styles.statusBox}>
            <Text style={styles.meta}>
              Subscription: {displaySubscriptionStatus(status)}
            </Text>
            <Text style={styles.meta}>Signed in as {eaAccess?.email}</Text>
          </View>

          {myKey ? (
            <View style={styles.issuedBox}>
              <Text style={styles.issuedLabel}>YOUR LICENSE KEY</Text>
              <Text style={styles.issuedEa}>{myKey.eaName}</Text>
              <Text style={styles.issuedKey} selectable>
                {normalizeLicenseKey(myKey.key)}
              </Text>
              {myKey.licenseDuration ? (
                <Text style={styles.meta}>
                  Duration: {myKey.licenseDuration} ·{' '}
                  {myKey.licenseStatus || myKey.status || 'unused'}
                </Text>
              ) : null}
              <Pressable
                style={({ pressed }) => [
                  styles.cta,
                  pressed && { opacity: 0.85 },
                  busy && { opacity: 0.6 },
                ]}
                onPress={() => {
                  const canonical = normalizeLicenseKey(myKey.key);
                  setKey(canonical);
                  void runActivate(canonical);
                }}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Activate your license key"
              >
                {busy ? (
                  <ActivityIndicator color="#041018" />
                ) : (
                  <Text style={styles.ctaText}>Activate this key</Text>
                )}
              </Pressable>
            </View>
          ) : (
            <View style={styles.issuedBox}>
              <Text style={styles.waiting}>
                Your payment has been approved. Your mentor is preparing your
                license key.
              </Text>
            </View>
          )}

          <View style={styles.form}>
            <Text style={styles.label}>LICENSE KEY</Text>
            <TextInput
              style={styles.input}
              value={key}
              onChangeText={(t) => setKey(normalizeLicenseKey(t))}
              placeholder="EDGES-XXXX-XXXX-XXXX-XXXX"
              placeholderTextColor="#6B7280"
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              editable={!busy}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              style={({ pressed }) => [
                styles.cta,
                pressed && { opacity: 0.85 },
                busy && { opacity: 0.6 },
              ]}
              onPress={() => void runActivate(key)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Activate EA"
            >
              {busy ? (
                <ActivityIndicator color="#041018" />
              ) : (
                <Text style={styles.ctaText}>Activate EA</Text>
              )}
            </Pressable>

            <Text style={styles.fine}>
              Only the key your mentor generated for{' '}
              {eaAccess?.email || 'your email'} will activate.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
    ...Platform.select({
      web: { minHeight: '100%' as unknown as number },
      default: {},
    }),
  },
  center: { justifyContent: 'center', alignItems: 'center', gap: 12 },
  scrollView: {
    flex: 1,
    backgroundColor: BG,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BG,
  },
  heading: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 28,
    textAlign: 'center',
    marginBottom: 20,
  },
  statusBox: {
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.28)',
    borderRadius: 12,
    padding: 12,
    gap: 4,
    marginBottom: 14,
    backgroundColor: 'rgba(12,18,32,0.85)',
  },
  meta: { color: '#9CA3AF', fontSize: 12, lineHeight: 17 },
  form: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    gap: 8,
  },
  label: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  input: {
    backgroundColor: '#12151C',
    borderWidth: 1,
    borderColor: '#2A2F3A',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 15,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 0.5,
  },
  error: { color: '#FF6B6B', fontSize: 13, marginTop: 4, lineHeight: 18 },
  cta: {
    marginTop: 14,
    backgroundColor: CYAN,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  ctaText: {
    color: '#041018',
    fontWeight: '800',
    fontSize: 15,
  },
  issuedBox: {
    width: '100%',
    maxWidth: 400,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.28)',
    borderRadius: 12,
    padding: 12,
    gap: 8,
    backgroundColor: 'rgba(12,18,32,0.85)',
  },
  issuedLabel: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  issuedEa: { color: '#E5E7EB', fontWeight: '700', fontSize: 13 },
  issuedKey: {
    color: '#fff',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    letterSpacing: 0.4,
  },
  waiting: {
    color: '#86EFAC',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  fine: {
    marginTop: 14,
    color: '#9CA3AF',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
});
