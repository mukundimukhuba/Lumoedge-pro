/**
 * Mentors Portal data helpers — shared DB via /api/mentors/* (service role).
 * Device AsyncStorage is only a password/session cache, never source of truth
 * for Super Admin Pending.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabase } from '../../supabase/client';
import type { MentorSession } from '../../auth/mentorAuth';
import { safeMessageFromApiBody, toSafeUserMessage } from '../safeErrors';

const LOCAL_PROFILES_KEY = 'edges-mentor-profiles-v1';

export type MentorProfileRow = {
  email: string;
  mentorName: string;
  name: string;
  contact: string;
  status: 'pending' | 'approved' | 'declined' | 'demo' | 'suspended';
  role: 'super_admin' | 'mentor' | 'regular_admin';
  keyAllotment: number;
  createdAt: string;
  passwordHash?: string;
};

type LocalStored = {
  email: string;
  mentorName: string;
  name: string;
  contact: string;
  createdAt: string;
  status: MentorProfileRow['status'];
  role?: MentorProfileRow['role'];
  passwordHash?: string;
  keyAllotment?: number;
};

function apiBase() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
}

function rowFromDb(r: Record<string, unknown>): MentorProfileRow {
  const statusRaw = String(r.status || 'pending');
  const status: MentorProfileRow['status'] =
    statusRaw === 'approved' ||
    statusRaw === 'declined' ||
    statusRaw === 'demo' ||
    statusRaw === 'suspended'
      ? statusRaw
      : 'pending';
  const roleRaw = String(r.portal_role ?? r.role ?? 'mentor').toLowerCase();
  const role: MentorProfileRow['role'] =
    roleRaw === 'super_admin' || roleRaw === 'regular_admin'
      ? roleRaw
      : 'mentor';
  return {
    email: String(r.email || '').toLowerCase(),
    mentorName: String(r.mentor_name ?? r.mentorName ?? ''),
    name: String(r.name ?? ''),
    contact: String(r.contact ?? ''),
    status,
    role,
    keyAllotment: Number(r.key_allotment ?? r.keyAllotment ?? 0) || 0,
    createdAt: String(r.created_at ?? r.createdAt ?? new Date().toISOString()),
    passwordHash: r.password_hash
      ? String(r.password_hash)
      : r.passwordHash
        ? String(r.passwordHash)
        : undefined,
  };
}

function rowFromApi(r: Record<string, unknown>): MentorProfileRow {
  return rowFromDb(r);
}

async function loadLocalProfiles(): Promise<MentorProfileRow[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_PROFILES_KEY);
    if (!raw) return [];
    const map = JSON.parse(raw) as Record<string, LocalStored>;
    return Object.values(map || {}).map((p) => ({
      email: String(p.email || '').toLowerCase(),
      mentorName: p.mentorName || '',
      name: p.name || '',
      contact: p.contact || '',
      status: p.status || 'pending',
      role:
        (p as LocalStored & { role?: MentorProfileRow['role'] }).role ||
        'mentor',
      keyAllotment: Number(p.keyAllotment || 0) || 0,
      createdAt: p.createdAt || new Date().toISOString(),
      passwordHash: p.passwordHash,
    }));
  } catch {
    return [];
  }
}

async function patchLocalProfile(
  email: string,
  patch: Partial<LocalStored>,
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_PROFILES_KEY);
    const map = raw
      ? (JSON.parse(raw) as Record<string, LocalStored>)
      : {};
    const key = email.trim().toLowerCase();
    const prev = map[key];
    if (!prev) {
      if (!patch.email && !key) return;
      map[key] = {
        email: key,
        mentorName: String(patch.mentorName || ''),
        name: String(patch.name || ''),
        contact: String(patch.contact || ''),
        createdAt: String(patch.createdAt || new Date().toISOString()),
        status: (patch.status as MentorProfileRow['status']) || 'pending',
        role: patch.role || 'mentor',
        passwordHash: patch.passwordHash,
        keyAllotment: Number(patch.keyAllotment || 0) || 0,
      };
    } else {
      map[key] = { ...prev, ...patch, email: key };
    }
    await AsyncStorage.setItem(LOCAL_PROFILES_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** Register mentor into shared DB via service-role API. */
export async function registerMentorPendingRemote(input: {
  email: string;
  mentorName: string;
  name: string;
  contact: string;
  passwordHash: string;
}): Promise<{ ok: boolean; error?: string; mentor?: MentorProfileRow }> {
  const email = input.email.trim().toLowerCase();
  // 1) Server API (works when Vercel has service role but no anon key)
  try {
    const res = await fetch(`${apiBase()}/api/mentors/register`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        mentorName: input.mentorName.trim(),
        name: input.name.trim(),
        contact: input.contact.trim(),
        passwordHash: input.passwordHash,
      }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (res.ok && data.ok && data.mentor) {
      return {
        ok: true,
        mentor: rowFromApi(data.mentor as Record<string, unknown>),
      };
    }
    // Fall through to client RPC if API missing (older deploy)
    if (res.status !== 404) {
      return {
        ok: false,
        error: safeMessageFromApiBody(data, 'register') || 'Register failed',
      };
    }
  } catch {
    /* try client supabase */
  }

  const sb = getSupabase();
  if (!sb) {
    return {
      ok: false,
      error:
        'Could not reach mentor registration service. Check connection and try again.',
    };
  }
  try {
    const { error } = await sb.rpc('register_mentor_pending', {
      p_email: email,
      p_mentor_name: input.mentorName.trim(),
      p_name: input.name.trim(),
      p_contact: input.contact.trim(),
      p_password_hash: input.passwordHash,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function fetchMentorProfile(
  email: string,
): Promise<MentorProfileRow | null> {
  const key = email.trim().toLowerCase();
  if (!key) return null;

  // Shared DB via service-role API first
  try {
    const res = await fetch(`${apiBase()}/api/mentors/get`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: key }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (res.ok && data.ok && data.mentor) {
      const remote = rowFromApi(data.mentor as Record<string, unknown>);
      await patchLocalProfile(key, {
        mentorName: remote.mentorName,
        name: remote.name,
        contact: remote.contact,
        status: remote.status,
        role: remote.role,
        keyAllotment: remote.keyAllotment,
        createdAt: remote.createdAt,
        passwordHash: remote.passwordHash,
      });
      return remote;
    }
  } catch {
    /* fall through */
  }

  const local =
    (await loadLocalProfiles()).find((row) => row.email === key) || null;
  const sb = getSupabase();
  if (!sb) return local;
  try {
    const { data, error } = await sb
      .from('mentor_profiles')
      .select('*')
      .eq('email', key)
      .maybeSingle();
    if (error || !data) return local;
    const remote = rowFromDb(data as Record<string, unknown>);
    if (!local) return remote;
    return {
      ...local,
      ...remote,
      passwordHash: remote.passwordHash || local.passwordHash,
    };
  } catch {
    return local;
  }
}

/**
 * Super Admin list — shared DB ONLY (no AsyncStorage merge).
 * Pass actorEmail so the API can authorize.
 */
export async function listMentorProfiles(
  actorEmail?: string,
): Promise<MentorProfileRow[]> {
  const actor = (actorEmail || '').trim().toLowerCase();

  if (actor) {
    // Super Admin Pending must never merge AsyncStorage as source of truth.
    const res = await fetch(`${apiBase()}/api/mentors/list`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ actorEmail: actor }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (res.ok && data.ok && Array.isArray(data.mentors)) {
      return (data.mentors as Record<string, unknown>[]).map(rowFromApi);
    }
    throw new Error(
      safeMessageFromApiBody(data, 'portal') ||
        'Could not load mentors from shared database',
    );
  }

  // Non-admin callers (e.g. Top Mentors name lookup): try anon client, else local names only.
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb
        .from('mentor_profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) {
        return data.map((r) => rowFromDb(r as Record<string, unknown>));
      }
    } catch {
      /* fall through */
    }
  }
  return (await loadLocalProfiles()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export async function upsertMentorProfile(input: {
  email: string;
  mentorName: string;
  name: string;
  contact: string;
  status: MentorProfileRow['status'];
  passwordHash?: string;
  keyAllotment?: number;
  createdAt?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const email = input.email.trim().toLowerCase();
  // Demo / seed path: prefer register API only for pending mentors
  if (input.status === 'pending' && input.passwordHash) {
    return registerMentorPendingRemote({
      email,
      mentorName: input.mentorName,
      name: input.name,
      contact: input.contact,
      passwordHash: input.passwordHash,
    });
  }

  const base = {
    email,
    mentor_name: input.mentorName.trim(),
    name: input.name.trim(),
    contact: input.contact.trim(),
    status: input.status,
    password_hash: input.passwordHash || null,
    key_allotment: Number(input.keyAllotment || 0) || 0,
    created_at: input.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const sb = getSupabase();
  if (!sb) return { ok: true };

  try {
    const withRole = {
      ...base,
      portal_role: input.status === 'demo' ? 'super_admin' : 'mentor',
    };
    let { error } = await sb.from('mentor_profiles').upsert(withRole, {
      onConflict: 'email',
    });
    if (error && /portal_role/i.test(error.message || '')) {
      ({ error } = await sb.from('mentor_profiles').upsert(base, {
        onConflict: 'email',
      }));
    }
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function setMentorStatus(
  actorEmail: string,
  email: string,
  status: 'approved' | 'declined' | 'pending' | 'suspended',
  keyAllotment?: number,
): Promise<{ ok: boolean; error?: string }> {
  const { isSuperAdminEmail, SUPER_ADMIN_EMAIL } = await import(
    '../../auth/mentorAuth'
  );
  if (!isSuperAdminEmail(actorEmail)) {
    return {
      ok: false,
      error: `Only the super admin (${SUPER_ADMIN_EMAIL}) can change mentor status.`,
    };
  }

  const key = email.trim().toLowerCase();

  try {
    const res = await fetch(`${apiBase()}/api/mentors/set-status`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        actorEmail: SUPER_ADMIN_EMAIL,
        email: key,
        status,
        keyAllotment:
          typeof keyAllotment === 'number'
            ? Math.max(0, Math.floor(keyAllotment))
            : undefined,
      }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (res.ok && data.ok) {
      await patchLocalProfile(key, {
        status,
        ...(typeof keyAllotment === 'number' ? { keyAllotment } : {}),
      });
      return { ok: true };
    }
    if (res.status !== 404) {
      return {
        ok: false,
        error: safeMessageFromApiBody(data, 'portal') || 'Status update failed',
      };
    }
  } catch {
    /* fall through to client */
  }

  await patchLocalProfile(key, {
    status,
    ...(typeof keyAllotment === 'number' ? { keyAllotment } : {}),
  });

  const sb = getSupabase();
  if (!sb) {
    return {
      ok: false,
      error:
        'Could not update mentor in shared database. Status was not changed.',
    };
  }

  try {
    const patch: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (typeof keyAllotment === 'number') {
      patch.key_allotment = Math.max(0, Math.floor(keyAllotment));
    }
    const { error: rpcErr } = await sb.rpc('admin_set_mentor_status', {
      actor_email: SUPER_ADMIN_EMAIL,
      target_email: key,
      new_status: status,
      new_allotment:
        typeof keyAllotment === 'number'
          ? Math.max(0, Math.floor(keyAllotment))
          : null,
    });
    if (!rpcErr) return { ok: true };

    const { error } = await sb
      .from('mentor_profiles')
      .update(patch)
      .eq('email', key);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function setMentorAllotment(
  actorEmail: string,
  email: string,
  keyAllotment: number,
): Promise<{ ok: boolean; error?: string }> {
  return setMentorStatus(
    actorEmail,
    email,
    'approved',
    Math.max(0, Math.floor(keyAllotment)),
  );
}

export function sessionFromProfile(p: MentorProfileRow): MentorSession {
  return {
    email: p.email,
    mentorName: p.mentorName,
    name: p.name,
    contact: p.contact,
    createdAt: p.createdAt,
    status:
      p.status === 'demo'
        ? 'demo'
        : p.status === 'approved'
          ? 'approved'
          : p.status === 'declined'
            ? 'declined'
            : p.status === 'suspended'
              ? 'suspended'
              : 'pending',
    role: p.role || 'mentor',
  };
}
