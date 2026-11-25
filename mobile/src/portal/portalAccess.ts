/**
 * Mentors Portal access — pending hard-block + mentor vs super-admin nav.
 *
 * Unlock rule (strict):
 * - Super admin email alone may enter the portal shell
 * - Otherwise only status === 'approved' | 'demo'
 * - pending | declined | missing | unknown → wait screen only
 * Local/mock catalog ("source: local") never unlocks the portal.
 */
import { DEMO_MENTOR_EMAIL } from '../auth/mentorAuth';

/** Only this mailbox gets admin nav + may bypass pending. */
export const SUPER_ADMIN_EMAIL = DEMO_MENTOR_EMAIL;

export const ALL_NAV = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'mentors', label: 'Mentors' },
  { id: 'top-mentors', label: 'Top Mentors' },
  { id: 'manage-eas', label: 'Manage EAs' },
  { id: 'license-keys', label: 'License Keys' },
  { id: 'profile', label: 'Profile' },
  { id: 'settings', label: 'Settings' },
  { id: 'mentor-commission', label: 'Mentor Commission' },
  { id: 'self-hosting', label: 'Self Hosting' },
  { id: 'add-signal-direction', label: 'Add Signal Direction' },
] as const;

export type NavId = (typeof ALL_NAV)[number]['id'];

/** Approved mentors — never Mentors / Top Mentors / Settings / Commission. */
export const MENTOR_NAV_IDS: readonly NavId[] = [
  'dashboard',
  'license-keys',
  'manage-eas',
  'profile',
  'add-signal-direction',
  'self-hosting',
] as const;

export const ADMIN_ONLY_NAV_IDS: readonly NavId[] = [
  'mentors',
  'top-mentors',
  'settings',
  'mentor-commission',
] as const;

export function normalizeEmail(email: string | null | undefined): string {
  return (email || '').trim().toLowerCase();
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  return normalizeEmail(email) === SUPER_ADMIN_EMAIL;
}

/**
 * True only when the signed-in mentor may see portal chrome (Menu / sections).
 * Pending, declined, empty, or unknown status → false (unless super admin).
 */
export function isPortalUnlocked(
  status: string | null | undefined,
  email: string | null | undefined,
): boolean {
  if (isSuperAdminEmail(email)) return true;
  const s = String(status || '')
    .trim()
    .toLowerCase();
  return s === 'approved' || s === 'demo';
}

/** Pending / declined / unknown — show wait UI only. */
export function isAwaitingApproval(
  status: string | null | undefined,
  email: string | null | undefined,
): boolean {
  if (isSuperAdminEmail(email)) return false;
  return !isPortalUnlocked(status, email);
}

export function canAccessSection(
  section: string,
  email: string | null | undefined,
): boolean {
  if (!ALL_NAV.some((n) => n.id === section)) return false;
  if (isSuperAdminEmail(email)) return true;
  return (MENTOR_NAV_IDS as readonly string[]).includes(section);
}

export function navForEmail(email: string | null | undefined) {
  if (isSuperAdminEmail(email)) return [...ALL_NAV];
  return MENTOR_NAV_IDS.map((id) => ALL_NAV.find((n) => n.id === id)!).filter(
    Boolean,
  );
}

export function defaultSectionForEmail(
  email: string | null | undefined,
  requested?: string | null,
): NavId {
  if (requested && canAccessSection(requested, email)) {
    return requested as NavId;
  }
  return 'dashboard';
}

/** Where a signed-in mentor should land after auth. */
export function postAuthPortalPath(session: {
  email: string;
  status?: string | null;
}): '/portal/pending' | '/portal/dashboard' {
  if (isPortalUnlocked(session.status, session.email)) {
    return '/portal/dashboard';
  }
  return '/portal/pending';
}
