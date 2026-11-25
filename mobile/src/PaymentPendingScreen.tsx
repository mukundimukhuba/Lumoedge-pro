import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppState } from './AppState';
import { toSafeUserMessage } from './portal/safeErrors';
import {
  displaySubscriptionStatus,
  isSubscriptionUsable,
  type SubscriptionRow,
} from './subscriptions/types';

const BG = '#070B14';
const CYAN = '#38BDF8';

/**
 * Client payment-approval wait only (NOT mentor /portal/pending).
 * Shown only when a genuine subscription row exists for this email.
 */
export function PaymentPendingScreen() {
  const insets = useSafeAreaInsets();
  const {
    eaAccess,
    clientSubscription,
    refreshClientSubscription,
    clearClientAccessSession,
  } = useAppState();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [confirmSwitch, setConfirmSwitch] = useState(false);

  const email = eaAccess?.email || clientSubscription?.clientEmail || '';
  const sub = clientSubscription as SubscriptionRow | null;
  const status = String(sub?.status || 'pending').toLowerCase();
  const declined = status === 'declined';
  const expired = status === 'expired';

  const title = declined
    ? 'Payment declined'
    : expired
      ? 'Subscription expired'
      : 'Approval pending';

  const body = declined
    ? 'Your payment was declined. Contact support or register again with updated payment proof.'
    : expired
      ? 'Your subscription has expired. Contact support to renew, or register with a different email.'
      : 'Your account is awaiting approval. You can continue once a Super Admin approves your payment.';

  const checkStatus = async () => {
    setBusy(true);
    setMsg('');
    try {
      const next = await refreshClientSubscription();
      if (!next?.id) {
        setMsg('Unable to check right now. Please try again in a moment.');
        return;
      }
      if (isSubscriptionUsable(next.status)) {
        setMsg('Approved — continuing…');
        return;
      }
      const st = String(next.status || '').toLowerCase();
      if (st === 'declined') {
        setMsg('Your payment was declined. Contact support or register again.');
        return;
      }
      if (st === 'expired') {
        setMsg('Your subscription has expired. Contact support to renew.');
        return;
      }
      setMsg('Still pending — a Super Admin has not approved your payment yet.');
    } catch (err) {
      setMsg(toSafeUserMessage(err, 'generic'));
    } finally {
      setBusy(false);
    }
  };

  const onSwitchEmail = async () => {
    if (!confirmSwitch) {
      setConfirmSwitch(true);
      setMsg(
        'Switch email? Your current pending request is kept. You will return to registration.',
      );
      return;
    }
    setBusy(true);
    try {
      await clearClientAccessSession({ keepSubscriptionRecord: true });
    } catch (err) {
      setMsg(toSafeUserMessage(err, 'generic'));
      setBusy(false);
      return;
    }
    setBusy(false);
  };

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: Math.max(insets.top, 16),
          paddingBottom: Math.max(insets.bottom, 16),
        },
      ]}
      accessibilityLabel="Client payment approval pending"
    >
      <LinearGradient
        colors={['#0B1A2E', '#070B14', '#05070D']}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.center}>
        <View style={styles.cardWrap}>
          {Platform.OS === 'ios' || Platform.OS === 'web' ? (
            <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.cardFallback]} />
          )}
          <LinearGradient
            colors={['rgba(56,189,248,0.18)', 'rgba(59,130,246,0.08)', 'transparent']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.cardInner}>
            <Text style={styles.eyebrow}>Lumo Edge Pro</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.body}>{body}</Text>

            <Text style={styles.meta}>Signed in as</Text>
            <Text style={styles.email} selectable>
              {email || '—'}
            </Text>
            {sub?.id ? (
              <Text style={styles.subMeta}>
                Status: {displaySubscriptionStatus(sub.status)}
              </Text>
            ) : null}

            {msg ? <Text style={styles.msg}>{msg}</Text> : null}

            {!declined ? (
              <Pressable
                style={[styles.primary, busy && styles.disabled]}
                onPress={() => void checkStatus()}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Check approval status"
              >
                {busy ? (
                  <ActivityIndicator color="#041018" />
                ) : (
                  <Text style={styles.primaryText}>Check approval status</Text>
                )}
              </Pressable>
            ) : null}

            <Pressable
              style={[styles.secondary, busy && styles.disabled]}
              onPress={() => void onSwitchEmail()}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Register with a different email"
            >
              <Text style={styles.secondaryText}>
                {confirmSwitch
                  ? 'Confirm — use a different email'
                  : 'Register with a different email'}
              </Text>
            </Pressable>
            {confirmSwitch ? (
              <Pressable
                onPress={() => {
                  setConfirmSwitch(false);
                  setMsg('');
                }}
                accessibilityRole="button"
              >
                <Text style={styles.cancel}>Cancel</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
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
  center: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  cardWrap: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 380,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.35)',
    backgroundColor: 'rgba(12,18,32,0.72)',
  },
  cardFallback: { backgroundColor: 'rgba(12,18,32,0.92)' },
  cardInner: {
    paddingHorizontal: 18,
    paddingVertical: 20,
    gap: 8,
  },
  eyebrow: {
    color: CYAN,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 2,
  },
  body: {
    color: '#CBD5E1',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
    marginBottom: 6,
  },
  meta: { color: '#94A3B8', fontSize: 11, fontWeight: '700', marginTop: 4 },
  email: {
    color: '#E2E8F0',
    fontSize: 15,
    fontWeight: '700',
  },
  subMeta: { color: '#94A3B8', fontSize: 12 },
  msg: {
    color: '#7DD3FC',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  primary: {
    marginTop: 10,
    backgroundColor: CYAN,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  primaryText: {
    color: '#041018',
    fontWeight: '800',
    fontSize: 14,
  },
  secondary: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.55)',
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: 'rgba(59,130,246,0.12)',
  },
  secondaryText: {
    color: '#DBEAFE',
    fontWeight: '700',
    fontSize: 13,
  },
  cancel: {
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 6,
    fontSize: 12,
  },
  disabled: { opacity: 0.55 },
});
