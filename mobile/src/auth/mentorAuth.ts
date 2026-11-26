/**
 * Mentors Portal auth helpers (seed login + local session).
 * Plaintext passwords are NEVER stored here — only a salted SHA-256 digest.
 */
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEMO_SALT = 'edges-ea-demo-v1';
const PROFILES_KEY = 'edges-mentor-profiles-v1';
const ACTIVE_SESSION_KEY = 'edges-mentor-active-session-v1';

/** Seed mentor email (identifier only). */
export const DEMO_MENTOR_EMAIL = 'mukundimukhuba8@gmail.com';

/**
 * Salted SHA-256 of the local mock password (generated offline).
 * Plaintext lives only in gitignored `demoSeed.local.json` on the agent machine.
 */
export const DEMO_MENTOR_PASSWORD_SHA256 =
  'cf2332b0090f1d94d668ade90e7188fd0fcf51eeea412783bd669c45e5db1fa4';

export type SignupRequest = {
  email: string;
  mentorName: string;
  name: string;
  contact: string;
  createdAt: string;
};

/** Signed-in mentor profile shown on Profile + drawer. */
export type MentorSession = {
  email: string;
  mentorName: string;
  name: string;
  contact: string;
  createdAt: string;
  /** demo | pending | approved | declined | suspended */
  status: 'demo' | 'pending' | 'approved' | 'declined' | 'suspended';
  /** Portal role — register always creates mentor */
  role?: 'super_admin' | 'mentor' | 'regular_admin';
};

export const SUPER_ADMIN_EMAIL = DEMO_MENTOR_EMAIL;

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  return (email || '').trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}

function normalizeStatus(
  raw: string | null | undefined,
): MentorSession['status'] {
  const s = String(raw || '').trim().toLowerCase();
  if (
    s === 'approved' ||
    s === 'demo' ||
    s === 'declined' ||
    s === 'suspended'
  ) {
    return s;
  }
  return 'pending';
}

export function normalizePortalRole(
  raw: string | null | undefined,
  email?: string | null,
): NonNullable<MentorSession['role']> {
  if ((email || '').trim().toLowerCase() === DEMO_MENTOR_EMAIL) {
    return 'super_admin';
  }
  const r = String(raw || '').trim().toLowerCase();
  if (r === 'regular_admin' || r === 'admin') return 'regular_admin';
  if (r === 'super_admin') return 'super_admin';
  return 'mentor';
}

type StoredProfile = MentorSession & {
  passwordHash: string;
};

export async function hashPassword(password: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${DEMO_SALT}:${password}`,
  );
}

export function demoMentorSession(): MentorSession {
  return {
    email: DEMO_MENTOR_EMAIL,
    mentorName: 'Mukundi',
    name: 'Mukundi Mukhuba',
    contact: '+27 82 000 0001',
    createdAt: '2026-01-15T10:00:00.000Z',
    status: 'demo',
    role: 'super_admin',
  };
}

async function loadProfiles(): Promise<Record<string, StoredProfile>> {
  try {
    const raw = await AsyncStorage.getItem(PROFILES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, StoredProfile>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function saveProfiles(map: Record<string, StoredProfile>) {
  await AsyncStorage.setItem(PROFILES_KEY, JSON.stringify(map));
}

export async function verifyDemoMentor(
  email: string,
  password: string,
): Promise<MentorSession | null> {
  try {
    const { hydrateSupabaseConfig } = await import('../supabase/client');
    await hydrateSupabaseConfig();
  } catch {
    /* local login still possible */
  }
  const normalized = email.trim().toLowerCase();
  const digest = await hashPassword(password);

  if (
    normalized === DEMO_MENTOR_EMAIL &&
    digest === DEMO_MENTOR_PASSWORD_SHA256
  ) {
    // Prefer any locally edited/registered overlay for the seed email
    const map = await loadProfiles();
    const stored = map[normalized];
    const session = stored
      ? (() => {
          const { passwordHash: _h, ...rest } = stored;
          return { ...demoMentorSession(), ...rest, status: 'demo' as const };
        })()
      : demoMentorSession();
    try {
      const { upsertMentorProfile } = await import('../portal/data/mentorsApi');
      await upsertMentorProfile({
        email: session.email,
        mentorName: session.mentorName,
        name: session.name,
        contact: session.contact,
        status: 'demo',
        createdAt: session.createdAt,
        keyAllotment: 999,
      });
    } catch {
      /* local demo still valid */
    }
    return session;
  }

  const map = await loadProfiles();
  let stored = map[normalized];

  // Local miss (other browser / cleared storage): verify against cloud hash.
  if (!stored || stored.passwordHash !== digest) {
    try {
      const { fetchMentorProfile } = await import('../portal/data/mentorsApi');
      const remote = await fetchMentorProfile(normalized);
      const remoteHash = remote?.passwordHash;
      if (!remote || !remoteHash || remoteHash !== digest) {
        return null;
      }
      const next: MentorSession = {
        email: normalized,
        mentorName: remote.mentorName || '',
        name: remote.name || '',
        contact: remote.contact || '',
        createdAt: remote.createdAt || new Date().toISOString(),
        status: normalizeStatus(remote.status),
        role: normalizePortalRole(remote.role, normalized),
      };
      map[normalized] = { ...next, passwordHash: digest };
      await saveProfiles(map);
      return next;
    } catch {
      return null;
    }
  }

  const { passwordHash: _h, ...session } = stored;

  // Prefer cloud approval status so pending stays locked until approved.
  try {
    const { fetchMentorProfile } = await import('../portal/data/mentorsApi');
    const remote = await fetchMentorProfile(normalized);
    if (remote) {
      // Never let a null remote hash wipe the digest we just verified.
      const next: MentorSession = {
        ...session,
        mentorName: remote.mentorName || session.mentorName,
        name: remote.name || session.name,
        contact: remote.contact || session.contact,
        status: normalizeStatus(remote.status),
        role: normalizePortalRole(
          (remote as { role?: string }).role,
          normalized,
        ),
      };
      map[normalized] = { ...next, passwordHash: digest };
      await saveProfiles(map);
      return next;
    }
  } catch {
    /* keep local — still pending unless explicitly approved */
  }
  return { ...session, status: normalizeStatus(session.status) };
}

/** Re-read approval status from Supabase (or local). Never invents approved. */
export async function refreshMentorApproval(
  email: string,
): Promise<MentorSession | null> {
  try {
    const { hydrateSupabaseConfig } = await import('../supabase/client');
    await hydrateSupabaseConfig();
  } catch {
    /* local refresh still possible */
  }
  const key = email.trim().toLowerCase();
  const map = await loadProfiles();
  const stored = map[key];
  if (!stored && key !== DEMO_MENTOR_EMAIL) return null;

  if (key === DEMO_MENTOR_EMAIL) {
    return demoMentorSession();
  }

  try {
    const { fetchMentorProfile } = await import('../portal/data/mentorsApi');
    const remote = await fetchMentorProfile(key);
    if (remote) {
      const base = stored
        ? (() => {
            const { passwordHash: _h, ...rest } = stored;
            return rest;
          })()
        : {
            email: key,
            mentorName: '',
            name: '',
            contact: '',
            createdAt: remote.createdAt || new Date().toISOString(),
            status: 'pending' as const,
          };
      const next: MentorSession = {
        ...base,
        email: key,
        mentorName: remote.mentorName || base.mentorName,
        name: remote.name || base.name,
        contact: remote.contact || base.contact,
        createdAt: remote.createdAt || base.createdAt,
        status: normalizeStatus(remote.status),
        role: normalizePortalRole(
          (remote as { role?: string }).role,
          key,
        ),
      };
      if (stored) {
        map[key] = { ...next, passwordHash: stored.passwordHash };
        await saveProfiles(map);
      }
      return next;
    }
  } catch {
    /* fall through */
  }

  if (!stored) return null;
  const { passwordHash: _h, ...session } = stored;
  // Without a confirmed cloud approved/demo status, stay pending.
  return { ...session, status: normalizeStatus(session.status) };
}

export async function registerMentor(fields: {
  email: string;
  mentorName: string;
  name: string;
  contact: string;
  password: string;
}): Promise<MentorSession> {
  const email = fields.email.trim().toLowerCase();
  const passwordHash = await hashPassword(fields.password);
  const session: MentorSession = {
    email,
    mentorName: fields.mentorName.trim(),
    name: fields.name.trim(),
    contact: fields.contact.trim(),
    createdAt: new Date().toISOString(),
    status: 'pending',
    role: 'mentor',
  };
  const map = await loadProfiles();
  map[email] = { ...session, passwordHash };
  await saveProfiles(map);
  try {
    const { hydrateSupabaseConfig } = await import('../supabase/client');
    await hydrateSupabaseConfig();
  } catch {
    /* local signup still valid */
  }
  // Prefer security-definer RPC so password_hash lands even when direct
  // upsert fails (e.g. missing portal_role column). Local signup still wins.
  try {
    const { registerMentorPendingRemote, upsertMentorProfile } = await import(
      '../portal/data/mentorsApi'
    );
    const rpc = await registerMentorPendingRemote({
      email: session.email,
      mentorName: session.mentorName,
      name: session.name,
      contact: session.contact,
      passwordHash,
    });
    if (!rpc.ok) {
      await upsertMentorProfile({
        email: session.email,
        mentorName: session.mentorName,
        name: session.name,
        contact: session.contact,
        status: 'pending',
        passwordHash,
        createdAt: session.createdAt,
        keyAllotment: 0,
      });
    }
  } catch {
    /* local signup still valid */
  }
  return session;
}

export function validateSignup(fields: {
  email: string;
  mentorName: string;
  name: string;
  contact: string;
  password: string;
  confirm: string;
}): string | null {
  if (!fields.email.trim() || !fields.email.includes('@')) {
    return 'Please enter a valid email.';
  }
  if (!fields.mentorName.trim()) return 'Mentor display name is required.';
  if (!fields.name.trim()) return 'Full name is required.';
  if (!fields.contact.trim()) return 'Contact number is required.';
  if (fields.password.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  if (fields.password !== fields.confirm) return 'Passwords do not match.';
  return null;
}


/** Persist signed-in mentor so hard reloads still hit the pending gate. */
export async function persistActiveMentorSession(
  session: MentorSession | null,
): Promise<void> {
  try {
    if (!session) {
      await AsyncStorage.removeItem(ACTIVE_SESSION_KEY);
      return;
    }
    await AsyncStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
}

export async function loadActiveMentorSession(): Promise<MentorSession | null> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MentorSession;
    if (!parsed?.email) return null;
    return {
      ...parsed,
      email: String(parsed.email).trim().toLowerCase(),
      status: normalizeStatus(parsed.status),
      role: normalizePortalRole(parsed.role, parsed.email),
    };
  } catch {
    return null;
  }
}
