/**
 * Mentors Portal data helpers — prefer Supabase, fall back to local AsyncStorage.
 * Admin mutations require the acting session email to be the super admin.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  SUPER_ADMIN_EMAIL,
  isSuperAdminEmail,
  type MentorSession,
} from '../../auth/mentorAuth';
import { getSupabase } from '../../supabase/client';

const LOCAL_PROFILES_KEY = 'edges-mentor-profiles-v1';

export type MentorProfileRow = {
  email: string;
  mentorName: string;
  name: string;
  contact: string;
  status: 'pending' | 'approved' | 'declined' | 'demo';
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
  passwordHash?: string;
  keyAllotment?: number;
};

function rowFromDb(r: Record<string, unknown>): MentorProfileRow {
  const statusRaw = String(r.status || 'pending');
  const status: MentorProfileRow['status'] =
    statusRaw === 'approved' ||
    statusRaw === 'declined' ||
    statusRaw === 'demo'
      ? statusRaw
      : 'pending';
  return {
    email: String(r.email || '').toLowerCase(),
    mentorName: String(r.mentor_name ?? r.mentorName ?? ''),
    name: String(r.name ?? ''),
    contact: String(r.contact ?? ''),
    status,
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

  const local = (await loadLocalProfiles()).find((p) => p.email === key) || null;
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

/**
 * List mentor profiles. Non–super-admins only receive their own row
 * (blocks using this helper as an admin directory scrape).
 */
export async function listMentorProfiles(
  actorEmail?: string | null,
): Promise<MentorProfileRow[]> {
  const actor = (actorEmail || '').trim().toLowerCase();
  const local = await loadLocalProfiles();
  const sb = getSupabase();

  let merged: MentorProfileRow[] = local;

  if (sb) {
    try {
      const { data, error } = await sb
        .from('mentor_profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) {
        const remote = data.map((r) => rowFromDb(r as Record<string, unknown>));
        const byEmail = new Map<string, MentorProfileRow>();
        for (const row of local) byEmail.set(row.email, row);
        for (const row of remote) {
          const prev = byEmail.get(row.email);
          byEmail.set(row.email, prev ? { ...prev, ...row } : row);
        }
        merged = [...byEmail.values()];
      }
    } catch {
      /* use local */
    }
  }

  merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (!actor) return [];
  if (!isSuperAdminEmail(actor)) {
    return merged.filter((r) => r.email === actor);
  }
  return merged;
}

/** Signup / self-register — forces pending (never approved). */
export async function registerMentorPending(input: {
  email: string;
  mentorName: string;
  name: string;
  contact: string;
  passwordHash?: string;
  createdAt?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const email = input.email.trim().toLowerCase();
  if (isSuperAdminEmail(email)) {
    return { ok: false, error: 'Use the super admin login instead of register.' };
  }

  const sb = getSupabase();
  if (!sb) return { ok: true };

  try {
    const { error: rpcErr } = await sb.rpc('register_mentor_pending', {
      p_email: email,
      p_mentor_name: input.mentorName.trim(),
      p_name: input.name.trim(),
      p_contact: input.contact.trim(),
      p_password_hash: input.passwordHash || null,
    });
    if (!rpcErr) return { ok: true };

    // Fallback when migration 005 is not applied yet — upsert as pending only.
    const payload = {
      email,
      mentor_name: input.mentorName.trim(),
      name: input.name.trim(),
      contact: input.contact.trim(),
      status: 'pending',
      password_hash: input.passwordHash || null,
      key_allotment: 0,
      created_at: input.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
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

/** Demo / super-admin seed upsert only. */
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

  // Non-admin rows may only be written as pending via this helper.
  if (
    input.status !== 'pending' &&
    !(input.status === 'demo' && isSuperAdminEmail(email))
  ) {
    return {
      ok: false,
      error: 'Approval status can only be changed by the super admin.',
    };
  }

  const payload = {
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
  status: 'approved' | 'declined' | 'pending',
  keyAllotment?: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSuperAdminEmail(actorEmail)) {
    return {
      ok: false,
      error: `Only the super admin (${SUPER_ADMIN_EMAIL}) can approve or decline mentors.`,
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

    // Fallback when migration 005 RPC is missing
    const patch: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (typeof keyAllotment === 'number') {
      patch.key_allotment = Math.max(0, Math.floor(keyAllotment));
    }
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
            : 'pending',
  };
}
