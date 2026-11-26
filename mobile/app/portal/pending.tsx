import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAppState } from '../../src/AppState';
import { PendingApprovalScreen } from '../../src/portal/PendingApprovalScreen';
import {
  isAwaitingApproval,
  isPortalUnlocked,
} from '../../src/portal/portalAccess';
import { usePortalAuthGate } from '../../src/portal/usePortalAuthGate';

/**
 * Never paint a blank black frame after register.
 * While session hydrates → visible loading.
 * Pending / declined / suspended → wait UI.
 * Unlocked → brief loading while gate routes to dashboard.
 */
export default function PortalPendingRoute() {
  usePortalAuthGate();
  const { mentor, mentorReady } = useAppState();

  if (!mentorReady) {
    return (
      <View style={styles.boot} accessibilityLabel="Loading mentor session">
        <ActivityIndicator color="#3B82F6" />
        <Text style={styles.bootText}>Loading…</Text>
      </View>
    );
  }

  if (!mentor) {
    return (
      <View style={styles.boot} accessibilityLabel="Returning to portal login">
        <ActivityIndicator color="#3B82F6" />
        <Text style={styles.bootText}>Returning to login…</Text>
      </View>
    );
  }

  if (isPortalUnlocked(mentor.status, mentor.email, mentor.role)) {
    return (
      <View style={styles.boot} accessibilityLabel="Opening mentors portal">
        <ActivityIndicator color="#3B82F6" />
        <Text style={styles.bootText}>Opening portal…</Text>
      </View>
    );
  }

  if (isAwaitingApproval(mentor.status, mentor.email, mentor.role)) {
    return <PendingApprovalScreen mentor={mentor} />;
  }

  // Unknown status — still show wait UI rather than a blank canvas.
  return <PendingApprovalScreen mentor={mentor} />;
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: '#05070D',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  bootText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '600',
  },
});
