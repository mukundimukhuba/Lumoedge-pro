const { normalizeEmail } = require('./mentorScope');
const {
  normalizeLicenseKey,
  sbFetch,
  storageGetJson,
  storagePutJson,
} = require('./supabaseAdmin');

const MSG_EMAIL_HAS_MENTOR = 'This email has a mentor';
const MSG_ACTIVE_OTHER_DEVICE = 'This email is active on another device';

function isLiveKey(row) {
  if (!row) return false;
  const ls = String(row.license_status || row.licenseStatus || '')
    .toLowerCase()
    .trim();
  const st = String(row.status || '')
    .toLowerCase()
    .trim();
  return ls !== 'revoked' && st !== 'revoked';
}

/**
 * Find non-revoked license_keys rows for a client email (table).
 */
async function findLiveKeysForEmail(email) {
  const e = normalizeEmail(email);
  if (!e) return [];
  try {
    const sel = await sbFetch(
      `/rest/v1/license_keys?assignee_email=ilike.${encodeURIComponent(
        e,
      )}&select=*&order=created_at.desc`,
    );
    if (sel.ok && Array.isArray(sel.json)) {
      return sel.json.filter(isLiveKey);
    }
  } catch {
    /* ignore */
  }
  return [];
}

/**
 * Block generate when the client email already has a live key.
 * @returns {{ ok: true } | { ok: false, status: number, error: string, code: string, existing?: object }}
 */
async function assertEmailCanReceiveNewKey(assigneeEmail, opts = {}) {
  const email = normalizeEmail(assigneeEmail);
  if (!email) {
    return {
      ok: false,
      status: 400,
      error: 'Client email (assigneeEmail) is required to generate a license key',
      code: 'assignee_required',
    };
  }
  const live = await findLiveKeysForEmail(email);
  const excludeId = opts.excludeKeyId ? String(opts.excludeKeyId) : '';
  const blocking = live.filter((r) => String(r.id) !== excludeId);
  if (blocking.length) {
    return {
      ok: false,
      status: 409,
      error: MSG_EMAIL_HAS_MENTOR,
      code: 'email_has_mentor',
      existing: {
        id: String(blocking[0].id),
        issuedByEmail:
          blocking[0].issued_by_email || blocking[0].mentor_id || null,
      },
    };
  }
  return { ok: true };
}

async function loadKeyByNormalized(keyNorm) {
  // RPC
  try {
    const rpc = await sbFetch('/rest/v1/rpc/lookup_license_key', {
      method: 'POST',
      body: { p_key: keyNorm },
    });
    if (rpc.ok && Array.isArray(rpc.json) && rpc.json.length) {
      return { row: rpc.json[0], via: 'rpc' };
    }
  } catch {
    /* continue */
  }
  try {
    const sel = await sbFetch(
      `/rest/v1/license_keys?key_normalized=eq.${encodeURIComponent(
        keyNorm,
      )}&select=*&limit=1`,
    );
    if (sel.ok && Array.isArray(sel.json) && sel.json.length) {
      return { row: sel.json[0], via: 'table' };
    }
  } catch {
    /* continue */
  }
  try {
    const stored = await storageGetJson(`catalog/keys/${keyNorm}.json`);
    if (stored && (stored.key || stored.key_normalized)) {
      return { row: stored, via: 'storage' };
    }
  } catch {
    /* ignore */
  }
  return { row: null, via: null };
}

/**
 * Activate / bind a device to a license key for the given client email.
 */
async function activateKeyOnDevice({ rawKey, clientEmail, deviceId }) {
  const email = normalizeEmail(clientEmail);
  const device = String(deviceId || '').trim();
  const keyNorm = normalizeLicenseKey(rawKey);

  if (!email || !email.includes('@')) {
    return {
      ok: false,
      status: 400,
      error: 'Client email is required',
      code: 'email_required',
    };
  }
  if (!device || device.length < 8) {
    return {
      ok: false,
      status: 400,
      error: 'Device id is required',
      code: 'device_required',
    };
  }
  if (!keyNorm.startsWith('EDGES-') || keyNorm.length < 20) {
    return {
      ok: false,
      status: 400,
      error: 'Invalid license key format',
      code: 'invalid_key',
    };
  }

  const { row, via } = await loadKeyByNormalized(keyNorm);
  if (!row) {
    return {
      ok: false,
      status: 404,
      error: 'License key not found',
      code: 'not_found',
    };
  }
  if (!isLiveKey(row)) {
    return {
      ok: false,
      status: 403,
      error: 'This license key has been revoked. Subscribe again to continue.',
      code: 'revoked',
    };
  }

  const assignee = normalizeEmail(row.assignee_email || row.assigneeEmail);
  if (!assignee) {
    return {
      ok: false,
      status: 403,
      error:
        'This license key is not linked to a client email. Ask your mentor to regenerate it for your registered email.',
      code: 'unassigned',
    };
  }
  if (assignee !== email) {
    return {
      ok: false,
      status: 403,
      error:
        'This license key belongs to a different client email. Sign in with the email your mentor used.',
      code: 'email_mismatch',
    };
  }

  // Presenting the correct key + assignee email is proof of ownership: rebind
  // this device instead of permanently locking the client out after storage
  // clear / browser switch. Validate/poll still enforces the bound device.
  const live = await findLiveKeysForEmail(email);
  for (const other of live) {
    if (String(other.id) === String(row.id)) continue;
    const otherDevice = String(other.device_id || other.deviceId || '').trim();
    if (otherDevice && otherDevice !== device) {
      // Clear stale bind on sibling live keys for this email so exclusivity
      // stays one-device after this activation rebinds.
      try {
        if (other.id) {
          await sbFetch(
            `/rest/v1/license_keys?id=eq.${encodeURIComponent(String(other.id))}`,
            { method: 'PATCH', body: { device_id: null } },
          );
        }
      } catch {
        /* best-effort */
      }
    }
  }

  const activatedAt = new Date().toISOString();
  const patch = {
    device_id: device,
    status: 'active',
    license_status: 'active',
    activated_at: row.activated_at || row.activatedAt || activatedAt,
  };

  if (via === 'storage' || !row.id) {
    const next = {
      ...row,
      ...patch,
      deviceId: device,
      status: 'active',
      licenseStatus: 'active',
      activatedAt: patch.activated_at,
    };
    try {
      await storagePutJson(`catalog/keys/${keyNorm}.json`, next);
    } catch (err) {
      return {
        ok: false,
        status: 502,
        error: String(err?.message || err).slice(0, 120),
        code: 'storage_write',
      };
    }
    return { ok: true, via: 'storage', key: next, deviceId: device };
  }

  const upd = await sbFetch(
    `/rest/v1/license_keys?id=eq.${encodeURIComponent(String(row.id))}`,
    {
      method: 'PATCH',
      body: patch,
      prefer: 'return=representation',
    },
  );
  if (!upd.ok) {
    // Column may be missing before migration — still try storage mirror.
    try {
      await storagePutJson(`catalog/keys/${keyNorm}.json`, {
        ...row,
        ...patch,
      });
    } catch {
      /* ignore */
    }
    const msg =
      upd.json?.message || upd.json?.code || upd.text?.slice(0, 120) || 'update failed';
    // If device_id column missing, report clearly but keep exclusivity intent.
    if (/device_id|schema cache|PGRST/i.test(String(msg))) {
      return {
        ok: false,
        status: 503,
        error:
          'License device binding is not available yet. Apply migration 010_license_exclusivity.sql.',
        code: 'schema_missing',
      };
    }
    return {
      ok: false,
      status: 502,
      error: String(msg).slice(0, 160),
      code: 'update_failed',
    };
  }

  const updated =
    Array.isArray(upd.json) && upd.json[0] ? upd.json[0] : { ...row, ...patch };
  try {
    await storagePutJson(`catalog/keys/${keyNorm}.json`, updated);
  } catch {
    /* optional mirror */
  }
  return { ok: true, via: via || 'table', key: updated, deviceId: device };
}

/**
 * Validate that a key remains live and bound to this device.
 */
async function validateKeyOnDevice({ rawKey, clientEmail, deviceId }) {
  const email = normalizeEmail(clientEmail);
  const device = String(deviceId || '').trim();
  const keyNorm = normalizeLicenseKey(rawKey);

  if (!email || !device || !keyNorm.startsWith('EDGES-')) {
    return {
      ok: false,
      status: 400,
      error: 'email, deviceId, and key are required',
      code: 'invalid_request',
      access: false,
    };
  }

  const { row } = await loadKeyByNormalized(keyNorm);
  if (!row || !isLiveKey(row)) {
    return {
      ok: false,
      status: 403,
      error: 'License revoked. Subscribe again to continue.',
      code: 'revoked',
      access: false,
    };
  }
  const assignee = normalizeEmail(row.assignee_email || row.assigneeEmail);
  if (assignee !== email) {
    return {
      ok: false,
      status: 403,
      error: 'License email mismatch',
      code: 'email_mismatch',
      access: false,
    };
  }
  const bound = String(row.device_id || row.deviceId || '').trim();
  if (bound && bound !== device) {
    return {
      ok: false,
      status: 409,
      error: MSG_ACTIVE_OTHER_DEVICE,
      code: 'active_other_device',
      access: false,
    };
  }
  // Unbound but live: still allow (activation will bind). Treat as valid for poll
  // only when bound matches or unbound on first check after local activate race.
  return {
    ok: true,
    status: 200,
    access: true,
    deviceId: bound || device,
    keyId: String(row.id || ''),
  };
}

/**
 * Mentor deletes (revokes) one student key; expires linked subscription.
 * Never mass-deletes other mentors' keys.
 */
async function deleteMentorLicenseKey({ keyId, actorEmail }) {
  const actor = normalizeEmail(actorEmail);
  const id = String(keyId || '').trim();
  if (!actor) {
    return {
      ok: false,
      status: 401,
      error: 'actorEmail is required',
      code: 'actor_required',
    };
  }
  if (!id) {
    return {
      ok: false,
      status: 400,
      error: 'keyId is required',
      code: 'key_required',
    };
  }

  let row = null;
  try {
    const sel = await sbFetch(
      `/rest/v1/license_keys?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
    );
    if (sel.ok && Array.isArray(sel.json) && sel.json[0]) {
      row = sel.json[0];
    }
  } catch {
    /* ignore */
  }

  if (!row) {
    return {
      ok: false,
      status: 404,
      error: 'License key not found',
      code: 'not_found',
    };
  }

  const issuer = normalizeEmail(
    row.issued_by_email || row.mentor_id || row.issuedByEmail || row.mentorId,
  );
  const { isSuperAdmin } = require('./mentorScope');
  if (issuer && issuer !== actor && !isSuperAdmin(actor)) {
    return {
      ok: false,
      status: 403,
      error: 'Not allowed to delete another mentor’s license key',
      code: 'forbidden',
    };
  }

  const assignee = normalizeEmail(row.assignee_email || row.assigneeEmail);
  const subscriptionId = String(
    row.subscription_id || row.subscriptionId || '',
  ).trim();
  const keyNorm = normalizeLicenseKey(row.key_normalized || row.key);

  const patch = {
    status: 'revoked',
    license_status: 'revoked',
    device_id: null,
  };

  const upd = await sbFetch(
    `/rest/v1/license_keys?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: patch,
      prefer: 'return=minimal',
    },
  );
  if (!upd.ok && upd.status !== 404) {
    // Fall through to storage revoke even if table patch fails.
  }

  if (keyNorm.startsWith('EDGES-')) {
    try {
      const stored = await storageGetJson(`catalog/keys/${keyNorm}.json`);
      if (stored) {
        await storagePutJson(`catalog/keys/${keyNorm}.json`, {
          ...stored,
          ...patch,
          status: 'revoked',
          licenseStatus: 'revoked',
          deviceId: null,
          device_id: null,
        });
      }
    } catch {
      /* ignore */
    }
  }

  // Expire linked subscription so client must pay again (no mass sub wipe).
  let expiredSubs = 0;
  if (subscriptionId) {
    try {
      const subUpd = await sbFetch(
        `/rest/v1/subscriptions?id=eq.${encodeURIComponent(subscriptionId)}`,
        {
          method: 'PATCH',
          body: {
            status: 'expired',
            updated_at: new Date().toISOString(),
            review_note: 'License key deleted by mentor',
          },
          prefer: 'return=minimal',
        },
      );
      if (subUpd.ok) expiredSubs += 1;
    } catch {
      /* ignore */
    }
  } else if (assignee) {
    // No subscription_id on key — expire this client's approved/active rows only.
    try {
      const subUpd = await sbFetch(
        `/rest/v1/subscriptions?client_email=ilike.${encodeURIComponent(
          assignee,
        )}&status=in.(approved,active)`,
        {
          method: 'PATCH',
          body: {
            status: 'expired',
            updated_at: new Date().toISOString(),
            review_note: 'License key deleted by mentor',
          },
          prefer: 'return=minimal',
        },
      );
      if (subUpd.ok) expiredSubs += 1;
    } catch {
      /* ignore */
    }
  }

  return {
    ok: true,
    revoked: true,
    keyId: id,
    assigneeEmail: assignee || null,
    expiredSubscriptions: expiredSubs,
  };
}

module.exports = {
  MSG_EMAIL_HAS_MENTOR,
  MSG_ACTIVE_OTHER_DEVICE,
  isLiveKey,
  findLiveKeysForEmail,
  assertEmailCanReceiveNewKey,
  loadKeyByNormalized,
  activateKeyOnDevice,
  validateKeyOnDevice,
  deleteMentorLicenseKey,
};
