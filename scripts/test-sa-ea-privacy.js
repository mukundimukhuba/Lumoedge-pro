/**
 * Lightweight isolation checks for SA EA privacy (no network).
 * Run: node scripts/test-sa-ea-privacy.js
 */
const assert = require('assert');
const {
  isSuperAdmin,
  assertCanWriteOwnedRow,
  normalizeEmail,
} = require('../api/_lib/mentorScope');

const SA = 'mukundimukhuba8@gmail.com';
const MENTOR = 'mentor@example.com';
const OTHER = 'other@example.com';

assert.strictEqual(isSuperAdmin(SA), true);
assert.strictEqual(isSuperAdmin(MENTOR), false);

// SA cannot write another mentor's owned EA
{
  const gate = assertCanWriteOwnedRow({
    actorEmail: SA,
    ownerEmail: MENTOR,
    claimedOwnerEmail: MENTOR,
    rowExists: true,
  });
  assert.strictEqual(gate.ok, false);
  assert.strictEqual(gate.status, 403);
}

// Mentor cannot write another mentor's EA
{
  const gate = assertCanWriteOwnedRow({
    actorEmail: MENTOR,
    ownerEmail: OTHER,
    claimedOwnerEmail: OTHER,
    rowExists: true,
  });
  assert.strictEqual(gate.ok, false);
}

// Mentor can write own EA
{
  const gate = assertCanWriteOwnedRow({
    actorEmail: MENTOR,
    ownerEmail: MENTOR,
    claimedOwnerEmail: MENTOR,
    rowExists: true,
  });
  assert.strictEqual(gate.ok, true);
}

// SA can write own EA
{
  const gate = assertCanWriteOwnedRow({
    actorEmail: SA,
    ownerEmail: SA,
    claimedOwnerEmail: SA,
    rowExists: true,
  });
  assert.strictEqual(gate.ok, true);
}

// Legacy unowned: SA only
{
  const saGate = assertCanWriteOwnedRow({
    actorEmail: SA,
    ownerEmail: '',
    claimedOwnerEmail: SA,
    rowExists: true,
  });
  assert.strictEqual(saGate.ok, true);
  const mentorGate = assertCanWriteOwnedRow({
    actorEmail: MENTOR,
    ownerEmail: '',
    claimedOwnerEmail: MENTOR,
    rowExists: true,
  });
  assert.strictEqual(mentorGate.ok, false);
}

assert.strictEqual(normalizeEmail('  ' + SA.toUpperCase() + ' '), SA);

// Mirror portal scopeCatalogForMentor (EAs always owner-scoped; SA keeps all keys)
function scopeCatalogForMentor(eas, keys, actorEmail) {
  const actor = normalizeEmail(actorEmail);
  if (!actor) return { eas: [], keys: [] };
  const myEas = eas.filter((e) => normalizeEmail(e.ownerEmail) === actor);
  const myEaIds = new Set(myEas.map((e) => e.id));
  if (isSuperAdmin(actor)) return { eas: myEas, keys };
  const myKeys = keys.filter(
    (k) => normalizeEmail(k.issuedByEmail) === actor || myEaIds.has(k.eaId),
  );
  return { eas: myEas, keys: myKeys };
}

const eas = [
  { id: 'ea_sa', ownerEmail: SA, name: 'SA Bot' },
  { id: 'ea_m', ownerEmail: MENTOR, name: 'MEGA MIND' },
  { id: 'ea_o', ownerEmail: OTHER, name: 'LUMO EDGE PRO' },
];
const keys = [
  { id: 'k1', eaId: 'ea_m', issuedByEmail: MENTOR, key: 'M-1' },
  { id: 'k2', eaId: 'ea_o', issuedByEmail: OTHER, key: 'O-1' },
  { id: 'k3', eaId: 'ea_sa', issuedByEmail: SA, key: 'S-1' },
];

const saScoped = scopeCatalogForMentor(eas, keys, SA);
assert.deepStrictEqual(
  saScoped.eas.map((e) => e.id),
  ['ea_sa'],
);
assert.strictEqual(saScoped.keys.length, 3);
assert.ok(!saScoped.eas.some((e) => e.name === 'MEGA MIND'));
assert.ok(!saScoped.eas.some((e) => e.name === 'LUMO EDGE PRO'));

const mentorScoped = scopeCatalogForMentor(eas, keys, MENTOR);
assert.deepStrictEqual(
  mentorScoped.eas.map((e) => e.id),
  ['ea_m'],
);
assert.deepStrictEqual(
  mentorScoped.keys.map((k) => k.id),
  ['k1'],
);

console.log('ok: sa-ea-privacy mentorScope + catalog scope checks passed');
