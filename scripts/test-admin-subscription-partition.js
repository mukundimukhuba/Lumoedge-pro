/**
 * Offline unit checks for Super Admin Subscriptions pending/approved split.
 * Mirrors mobile/src/subscriptions/types.ts helpers (keep in sync).
 * Run: node scripts/test-admin-subscription-partition.js
 */
const assert = require('assert');

function subscriptionStatusRank(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'active') return 0;
  if (s === 'approved') return 1;
  if (s === 'pending') return 2;
  if (s === 'expired') return 3;
  if (s === 'declined') return 4;
  return 5;
}

function pickPreferredClientSubscription(rows) {
  if (!rows?.length) return null;
  const sorted = [...rows].sort((a, b) => {
    const byRank =
      subscriptionStatusRank(a.status) - subscriptionStatusRank(b.status);
    if (byRank !== 0) return byRank;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
  return sorted[0] || null;
}

function partitionAdminSubscriptions(rows) {
  const pending = [];
  const approved = [];
  const declined = [];
  if (!rows?.length) return { pending, approved, declined };

  const byEmail = new Map();
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
    if (s === 'active' || s === 'approved') approved.push(preferred);
    else if (s === 'pending') pending.push(preferred);
    else declined.push(preferred);
  }

  const byNewest = (a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  pending.sort(byNewest);
  approved.sort(byNewest);
  declined.sort(byNewest);
  return { pending, approved, declined };
}

// Active + newer pending for same email → Approved only (not Pending)
const mixed = partitionAdminSubscriptions([
  {
    id: 'pending-new',
    clientEmail: 'Client@Example.com',
    status: 'pending',
    createdAt: '2026-11-26T12:00:00.000Z',
  },
  {
    id: 'active-old',
    clientEmail: 'client@example.com',
    status: 'active',
    createdAt: '2026-11-26T02:00:00.000Z',
  },
]);
assert.strictEqual(mixed.pending.length, 0);
assert.strictEqual(mixed.approved.length, 1);
assert.strictEqual(mixed.approved[0].id, 'active-old');
assert.strictEqual(mixed.declined.length, 0);

// Genuine pending-only email stays in Pending
const onlyPending = partitionAdminSubscriptions([
  {
    id: 'p1',
    clientEmail: 'new@example.com',
    status: 'pending',
    createdAt: '2026-11-26T01:00:00.000Z',
  },
  {
    id: 'p2',
    clientEmail: 'new@example.com',
    status: 'pending',
    createdAt: '2026-11-26T03:00:00.000Z',
  },
]);
assert.strictEqual(onlyPending.pending.length, 1);
assert.strictEqual(onlyPending.pending[0].id, 'p2');
assert.strictEqual(onlyPending.approved.length, 0);

// Declined must not beat active (#94 / AN-129)
const declinedMask = partitionAdminSubscriptions([
  {
    id: 'declined-new',
    clientEmail: 'a@example.com',
    status: 'declined',
    createdAt: '2026-11-26T13:00:00.000Z',
  },
  {
    id: 'active-keep',
    clientEmail: 'a@example.com',
    status: 'active',
    createdAt: '2026-11-26T02:00:00.000Z',
  },
]);
assert.strictEqual(declinedMask.approved[0]?.id, 'active-keep');
assert.strictEqual(declinedMask.pending.length, 0);
assert.strictEqual(declinedMask.declined.length, 0);

// Pure declined → Declined tab
const pureDeclined = partitionAdminSubscriptions([
  {
    id: 'd1',
    clientEmail: 'x@example.com',
    status: 'declined',
    createdAt: '2026-11-26T04:00:00.000Z',
  },
]);
assert.strictEqual(pureDeclined.declined[0]?.id, 'd1');
assert.strictEqual(pureDeclined.pending.length, 0);

assert.strictEqual(
  pickPreferredClientSubscription([
    { id: 'n', status: 'pending', createdAt: '2026-11-26T12:00:00.000Z' },
    { id: 'o', status: 'active', createdAt: '2026-11-26T02:00:00.000Z' },
  ])?.id,
  'o',
);

console.log('OK admin subscription partition unit checks');
