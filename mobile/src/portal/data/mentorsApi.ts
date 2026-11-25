/**
 * Mentors Portal data helpers — prefer Supabase, fall back to local AsyncStorage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabase } from '../../supabase/client';
import type { MentorSession } from '../../auth/mentorAuth';

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
    passwordHash: r.password_hash ? String(r.password_hash) : undefined,
  };
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
      role: (p as LocalStored & { role?: MentorProfileRow['role'] }).role || 'mentor',
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
    if (!prev) return;
    map[key] = { ...prev, ...patch, email: key };
    await AsyncStorage.setItem(LOCAL_PROFILES_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}


export async function fetchMentorProfile(
  email: string,
): Promise<MentorProfileRow | null> {
  const key = email.trim().toLowerCase();
  if (!key) return null;
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
    return local ? { ...local, ...remote } : remote;
  } catch {
    return local;
  }
}

export async function listMentorProfiles(): Promise<MentorProfileRow[]> {
  const local = await loadLocalProfiles();
  const sb = getSupabase();
  if (!sb) return local.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  try {
    const { data, error } = await sb
      .from('mentor_profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (error || !data) return local;

    const remote = data.map((r) => rowFromDb(r as Record<string, unknown>));
    const byEmail = new Map<string, MentorProfileRow>();
    for (const row of local) byEmail.set(row.email, row);
    for (const row of remote) {
      const prev = byEmail.get(row.email);
      byEmail.set(row.email, prev ? { ...prev, ...row } : row);
    }
    return [...byEmail.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  } catch {
    return local;
  }
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
  const payload = {
    email,
    mentor_name: input.mentorName.trim(),
    name: input.name.trim(),
    contact: input.contact.trim(),
    status: input.status,
    portal_role: input.status === 'demo' ? 'super_admin' : 'mentor',
    password_hash: input.passwordHash || null,
    key_allotment: Number(input.keyAllotment || 0) || 0,
    created_at: input.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const sb = getSupabase();
  if (!sb) return { ok: true };

  try {
    const { error } = await sb.from('mentor_profiles').upsert(payload, {
      onConflict: 'email',
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
  await patchLocalProfile(key, {
    status,
    ...(typeof keyAllotment === 'number' ? { keyAllotment } : {}),
  });

  const sb = getSupabase();
  if (!sb) return { ok: true };

  try {
    const patch: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (typeof keyAllotment === 'number') {
      patch.key_allotment = Math.max(0, Math.floor(keyAllotment));
    }
    // Prefer RPC when migration applied
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
