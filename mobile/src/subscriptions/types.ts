export type SubscriptionStatus =
  | 'pending'
  | 'approved'
  | 'declined'
  | 'active'
  | 'expired';

export type SubscriptionRow = {
  id: string;
  clientName: string;
  clientEmail: string;
  eaId?: string | null;
  eaName?: string | null;
  mentorEmail?: string | null;
  mentorName?: string | null;
  amountUsd: number;
  paymentMethod: string;
  paymentReference: string;
  paymentProof?: string | null;
  paymentDate: string;
  status: SubscriptionStatus;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  createdAt: string;
  updatedAt?: string;
};

export const LICENSE_DURATIONS = [
  { id: '30d', label: '1 month' },
  { id: '90d', label: '3 months' },
  { id: '180d', label: '6 months' },
  { id: '365d', label: '1 year' },
  { id: 'unlimited', label: 'Unlimited' },
] as const;

export type LicenseDurationId = (typeof LICENSE_DURATIONS)[number]['id'];

export function isSubscriptionUsable(status: string | null | undefined) {
  const s = String(status || '').toLowerCase();
  return s === 'approved' || s === 'active';
}

/**
 * Prefer a usable (active/approved) subscription over a newer pending row.
 * Aligns with access-restore (#94): re-checkout pending must not mask active.
 */
export function pickPreferredClientSubscription(
  rows: SubscriptionRow[] | null | undefined,
): SubscriptionRow | null {
  if (!rows?.length) return null;
  const sorted = [...rows].sort((a, b) => {
    const byRank = subscriptionStatusRank(a.status) - subscriptionStatusRank(b.status);
    if (byRank !== 0) return byRank;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
  return sorted[0] || null;
}

/** Rank so active/approved beat pending/declined (AN-129 / #94). */
export function subscriptionStatusRank(status: string | null | undefined) {
  const s = String(status || '').toLowerCase();
  if (s === 'active') return 0;
  if (s === 'approved') return 1;
  if (s === 'pending') return 2;
  if (s === 'expired') return 3;
  if (s === 'declined') return 4;
  return 5;
}

export type AdminSubscriptionBuckets = {
  pending: SubscriptionRow[];
  approved: SubscriptionRow[];
  declined: SubscriptionRow[];
};

/**
 * Super Admin Subscriptions UI: one row per email, bucketed by preferred status.
 * Emails with active/approved never appear under Pending (hides superseded pending).
 */
export function partitionAdminSubscriptions(
  rows: SubscriptionRow[] | null | undefined,
): AdminSubscriptionBuckets {
  const pending: SubscriptionRow[] = [];
  const approved: SubscriptionRow[] = [];
  const declined: SubscriptionRow[] = [];
  if (!rows?.length) return { pending, approved, declined };

  const byEmail = new Map<string, SubscriptionRow[]>();
  for (const row of rows) {
    const email = String(row.clientEmail || '')
      .trim()
      .toLowerCase();
    if (!email) continue;
    const list = byEmail.get(email);
    if (list) list.push(row);
    else byEmail.set(email, [row]);
  }

  for (const group of byEmail.values()) {
    const preferred = pickPreferredClientSubscription(group);
    if (!preferred) continue;
    const s = String(preferred.status || '').toLowerCase();
    if (s === 'active' || s === 'approved') {
      approved.push(preferred);
    } else if (s === 'pending') {
      pending.push(preferred);
    } else {
      // declined, expired, or unknown — not actionable as pending
      declined.push(preferred);
    }
  }

  const byNewest = (a: SubscriptionRow, b: SubscriptionRow) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  pending.sort(byNewest);
  approved.sort(byNewest);
  declined.sort(byNewest);
  return { pending, approved, declined };
}

export function displaySubscriptionStatus(status: string | null | undefined) {
  const s = String(status || 'pending').toLowerCase();
  switch (s) {
    case 'pending':
      return 'Pending Approval';
    case 'approved':
      return 'Approved';
    case 'declined':
      return 'Declined';
    case 'active':
      return 'Active';
    case 'expired':
      return 'Expired';
    default:
      return s;
  }
}
