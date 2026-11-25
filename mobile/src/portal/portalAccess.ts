/**
 * Mentors Portal access — roles, pending hard-block, mentor vs admin nav.
 *
 * Roles:
 * - super_admin (mukundimukhuba8@gmail.com): full portal
 * - mentor: own tools only when Approved
 * - regular_admin: never mentor tools / never auto Super Admin
 *
 * Unlock: super admin email OR (role mentor|demo + approved|demo).
 * pending | declined | suspended | unknown → wait/denied screen only.
 */
import { DEMO_MENTOR_EMAIL } from '../auth/mentorAuth';

export const SUPER_ADMIN_EMAIL = DEMO_MENTOR_EMAIL;

/** Exact copy required after mentor registration. */
export const REGISTRATION_PENDING_MESSAGE =
  'Registration successful! Your mentor account is waiting for Super Admin approval. You will receive access once your account has been approved.';

export type PortalRole = 'super_admin' | 'mentor' | 'regular_admin';

export const ALL_NAV = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'mentors', label: 'Mentors' },
  { id: 'subscriptions', label: 'Subscriptions' },
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
  'subscriptions',
  'top-mentors',
  'settings',
  'mentor-commission',
] as const;

/** Regular admin — never mentor tools; Profile only until assigned more. */
export const REGULAR_ADMIN_NAV_IDS: readonly NavId[] = ['profile'] as const;

export function normalizeEmail(email: string | null | undefined): string {
  return (email || '').trim().toLowerCase();
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  return normalizeEmail(email) === SUPER_ADMIN_EMAIL;
}

export function resolvePortalRole(
  email: string | null | undefined,
  role?: string | null,
): PortalRole {
  if (isSuperAdminEmail(email)) return 'super_admin';
  const r = String(role || '')
    .trim()
    .toLowerCase();
  if (r === 'regular_admin' || r === 'admin') return 'regular_admin';
  if (r === 'super_admin') return 'super_admin';
  return 'mentor';
}

export function isPortalUnlocked(
  status: string | null | undefined,
  email: string | null | undefined,
  role?: string | null,
): boolean {
  if (isSuperAdminEmail(email)) return true;
  const s = String(status || '')
    .trim()
    .toLowerCase();
  if (s === 'suspended' || s === 'declined' || s === 'pending' || !s) {
    return false;
  }
  const portalRole = resolvePortalRole(email, role);
  if (portalRole === 'regular_admin') {
    return s === 'approved';
  }
  // Mentors (and demo seed status for non-admin emails — treat as approved-like)
  return s === 'approved' || s === 'demo';
}

export function isAwaitingApproval(
  status: string | null | undefined,
  email: string | null | undefined,
  role?: string | null,
): boolean {
  if (isSuperAdminEmail(email)) return false;
  return !isPortalUnlocked(status, email, role);
}

export function denialReason(
  status: string | null | undefined,
): 'pending' | 'declined' | 'suspended' | 'unknown' {
  const s = String(status || '')
    .trim()
    .toLowerCase();
  if (s === 'declined') return 'declined';
  if (s === 'suspended') return 'suspended';
  if (s === 'pending' || !s) return 'pending';
  return 'unknown';
}

export function canAccessSection(
  section: string,
  email: string | null | undefined,
  role?: string | null,
): boolean {
  if (!ALL_NAV.some((n) => n.id === section)) return false;
  const portalRole = resolvePortalRole(email, role);
  if (portalRole === 'super_admin') return true;
  if (portalRole === 'regular_admin') {
    return (REGULAR_ADMIN_NAV_IDS as readonly string[]).includes(section);
  }
  return (MENTOR_NAV_IDS as readonly string[]).includes(section);
}

export function navForSession(session: {
  email?: string | null;
  role?: string | null;
}) {
  const portalRole = resolvePortalRole(session.email, session.role);
  if (portalRole === 'super_admin') return [...ALL_NAV];
  if (portalRole === 'regular_admin') {
    return REGULAR_ADMIN_NAV_IDS.map(
      (id) => ALL_NAV.find((n) => n.id === id)!,
    ).filter(Boolean);
  }
  return MENTOR_NAV_IDS.map((id) => ALL_NAV.find((n) => n.id === id)!).filter(
    Boolean,
  );
}

/** @deprecated use navForSession */
export function navForEmail(email: string | null | undefined) {
  return navForSession({ email });
}

export function defaultSectionForSession(
  session: { email?: string | null; role?: string | null },
  requested?: string | null,
): NavId {
  if (requested && canAccessSection(requested, session.email, session.role)) {
    return requested as NavId;
  }
  const nav = navForSession(session);
  return (nav[0]?.id as NavId) || 'dashboard';
}

export function defaultSectionForEmail(
  email: string | null | undefined,
  requested?: string | null,
): NavId {
  return defaultSectionForSession({ email }, requested);
}

export function postAuthPortalPath(session: {
  email: string;
  status?: string | null;
  role?: string | null;
}): '/portal/pending' | '/portal/dashboard' {
  if (isPortalUnlocked(session.status, session.email, session.role)) {
    return '/portal/dashboard';
  }
  return '/portal/pending';
}
