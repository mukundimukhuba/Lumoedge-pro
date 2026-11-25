/**
 * Mentors Portal auth helpers (seed login + local session).
 * Plaintext passwords are NEVER stored here — only a salted SHA-256 digest.
 */
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEMO_SALT = 'edges-ea-demo-v1';
const PROFILES_KEY = 'edges-mentor-profiles-v1';

/** Seed / super-admin mentor email (identifier only). */
export const DEMO_MENTOR_EMAIL = 'mukundimukhuba8@gmail.com';

/** Alias — same mailbox approves mentor signups. */
export const SUPER_ADMIN_EMAIL = DEMO_MENTOR_EMAIL;

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
  /** demo | pending | approved | declined */
  status: 'demo' | 'pending' | 'approved' | 'declined';
};

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  return (email || '').trim().toLowerCase() === SUPER_ADMIN_EMAIL;
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
  const stored = map[normalized];
  if (!stored || stored.passwordHash !== digest) return null;
  const { passwordHash: _h, ...session } = stored;

  // Prefer cloud approval status so a pending mentor unlocks after admin approves.
  try {
    const { fetchMentorProfile } = await import('../portal/data/mentorsApi');
    const remote = await fetchMentorProfile(normalized);
    if (remote) {
      const next: MentorSession = {
        ...session,
        mentorName: remote.mentorName || session.mentorName,
        name: remote.name || session.name,
        contact: remote.contact || session.contact,
        status:
          remote.status === 'approved'
            ? 'approved'
            : remote.status === 'declined'
              ? 'declined'
              : remote.status === 'demo'
                ? 'demo'
                : 'pending',
      };
      map[normalized] = { ...next, passwordHash: digest };
      await saveProfiles(map);
      return next;
    }
  } catch {
    /* local session still valid */
  }
  return session;
}

/** Re-read approval status from Supabase (or local). */
export async function refreshMentorApproval(
  email: string,
): Promise<MentorSession | null> {
  const key = email.trim().toLowerCase();
  const map = await loadProfiles();
  const stored = map[key];
  if (!stored && key !== DEMO_MENTOR_EMAIL) return null;

  try {
    const { fetchMentorProfile } = await import('../portal/data/mentorsApi');
    const remote = await fetchMentorProfile(key);
    if (remote) {
      const base = stored
        ? (() => {
            const { passwordHash: _h, ...rest } = stored;
            return rest;
          })()
        : demoMentorSession();
      const next: MentorSession = {
        ...base,
        email: key,
        mentorName: remote.mentorName || base.mentorName,
        name: remote.name || base.name,
        contact: remote.contact || base.contact,
        createdAt: remote.createdAt || base.createdAt,
        status:
          key === DEMO_MENTOR_EMAIL
            ? 'demo'
            : remote.status === 'approved'
              ? 'approved'
              : remote.status === 'declined'
                ? 'declined'
                : remote.status === 'demo'
                  ? 'demo'
                  : 'pending',
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

  if (!stored) return key === DEMO_MENTOR_EMAIL ? demoMentorSession() : null;
  const { passwordHash: _h, ...session } = stored;
  return session;
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
  };
  const map = await loadProfiles();
  map[email] = { ...session, passwordHash };
  await saveProfiles(map);
  // Best-effort cloud sync so Mentors approve/decline works across devices.
  // Always pending — never auto-approve on signup.
  try {
    const { registerMentorPending } = await import('../portal/data/mentorsApi');
    await registerMentorPending({
      email: session.email,
      mentorName: session.mentorName,
      name: session.name,
      contact: session.contact,
      passwordHash,
      createdAt: session.createdAt,
    });
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
  if (!fields.email.trim() || !fields.email.includes('@')) return 'enter a valid email';
  if (!fields.mentorName.trim()) return 'mentor name required';
  if (!fields.name.trim()) return 'name required';
  if (!fields.contact.trim()) return 'contact number required';
  if (fields.password.length < 8) return 'password must be at least 8 characters';
  if (fields.password !== fields.confirm) return 'passwords do not match';
  return null;
}
