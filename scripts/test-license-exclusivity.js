/**
 * Offline unit checks for license exclusivity helpers (no network).
 * Run: node scripts/test-license-exclusivity.js
 */
const assert = require('assert');
const {
  MSG_EMAIL_HAS_MENTOR,
  MSG_ACTIVE_OTHER_DEVICE,
  isLiveKey,
} = require('../api/_lib/licenseExclusivity');
const { assertCanWriteOwnedRow, isSuperAdmin } =
  require('../api/_lib/mentorScope');

assert.strictEqual(MSG_EMAIL_HAS_MENTOR, 'This email has a mentor');
assert.strictEqual(
  MSG_ACTIVE_OTHER_DEVICE,
  'This email is active on another device',
);

assert.strictEqual(isLiveKey({ status: 'active', license_status: 'active' }), true);
assert.strictEqual(isLiveKey({ status: 'unused', license_status: 'unused' }), true);
assert.strictEqual(isLiveKey({ status: 'revoked', license_status: 'revoked' }), false);
assert.strictEqual(isLiveKey({ status: 'active', license_status: 'revoked' }), false);
assert.strictEqual(isLiveKey({ status: 'revoked', license_status: 'active' }), false);

// Mentor isolation preserved (delete must not cross mentors)
const MENTOR = 'mentor@example.com';
const OTHER = 'other@example.com';
{
  const gate = assertCanWriteOwnedRow({
    actorEmail: MENTOR,
    ownerEmail: OTHER,
    claimedOwnerEmail: OTHER,
    rowExists: true,
  });
  assert.strictEqual(gate.ok, false);
}
assert.strictEqual(isSuperAdmin(MENTOR), false);

console.log('OK license exclusivity unit checks');
