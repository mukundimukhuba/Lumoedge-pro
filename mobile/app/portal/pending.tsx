import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppState } from '../../src/AppState';
import { PendingApprovalScreen } from '../../src/portal/PendingApprovalScreen';
import { isPortalUnlocked } from '../../src/portal/portalAccess';

export default function PortalPendingRoute() {
  const router = useRouter();
  const { mentor } = useAppState();

  useEffect(() => {
    if (!mentor) {
      router.replace('/portal');
      return;
    }
    if (isPortalUnlocked(mentor.status, mentor.email)) {
      router.replace('/portal/dashboard');
    }
  }, [mentor, router]);

  if (!mentor || isPortalUnlocked(mentor.status, mentor.email)) {
    return <View style={{ flex: 1, backgroundColor: '#05070D' }} />;
  }

  return <PendingApprovalScreen mentor={mentor} />;
}
