import { useState } from 'react';
import {
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
import { useAppState } from './AppState';
import { TripleTapLogo } from './TripleTapLogo';

const RED = '#FF0000';
const BG = '#050505';

/** External checkout / payment contact — CapePulse (no in-app PayPal or demo pay). */
export const LUMO_EDGE_PRO_CHECKOUT_URL =
  'https://capepaulse.lovable.app/contact';

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

/**
 * Front door before EA control UI.
 * Collects Email + Name, opens real checkout, then continues to license-key activate.
 */
export function AccessGateScreen() {
  const { unlockEaAccess } = useAppState();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onAccess = async () => {
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
      await Linking.openURL(LUMO_EDGE_PRO_CHECKOUT_URL);
      // Record email + name so the user can activate with a mentor license key.
      // Payment happens on the external checkout page (not in-app).
      await unlockEaAccess({ email: email.trim(), name: name.trim() });
    } catch {
      setError('Could not open checkout — try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
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
        >
          <TripleTapLogo size={112} borderColor={RED} />
          <Text style={styles.brand}>EDGES</Text>
          <Text style={styles.product}>Lumo Edge Pro</Text>
          <Text style={styles.price}>$35</Text>
          <Text style={styles.tagline}>
            Step 1 of 2 — purchase Lumo Edge Pro access, then activate with your
            mentor license key.
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
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              style={({ pressed }) => [
                styles.cta,
                pressed && { opacity: 0.85 },
                busy && { opacity: 0.6 },
              ]}
              onPress={onAccess}
              disabled={busy}
              accessibilityRole="link"
              accessibilityLabel="Open checkout for Lumo Edge Pro, 35 dollars"
            >
              <Text style={styles.ctaText}>Access · Lumo Edge Pro — $35</Text>
            </Pressable>
            <Text style={styles.fine}>
              Opens checkout to complete your $35 purchase. After you pay, return
              here and enter your mentor license key to activate your EA (name,
              picture, symbols).
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
    marginTop: 10,
    color: '#9CA3AF',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 320,
  },
  form: {
    width: '100%',
    maxWidth: 360,
    marginTop: 28,
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
  error: { color: '#FF6B6B', fontSize: 13, marginTop: 4 },
  cta: {
    marginTop: 18,
    backgroundColor: RED,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
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
