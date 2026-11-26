/** Super admin identity (keys oversight only — not other mentors' EA catalogs). */
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
 * Reject cross-mentor writes — including super admin for other mentors' owned rows.
 * SA may still touch legacy unowned rows (no owner_email) to prevent claim-jacking.
 * @returns {{ ok: true } | { ok: false, status: number, error: string }}
 */
function assertCanWriteOwnedRow(opts) {
  const actor = normalizeEmail(opts.actorEmail);
  const owner = normalizeEmail(opts.ownerEmail);
  const claimed = normalizeEmail(opts.claimedOwnerEmail);

  if (!actor) {
    return {
      ok: false,
      status: 401,
      error: 'actorEmail is required for portal catalog writes',
    };
  }

  // Existing row owned by someone else — mentors and SA alike cannot modify.
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
    if (!isSuperAdmin(actor)) {
      return {
        ok: false,
        status: 403,
        error: 'Legacy unowned catalog row — only super admin can modify',
      };
    }
    return { ok: true };
  }

  return { ok: true };
}

module.exports = {
  SUPER_ADMIN_EMAIL,
  normalizeEmail,
  isSuperAdmin,
  assertCanWriteOwnedRow,
};
