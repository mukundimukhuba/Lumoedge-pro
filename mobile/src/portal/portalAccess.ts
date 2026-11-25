/**
 * Mentors Portal section access — super admin vs approved mentor.
 */
import {
  SUPER_ADMIN_EMAIL,
  isSuperAdminEmail,
} from '../auth/mentorAuth';

export { SUPER_ADMIN_EMAIL, isSuperAdminEmail };

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

/** Sections approved mentors may open (order matches product request). */
export const MENTOR_NAV_IDS: readonly NavId[] = [
  'dashboard',
  'license-keys',
  'manage-eas',
  'profile',
  'add-signal-direction',
  'self-hosting',
] as const;

/** Admin-only — Mentors, Top Mentors, Settings, Commission, etc. */
export const ADMIN_ONLY_NAV_IDS: readonly NavId[] = [
  'mentors',
  'top-mentors',
  'settings',
  'mentor-commission',
] as const;

export function isPortalUnlocked(
  status: string | null | undefined,
  email: string | null | undefined,
): boolean {
  if (isSuperAdminEmail(email)) return true;
  return status === 'approved' || status === 'demo';
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
  const allowed = new Set<string>(MENTOR_NAV_IDS);
  // Keep mentor order from MENTOR_NAV_IDS, not full sidebar order.
  return MENTOR_NAV_IDS.map((id) => ALL_NAV.find((n) => n.id === id)!).filter(
    Boolean,
  ).filter((n) => allowed.has(n.id));
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
