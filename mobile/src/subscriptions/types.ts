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
