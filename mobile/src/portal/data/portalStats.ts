import { getSupabase } from '../../supabase/client';
import type { LicenseKey, ManagedEa } from '../../AppState';
import { isSuperAdminEmail } from '../mentorScope';

export type DashboardStats = {
  keysTotal: number;
  keysActive: number;
  keysUnused: number;
  keysRevoked: number;
  easCount: number;
  subscribers: number;
  source: 'supabase' | 'local';
};

export type TopMentorRank = {
  email: string;
  mentorName: string;
  keysGenerated: number;
};

export type BrokerCount = {
  broker: string;
  count: number;
};

function normalizeStatus(raw: unknown): 'active' | 'unused' | 'revoked' {
  const s = String(raw || 'unused').toLowerCase();
  if (s === 'active' || s === 'activated') return 'active';
  if (s === 'revoked') return 'revoked';
  return 'unused';
}

export function statsFromLocal(
  keys: LicenseKey[],
  eas: ManagedEa[],
  mentorEmail?: string | null,
): DashboardStats {
  const actor = (mentorEmail || '').trim().toLowerCase();
  const isAdmin = Boolean(actor && isSuperAdminEmail(actor));
  // EAs always owner-scoped (including SA). Keys: mentors own; SA all.
  const myEas = actor
    ? eas.filter(
        (e) =>
          ((e as ManagedEa & { ownerEmail?: string | null }).ownerEmail || '')
            .trim()
            .toLowerCase() === actor,
      )
    : [];
  const myEaIds = new Set(myEas.map((e) => e.id));
  const mine = !actor
    ? keys
    : isAdmin
      ? keys
      : keys.filter((k) => {
          const issued = (
            (k as LicenseKey & { issuedByEmail?: string }).issuedByEmail || ''
          )
            .trim()
            .toLowerCase();
          return issued === actor || myEaIds.has(k.eaId);
        });

  let active = 0;
  let unused = 0;
  let revoked = 0;
  const assignees = new Set<string>();

  for (const k of mine) {
    const ext = k as LicenseKey & {
      status?: string;
      assigneeEmail?: string;
      activatedAt?: string;
    };
    const st = normalizeStatus(ext.status || (ext.activatedAt ? 'active' : 'unused'));
    if (st === 'active') active += 1;
    else if (st === 'revoked') revoked += 1;
    else unused += 1;
    if (ext.assigneeEmail) assignees.add(ext.assigneeEmail.toLowerCase());
  }

  return {
    keysTotal: mine.length,
    keysActive: active,
    keysUnused: unused,
    keysRevoked: revoked,
    easCount: myEas.length,
    subscribers: assignees.size || active,
    source: 'local',
  };
}

export async function fetchDashboardStats(opts: {
  keys: LicenseKey[];
  eas: ManagedEa[];
  mentorEmail?: string | null;
}): Promise<DashboardStats> {
  const local = statsFromLocal(opts.keys, opts.eas, opts.mentorEmail);
  const sb = getSupabase();
  if (!sb) return local;

  try {
    const actor = (opts.mentorEmail || '').trim().toLowerCase();
    if (!actor) return local;

    // Prefer isolation RPCs: EAs always owner-scoped; keys RPC still returns
    // all for SA and scoped for mentors (migration 006/009).
    const [keysRpc, easRpc] = await Promise.all([
      sb.rpc('list_mentor_license_keys', { actor_email: actor }),
      sb.rpc('list_mentor_eas', { actor_email: actor }),
    ]);
    if (!keysRpc.error && !easRpc.error) {
      const keyRows = (keysRpc.data || []) as Record<string, unknown>[];
      const eaRows = (easRpc.data || []) as unknown[];
      let active = 0;
      let unused = 0;
      let revoked = 0;
      const assignees = new Set<string>();
      for (const r of keyRows) {
        const st = normalizeStatus(
          r.status || r.license_status || (r.activated_at ? 'active' : 'unused'),
        );
        if (st === 'active') active += 1;
        else if (st === 'revoked') revoked += 1;
        else unused += 1;
        const email = r.assignee_email;
        if (email) assignees.add(String(email).toLowerCase());
      }
      return {
        keysTotal: keyRows.length,
        keysActive: active,
        keysUnused: unused,
        keysRevoked: revoked,
        easCount: eaRows.length,
        subscribers: assignees.size || active,
        source: 'supabase',
      };
    }
    // RPC unavailable — stay on already-scoped local stats (no global EA select).
    return local;
  } catch {
    return local;
  }
}

export async function fetchTopMentors(
  localFallback: TopMentorRank[] = [],
): Promise<TopMentorRank[]> {
  const sb = getSupabase();
  if (!sb) return localFallback;

  try {
    const [{ data: keys, error: keysErr }, { data: mentors }] =
      await Promise.all([
        sb.from('license_keys').select('issued_by_email'),
        sb.from('mentor_profiles').select('email, mentor_name, name'),
      ]);
    if (keysErr || !keys) return localFallback;

    const counts = new Map<string, number>();
    for (const row of keys) {
      const email = String(
        (row as { issued_by_email?: string }).issued_by_email || '',
      )
        .trim()
        .toLowerCase();
      if (!email) continue;
      counts.set(email, (counts.get(email) || 0) + 1);
    }

    const nameByEmail = new Map<string, string>();
    for (const m of mentors || []) {
      const email = String((m as { email?: string }).email || '').toLowerCase();
      const label =
        String(
          (m as { mentor_name?: string }).mentor_name ||
            (m as { name?: string }).name ||
            '',
        ) || email;
      if (email) nameByEmail.set(email, label);
    }

    const ranks: TopMentorRank[] = [...counts.entries()]
      .map(([email, keysGenerated]) => ({
        email,
        mentorName: nameByEmail.get(email) || email,
        keysGenerated,
      }))
      .sort((a, b) => b.keysGenerated - a.keysGenerated);

    return ranks.length ? ranks : localFallback;
  } catch {
    return localFallback;
  }
}

export async function fetchBrokerCounts(): Promise<BrokerCount[]> {
  const sb = getSupabase();
  if (!sb) return [];

  try {
    const { data, error } = await sb
      .from('broker_connections')
      .select('broker');
    if (error || !data) return [];
    const counts = new Map<string, number>();
    for (const row of data) {
      const broker = String((row as { broker?: string }).broker || '').trim();
      if (!broker) continue;
      counts.set(broker, (counts.get(broker) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([broker, count]) => ({ broker, count }))
      .filter((b) => b.count >= 1)
      .sort((a, b) => b.count - a.count || a.broker.localeCompare(b.broker));
  } catch {
    return [];
  }
}

export async function recordBrokerConnection(input: {
  id: string;
  broker: string;
  server?: string;
  login?: string;
  userEmail?: string;
  mentorEmail?: string;
}): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const login = String(input.login || '').trim();
  const mask =
    login.length <= 2
      ? login
      : `${login.slice(0, 2)}${'*'.repeat(Math.min(6, login.length - 2))}`;
  try {
    await sb.from('broker_connections').upsert(
      {
        id: input.id,
        broker: input.broker.trim(),
        server: input.server || null,
        login_mask: mask || null,
        user_email: input.userEmail || null,
        mentor_email: input.mentorEmail || null,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );
  } catch {
    /* best-effort */
  }
}
