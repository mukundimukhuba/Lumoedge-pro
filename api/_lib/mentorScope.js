/** Super admin who may see / mutate every mentor's catalog. */
const SUPER_ADMIN_EMAIL = 'mukundimukhuba8@gmail.com';

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function isSuperAdmin(email) {
  return normalizeEmail(email) === SUPER_ADMIN_EMAIL;
}

/**
 * Reject cross-mentor writes.
 * @returns {{ ok: true } | { ok: false, status: number, error: string }}
 */
function assertCanWriteOwnedRow(opts) {
  const actor = normalizeEmail(opts.actorEmail);
  const owner = normalizeEmail(opts.ownerEmail);
  const claimed = normalizeEmail(opts.claimedOwnerEmail);

  if (isSuperAdmin(actor)) return { ok: true };

  if (!actor) {
    return {
      ok: false,
      status: 401,
      error: 'actorEmail is required for portal catalog writes',
    };
  }

  // Existing row owned by someone else
  if (owner && owner !== actor) {
    return {
      ok: false,
      status: 403,
      error: 'Not allowed to modify another mentor’s EA or license keys',
    };
  }

  // Creating/updating: claimed owner must be the actor (or empty → stamp actor)
  if (claimed && claimed !== actor) {
    return {
      ok: false,
      status: 403,
      error: 'ownerEmail / issuedByEmail must match the signed-in mentor',
    };
  }

  // Legacy unowned row: only super admin may touch (prevents claim-jacking)
  if (opts.rowExists && !owner) {
    return {
      ok: false,
      status: 403,
      error: 'Legacy unowned catalog row — only super admin can modify',
    };
  }

  return { ok: true };
}

module.exports = {
  SUPER_ADMIN_EMAIL,
  normalizeEmail,
  isSuperAdmin,
  assertCanWriteOwnedRow,
};
