import type { SubscriptionRow, SubscriptionStatus } from './types';

function apiBase() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
}

function mapSub(raw: Record<string, unknown>): SubscriptionRow {
  const statusRaw = String(raw.status || 'pending').toLowerCase();
  const status = (
    ['pending', 'approved', 'declined', 'active', 'expired'].includes(statusRaw)
      ? statusRaw
      : 'pending'
  ) as SubscriptionStatus;
  return {
    id: String(raw.id || ''),
    clientName: String(raw.clientName || raw.client_name || ''),
    clientEmail: String(raw.clientEmail || raw.client_email || '')
      .trim()
      .toLowerCase(),
    eaId: (raw.eaId || raw.ea_id || null) as string | null,
    eaName: (raw.eaName || raw.ea_name || null) as string | null,
    mentorEmail: (raw.mentorEmail || raw.mentor_email || null) as string | null,
    mentorName: (raw.mentorName || raw.mentor_name || null) as string | null,
    amountUsd: Number(raw.amountUsd ?? raw.amount_usd ?? 35) || 35,
    paymentMethod: String(raw.paymentMethod || raw.payment_method || ''),
    paymentReference: String(
      raw.paymentReference || raw.payment_reference || '',
    ),
    paymentProof: (raw.paymentProof || raw.payment_proof || null) as
      | string
      | null,
    paymentDate: String(
      raw.paymentDate || raw.payment_date || raw.createdAt || '',
    ),
    status,
    reviewedBy: (raw.reviewedBy || raw.reviewed_by || null) as string | null,
    reviewedAt: (raw.reviewedAt || raw.reviewed_at || null) as string | null,
    reviewNote: (raw.reviewNote || raw.review_note || null) as string | null,
    createdAt: String(raw.createdAt || raw.created_at || ''),
    updatedAt: String(raw.updatedAt || raw.updated_at || ''),
  };
}

export async function submitSubscription(input: {
  clientName: string;
  clientEmail: string;
  paymentMethod: string;
  paymentReference: string;
  paymentProof?: string;
  amountUsd?: number;
  eaName?: string;
  mentorEmail?: string;
}): Promise<
  | { ok: true; subscription: SubscriptionRow; via?: string; hint?: string }
  | { ok: false; error: string }
> {
  try {
    const res = await fetch(`${apiBase()}/api/subscriptions/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok || data.ok === false) {
      const code = data.code ? String(data.code) : '';
      if (code === 'SUBSCRIPTIONS_SCHEMA_MISSING' || res.status === 503) {
        return {
          ok: false,
          error:
            'Payment registration is temporarily unavailable. Please try again later or contact support.',
        };
      }
      return { ok: false, error: String(data.error || `HTTP ${res.status}`) };
    }
    const sub = data.subscription as Record<string, unknown> | undefined;
    if (!sub) return { ok: false, error: 'Empty subscription response' };
    const via = data.via ? String(data.via) : undefined;
    // Storage-only is not admin-listable/approvable without migration 008.
    if (via === 'storage') {
      return {
        ok: false,
        error:
          'Payment registration is temporarily unavailable. Please try again later or contact support.',
      };
    }
    return {
      ok: true,
      subscription: mapSub(sub),
      via,
      hint: data.hint ? String(data.hint) : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'submit unreachable',
    };
  }
}

export async function listSubscriptions(input: {
  role: 'admin' | 'client' | 'mentor';
  actorEmail: string;
  clientEmail?: string;
}): Promise<
  | { ok: true; subscriptions: SubscriptionRow[]; via?: string }
  | { ok: false; error: string; subscriptions: [] }
> {
  try {
    const res = await fetch(`${apiBase()}/api/subscriptions/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok || data.ok === false) {
      return {
        ok: false,
        error: String(data.error || `HTTP ${res.status}`),
        subscriptions: [],
      };
    }
    const rows = Array.isArray(data.subscriptions)
      ? (data.subscriptions as Record<string, unknown>[]).map(mapSub)
      : [];
    return {
      ok: true,
      subscriptions: rows,
      via: data.via ? String(data.via) : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'list unreachable',
      subscriptions: [],
    };
  }
}

export async function setSubscriptionStatus(input: {
  actorEmail: string;
  subscriptionId: string;
  status: 'approved' | 'declined' | 'active' | 'expired' | 'pending';
  reviewNote?: string;
}): Promise<
  | { ok: true; subscription: SubscriptionRow }
  | { ok: false; error: string }
> {
  try {
    const res = await fetch(`${apiBase()}/api/subscriptions/set-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok || data.ok === false) {
      return { ok: false, error: String(data.error || `HTTP ${res.status}`) };
    }
    const sub = data.subscription as Record<string, unknown> | undefined;
    if (!sub) return { ok: false, error: 'Empty response' };
    return { ok: true, subscription: mapSub(sub) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'set-status unreachable',
    };
  }
}

export async function listScopedLicenseKeys(input: {
  role: 'mentor' | 'client';
  actorEmail: string;
  clientEmail?: string;
}): Promise<{
  ok: boolean;
  keys: Array<Record<string, unknown>>;
  error?: string;
}> {
  try {
    const res = await fetch(`${apiBase()}/api/licenses/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok || data.ok === false) {
      return {
        ok: false,
        keys: [],
        error: String(data.error || `HTTP ${res.status}`),
      };
    }
    return {
      ok: true,
      keys: Array.isArray(data.keys)
        ? (data.keys as Record<string, unknown>[])
        : [],
    };
  } catch (err) {
    return {
      ok: false,
      keys: [],
      error: err instanceof Error ? err.message : 'licenses/list unreachable',
    };
  }
}
