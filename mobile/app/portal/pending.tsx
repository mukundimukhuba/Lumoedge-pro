import { View } from 'react-native';
import { useAppState } from '../../src/AppState';
import { PendingApprovalScreen } from '../../src/portal/PendingApprovalScreen';
import {
  isAwaitingApproval,
  isPortalUnlocked,
} from '../../src/portal/portalAccess';
import { usePortalAuthGate } from '../../src/portal/usePortalAuthGate';

export default function PortalPendingRoute() {
  usePortalAuthGate();
  const { mentor } = useAppState();

  if (!mentor) {
    return <View style={{ flex: 1, backgroundColor: '#05070D' }} />;
  }

  if (isPortalUnlocked(mentor.status, mentor.email)) {
    return <View style={{ flex: 1, backgroundColor: '#05070D' }} />;
  }

  if (!isAwaitingApproval(mentor.status, mentor.email)) {
    return <View style={{ flex: 1, backgroundColor: '#05070D' }} />;
  }

  return <PendingApprovalScreen mentor={mentor} />;
}
