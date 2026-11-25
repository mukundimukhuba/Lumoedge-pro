import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  LUMO_EDGE_PRO_CHECKOUT_URL,
  useAppState,
} from './AppState';
import { TripleTapLogo } from './TripleTapLogo';
import { toSafeUserMessage } from './portal/safeErrors';

const RED = '#FF0000';
const BG = '#050505';

/** @deprecated import from AppState — kept for existing callers */
export { LUMO_EDGE_PRO_CHECKOUT_URL };

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

/**
 * Front door before EA control UI.
 * Name + email → create pending subscription in Supabase.
 * Payment is external (Cape Pulse or elsewhere) — no payment-site callback.
 * Super Admin verifies manually in portal Subscriptions.
 */
export function AccessGateScreen() {
  const { beginClientCheckout } = useAppState();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const registerPending = async () => {
    setError('');
    if (!name.trim()) {
      setError('Enter your name');
      return;
    }
    if (!isValidEmail(email)) {
      setError('Enter a valid email');
      return;
    }
    setBusy(true);
    try {
      const result = await beginClientCheckout({
        name: name.trim(),
        email: email.trim(),
      });
      if (!result.ok) {
        setError(toSafeUserMessage(result.error, 'register'));
        setBusy(false);
        return;
      }
      // Optional external pay link — never wait on Cape Pulse callbacks.
      // Stay in-app on Approval pending (do not same-tab navigate away).
      try {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.open(result.checkoutUrl, '_blank', 'noopener,noreferrer');
        } else {
          await Linking.openURL(result.checkoutUrl);
        }
      } catch {
        /* payment link optional — pending row already created */
      }
      // Routing flips to PaymentPendingScreen via AppState; no further nav.
      setBusy(false);
    } catch (err) {
      setError(toSafeUserMessage(err, 'register'));
      setBusy(false);
    }
  };

  return (
    <View style={styles.root} accessibilityLabel="Lumo Edge Pro access">
      <LinearGradient
        colors={['#2A0000', '#0A0A0A', BG]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <TripleTapLogo size={112} borderColor={RED} />
          <Text style={styles.brand}>EDGES</Text>
          <Text style={styles.product}>Lumo Edge Pro</Text>
          <Text style={styles.price}>$35</Text>
          <Text style={styles.tagline}>
            Enter your name and email to register. Pay externally (Cape Pulse or
            elsewhere) — a Super Admin verifies payment manually before your
            license unlocks. This site does not read the payment page.
          </Text>

          <View style={styles.form}>
            <Text style={styles.label}>NAME</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor="#6B7280"
              autoCapitalize="words"
              editable={!busy}
              accessibilityLabel="Name"
            />
            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@email.com"
              placeholderTextColor="#6B7280"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              accessibilityLabel="Email"
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              style={({ pressed }) => [
                styles.cta,
                pressed && { opacity: 0.85 },
                busy && { opacity: 0.6 },
              ]}
              onPress={() => void registerPending()}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Register for Lumo Edge Pro access"
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.ctaText}>Register · $35</Text>
              )}
            </Pressable>
            <Text style={styles.fine}>
              Creates a pending subscription, then opens an optional payment
              link. You stay on Approval pending here until a Super Admin
              approves.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 40,
    alignItems: 'center',
  },
  brand: {
    marginTop: 4,
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 6,
  },
  product: {
    marginTop: 6,
    color: RED,
    fontSize: 20,
    fontWeight: '800',
  },
  price: {
    marginTop: 4,
    color: '#F9FAFB',
    fontSize: 42,
    fontWeight: '900',
  },
  tagline: {
    marginTop: 14,
    color: '#9CA3AF',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 320,
  },
  form: {
    width: '100%',
    maxWidth: 360,
    marginTop: 24,
    gap: 8,
  },
  label: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#12151C',
    borderWidth: 1,
    borderColor: '#2A2F3A',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: '#fff',
    fontSize: 16,
  },
  error: {
    color: '#FF6B6B',
    fontSize: 13,
    marginTop: 8,
  },
  cta: {
    marginTop: 18,
    backgroundColor: RED,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  ctaText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 0.2,
  },
  fine: {
    marginTop: 12,
    color: '#6B7280',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
});
