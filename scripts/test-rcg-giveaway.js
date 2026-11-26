/**
 * Unit checks for RCG giveaway allowlist + claim token round-trip.
 * Run: node scripts/test-rcg-giveaway.js
 */
const assert = require('assert');
const {
  assertRcgAccount,
  isRcgServer,
  isRcgCompany,
  rcgServerAllowlist,
} = require('../api/_lib/rcgAllowlist');
const {
  makeClaimToken,
  verifyClaimToken,
  assertGiveawayAccess,
  giveawayAccessToken,
} = require('../api/_lib/giveaway');

assert.ok(isRcgServer('RCGMarkets-Real'));
assert.ok(isRcgServer('rcgmarkets-demo'));
assert.ok(!isRcgServer('Exness-MT5Real'));

assert.strictEqual(isRcgCompany('RCG Markets (Pty) Ltd'), true);
assert.strictEqual(isRcgCompany('Exness Ltd'), false);
assert.strictEqual(isRcgCompany(''), null);

assert.ok(assertRcgAccount({ server: 'RCGMarkets-Real' }).ok);
assert.ok(!assertRcgAccount({ server: 'Exness-MT5Real' }).ok);
assert.strictEqual(
  assertRcgAccount({ server: 'Exness-MT5Real' }).code,
  'not_rcg',
);
assert.ok(
  assertRcgAccount({
    server: 'SomeRenamedRCG',
    company: 'RCG Markets (Pty) Ltd',
  }).ok,
);
// Allowlisted server wins even if company string is odd/missing.
assert.ok(
  assertRcgAccount({
    server: 'RCGMarkets-Real',
    company: 'Totally Different Broker',
  }).ok,
);

const list = rcgServerAllowlist();
assert.ok(list.includes('RCGMarkets-Real'));
assert.ok(list.includes('RCGMarkets-Demo'));

const token = makeClaimToken({
  login: '12345678',
  server: 'RCGMarkets-Real',
  mt5TokenFingerprint: 'abcd',
});
const decoded = verifyClaimToken(token);
assert.ok(decoded.ok);
assert.strictEqual(decoded.login, '12345678');
assert.strictEqual(decoded.server, 'RCGMarkets-Real');
assert.ok(!verifyClaimToken('nope').ok);
assert.ok(!verifyClaimToken(token.slice(0, -2) + 'xx').ok);

assert.ok(assertGiveawayAccess(giveawayAccessToken()).ok);
assert.ok(!assertGiveawayAccess('').ok);
assert.ok(!assertGiveawayAccess('wrong-token').ok);
assert.strictEqual(assertGiveawayAccess('wrong').status, 404);

console.log('test-rcg-giveaway: ok');
