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
 * Incident: re-checkout created pending rows that masked existing active access.
 */
export function pickPreferredClientSubscription(
  rows: SubscriptionRow[] | null | undefined,
): SubscriptionRow | null {
  if (!rows?.length) return null;
  const rank = (status: string | null | undefined) => {
    const s = String(status || '').toLowerCase();
    if (s === 'active') return 0;
    if (s === 'approved') return 1;
    if (s === 'pending') return 2;
    if (s === 'expired') return 3;
    if (s === 'declined') return 4;
    return 5;
  };
  const sorted = [...rows].sort((a, b) => {
    const byRank = rank(a.status) - rank(b.status);
    if (byRank !== 0) return byRank;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
  return sorted[0] || null;
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
