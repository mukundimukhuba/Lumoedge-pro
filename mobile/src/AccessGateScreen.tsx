import { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
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

/**
 * Front door before EA control UI.
 * Access opens Cape Pulse checkout (no name/email/proof form).
 * Pending state is persisted so Back lands on Approval pending.
 */
export function AccessGateScreen() {
  const { beginClientCheckout } = useAppState();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const openCheckout = async () => {
    setError('');
    setBusy(true);
    try {
      const result = await beginClientCheckout();
      if (!result.ok) {
        setError(toSafeUserMessage(result.error, 'register'));
        setBusy(false);
        return;
      }
      // Persist first, then leave so browser Back restores waiting UI.
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.assign(result.checkoutUrl);
        return;
      }
      try {
        await Linking.openURL(result.checkoutUrl);
      } catch {
        setError(toSafeUserMessage('Could not open payment page', 'register'));
        setBusy(false);
        return;
      }
      // Native: checkout opens externally; pending gate already set in state.
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
      <View style={styles.center}>
        <TripleTapLogo size={112} borderColor={RED} />
        <Text style={styles.brand}>EDGES</Text>
        <Text style={styles.product}>Lumo Edge Pro</Text>
        <Text style={styles.price}>$35</Text>
        <Text style={styles.tagline}>
          Continue to payment. After you pay, return here — your account waits
          for Super Admin approval before license activation.
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.cta,
            pressed && { opacity: 0.85 },
            busy && { opacity: 0.6 },
          ]}
          onPress={() => void openCheckout()}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Continue to Cape Pulse payment"
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.ctaText}>Continue to payment · $35</Text>
          )}
        </Pressable>
        <Text style={styles.fine}>
          Opens Cape Pulse checkout. Going Back brings you to Approval pending —
          not this screen again.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  center: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 40,
    alignItems: 'center',
    justifyContent: 'center',
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
  error: {
    color: '#FF6B6B',
    fontSize: 13,
    marginTop: 16,
    textAlign: 'center',
  },
  cta: {
    marginTop: 28,
    width: '100%',
    maxWidth: 360,
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
    marginTop: 14,
    color: '#6B7280',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    maxWidth: 320,
  },
});
