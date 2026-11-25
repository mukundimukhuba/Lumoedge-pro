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
  const scope = actor && !isSuperAdminEmail(actor);
  const myEas = scope
    ? eas.filter(
        (e) =>
          ((e as ManagedEa & { ownerEmail?: string | null }).ownerEmail || '')
            .trim()
            .toLowerCase() === actor,
      )
    : eas;
  const myEaIds = new Set(myEas.map((e) => e.id));
  const mine = scope
    ? keys.filter((k) => {
        const issued = (
          (k as LicenseKey & { issuedByEmail?: string }).issuedByEmail || ''
        )
          .trim()
          .toLowerCase();
        return issued === actor || myEaIds.has(k.eaId);
      })
    : keys;

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
    easCount: scope ? myEas.length : eas.length,
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
    const scope = Boolean(actor && !isSuperAdminEmail(actor));

    // Prefer enriched columns when migration 004/006 is applied; fall back to id-only.
    let keysRes = await sb
      .from('license_keys')
      .select('id, status, activated_at, assignee_email, issued_by_email');
    if (keysRes.error) {
      keysRes = await sb.from('license_keys').select('id');
    }
    let easQuery = sb
      .from('managed_eas')
      .select('id', { count: 'exact', head: true });
    if (scope) {
      easQuery = sb
        .from('managed_eas')
        .select('id', { count: 'exact', head: true })
        .eq('owner_email', actor);
    }
    const easRes = await easQuery;

    if (keysRes.error) return local;

    const rows = keysRes.data || [];
    if (!rows.length && !local.keysTotal) {
      return {
        ...local,
        easCount: easRes.count ?? local.easCount,
        source: 'supabase',
      };
    }

    // If enriched fields missing (id-only rows), keep local active/unused math.
    const hasMeta = rows.some(
      (r) =>
        (r as { status?: string }).status != null ||
        (r as { assignee_email?: string }).assignee_email != null ||
        (r as { activated_at?: string }).activated_at != null,
    );
    if (!hasMeta) {
      return {
        ...local,
        keysTotal: Math.max(local.keysTotal, scope ? local.keysTotal : rows.length),
        easCount: easRes.count ?? local.easCount,
        source: 'supabase',
      };
    }

    let active = 0;
    let unused = 0;
    let revoked = 0;
    const assignees = new Set<string>();
    let counted = 0;
    for (const r of rows) {
      const issued = String(
        (r as { issued_by_email?: string }).issued_by_email || '',
      ).toLowerCase();
      if (scope) {
        if (issued !== actor) continue;
      }
      counted += 1;
      const st = normalizeStatus(
        (r as { status?: string }).status ||
          ((r as { activated_at?: string }).activated_at ? 'active' : 'unused'),
      );
      if (st === 'active') active += 1;
      else if (st === 'revoked') revoked += 1;
      else unused += 1;
      const email = (r as { assignee_email?: string }).assignee_email;
      if (email) assignees.add(String(email).toLowerCase());
    }

    return {
      keysTotal: counted || local.keysTotal,
      keysActive: active,
      keysUnused: unused,
      keysRevoked: revoked,
      easCount: easRes.count ?? local.easCount,
      subscribers: assignees.size || active,
      source: 'supabase',
    };
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
