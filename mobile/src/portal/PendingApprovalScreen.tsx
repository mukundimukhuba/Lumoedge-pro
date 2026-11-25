import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  refreshMentorApproval,
  type MentorSession,
} from '../auth/mentorAuth';
import { useAppState } from '../AppState';
import {
  REGISTRATION_PENDING_MESSAGE,
  SUPER_ADMIN_EMAIL,
  denialReason,
  isPortalUnlocked,
} from './portalAccess';

const BG = '#05070D';
const BLUE = '#3B82F6';
const CARD = '#12151C';

/**
 * Standalone wait / denied state — no Menu, no portal chrome, no sections.
 * Pending mentors see the exact registration success copy from the spec.
 */
export function PendingApprovalScreen({ mentor }: { mentor: MentorSession }) {
  const router = useRouter();
  const { setMentor } = useAppState();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const reason = denialReason(mentor.status);
  const declined = reason === 'declined';
  const suspended = reason === 'suspended';

  const title = declined
    ? 'Signup declined'
    : suspended
      ? 'Account suspended'
      : 'Waiting for approval';

  const body = declined
    ? 'The super admin declined this mentor account. You do not have portal access. Contact them if you believe this is a mistake.'
    : suspended
      ? 'Your mentor account has been suspended. Portal tools, EAs, and license keys are locked until a Super Admin reactivates you.'
      : REGISTRATION_PENDING_MESSAGE;

  const logout = () => {
    setMentor(null);
    router.replace('/portal');
  };

  const checkStatus = async () => {
    setBusy(true);
    setMsg('');
    try {
      const next = await refreshMentorApproval(mentor.email);
      if (!next) {
        setMsg(
          'Still waiting — could not confirm approval yet. Stay on this screen until a super admin approves you.',
        );
        return;
      }
      setMentor(next);
      if (isPortalUnlocked(next.status, next.email, next.role)) {
        router.replace('/portal/dashboard');
        return;
      }
      const nextReason = denialReason(next.status);
      if (nextReason === 'declined') {
        setMsg('Your signup was declined by the super admin.');
        return;
      }
      if (nextReason === 'suspended') {
        setMsg('Your account is suspended. Portal access remains locked.');
        return;
      }
      setMsg(REGISTRATION_PENDING_MESSAGE);
    } catch {
      setMsg(
        'Could not reach the server. You remain pending — the portal stays locked.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root} accessibilityLabel="Waiting for mentor approval">
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Edges Mentors Portal</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
        <Text style={styles.meta}>Signed up as</Text>
        <Text style={styles.email} selectable>
          {mentor.email}
        </Text>
        {mentor.mentorName ? (
          <Text style={styles.metaName}>{mentor.mentorName}</Text>
        ) : null}
        <Text style={styles.adminHint}>Super admin: {SUPER_ADMIN_EMAIL}</Text>
        {msg ? <Text style={styles.msg}>{msg}</Text> : null}

        {!declined && !suspended ? (
          <Pressable
            style={styles.primary}
            onPress={() => void checkStatus()}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>
              {busy ? 'Checking…' : 'Check approval status'}
            </Text>
          </Pressable>
        ) : suspended ? (
          <Pressable
            style={styles.primary}
            onPress={() => void checkStatus()}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>
              {busy ? 'Checking…' : 'Check if reactivated'}
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          style={styles.secondary}
          onPress={logout}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryText}>Log out</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.35)',
    padding: 22,
    gap: 10,
  },
  eyebrow: {
    color: BLUE,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  title: {
    color: '#F9FAFB',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 4,
  },
  body: {
    color: '#D1D5DB',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 4,
  },
  meta: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 10,
  },
  email: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  metaName: { color: '#9CA3AF', fontSize: 13 },
  adminHint: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 6,
  },
  msg: {
    color: '#93C5FD',
    fontSize: 13,
    marginTop: 4,
  },
  primary: {
    backgroundColor: BLUE,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryText: {
    color: '#041018',
    fontWeight: '800',
    fontSize: 15,
  },
  secondary: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  secondaryText: {
    color: '#93C5FD',
    fontWeight: '700',
    fontSize: 14,
  },
});
