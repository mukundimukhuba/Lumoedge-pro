import { useEffect } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { useAppState } from '../AppState';
import { isAwaitingApproval, isPortalUnlocked } from './portalAccess';

/**
 * Hard route gate for every /portal/* screen.
 * Pending / declined / unknown → only /portal/pending (or login).
 * Never unlocks from local catalog sync.
 * Waits for mentorReady so hard reloads don't bounce unlocked sessions to login.
 */
export function usePortalAuthGate() {
  const { mentor, mentorReady } = useAppState();
  const router = useRouter();
  const pathname = usePathname() || '';

  useEffect(() => {
    if (!mentorReady) return;

    const path = pathname.replace(/\/+$/, '') || '/portal';
    const onLogin = path === '/portal' || path.endsWith('/portal');
    const onPending =
      path === '/portal/pending' || path.endsWith('/portal/pending');

    if (!mentor) {
      if (!onLogin) {
        router.replace('/portal');
      }
      return;
    }

    if (isAwaitingApproval(mentor.status, mentor.email, mentor.role)) {
      if (!onPending) {
        router.replace('/portal/pending');
      }
      return;
    }

    if (isPortalUnlocked(mentor.status, mentor.email, mentor.role)) {
      if (onPending || onLogin) {
        router.replace('/portal/dashboard');
      }
    }
  }, [mentor, mentorReady, pathname, router]);
}
