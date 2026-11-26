/**
 * Offline unit checks for client subscription preference (incident AN-129).
 * Run: node scripts/test-subscription-preference.js
 */
const assert = require('assert');

function pickPreferredClientSubscription(rows) {
  if (!rows?.length) return null;
  const rank = (status) => {
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

const preferred = pickPreferredClientSubscription([
  {
    id: 'new-pending',
    status: 'pending',
    createdAt: '2026-11-26T12:00:00.000Z',
  },
  {
    id: 'old-active',
    status: 'active',
    createdAt: '2026-11-26T02:00:00.000Z',
  },
  {
    id: 'mid-approved',
    status: 'approved',
    createdAt: '2026-11-26T06:00:00.000Z',
  },
]);

assert.strictEqual(preferred?.id, 'old-active');
assert.strictEqual(
  pickPreferredClientSubscription([
    { id: 'p1', status: 'pending', createdAt: '2026-11-26T01:00:00.000Z' },
    { id: 'p2', status: 'pending', createdAt: '2026-11-26T03:00:00.000Z' },
  ])?.id,
  'p2',
);
assert.strictEqual(pickPreferredClientSubscription([]), null);

console.log('OK subscription preference unit checks');
