const { applyCors, json, readJsonBody } = require('../_lib/cors');
const { safeFailPayload } = require('../_lib/safeErrors');
const {
  getSupabaseAdmin,
  normalizeLicenseKey,
  sbFetch,
  storagePutJson,
  resolvePictureUri,
  stripDataUrl,
} = require('../_lib/supabaseAdmin');
const {
  normalizeEmail,
  isSuperAdmin,
  assertCanWriteOwnedRow,
} = require('../_lib/mentorScope');
const { verifyChallengeToken } = require('../_lib/humanChallenge');
const {
  assertEmailCanReceiveNewKey,
  MSG_EMAIL_HAS_MENTOR,
} = require('../_lib/licenseExclusivity');

/**
 * POST /api/licenses/put
 * Body: { ea?: {...}, key: {...}, actorEmail?, generate?, challengeToken? }
 * Writes EA + license key to Supabase tables when present; otherwise
 * durable Storage fallback under ea-pictures/catalog/.
 * Data-URL logos are uploaded to Storage and stored as public http URLs
 * (never stripped to null without attempting upload).
 * Portal writes must stamp issued_by_email / owner_email; cross-mentor
 * overwrites of another mentor’s EA are rejected.
 * When generate=true (Mentors Portal Generate License Key), challengeToken
 * is required and verified server-side (checkbox HMAC / Turnstile / reCAPTCHA).
 */
module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const admin = getSupabaseAdmin();
  if (!admin.configured) {
    return json(
      res,
      503,
      { ...safeFailPayload(503, 'supabase admin not configured', { code: 'config' }), configured: false },
    );
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { ok: false, error: 'Invalid JSON body' });
  }

  const keyIn = body.key || body.license || null;
  const eaIn = body.ea || body.robot || null;
  if (!keyIn || !keyIn.key || !keyIn.id) {
    return json(res, 400, {
      ok: false,
      error: 'key object with id + key is required',
    });
  }

  const isGenerate = Boolean(body.generate || keyIn.generate);
  if (isGenerate) {
    const challenge =
      body.challengeToken ||
      body.challenge_token ||
      keyIn.challengeToken ||
      keyIn.challenge_token ||
      '';
    const remoteip =
      req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
      req.headers['x-real-ip'] ||
      undefined;
    const gate = await verifyChallengeToken(challenge, { remoteip });
    if (!gate.ok) {
      return json(res, 403, {
        ok: false,
        error: gate.error || 'Robot check required',
        code: 'challenge_required',
      });
    }
  }

  const keyNorm = normalizeLicenseKey(keyIn.key);
  if (!keyNorm.startsWith('EDGES-') || keyNorm.length < 20) {
    return json(res, 400, { ok: false, error: 'Invalid license key format' });
  }

  const eaId = String(
    (eaIn && (eaIn.id || eaIn.eaId)) || keyIn.eaId || keyIn.ea_id || '',
  );
  if (!eaId) {
    return json(res, 400, { ok: false, error: 'ea id is required' });
  }

  const actorEmail = normalizeEmail(
    body.actorEmail ||
      keyIn.issuedByEmail ||
      keyIn.issued_by_email ||
      (eaIn && (eaIn.ownerEmail || eaIn.owner_email)) ||
      '',
  );
  const claimedOwner = normalizeEmail(
    (eaIn && (eaIn.ownerEmail || eaIn.owner_email)) ||
      keyIn.issuedByEmail ||
      keyIn.issued_by_email ||
      actorEmail ||
      '',
  );

  let existingOwner = '';
  let rowExists = false;
  try {
    const sel = await sbFetch(
      `/rest/v1/managed_eas?id=eq.${encodeURIComponent(eaId)}&select=id,owner_email&limit=1`,
    );
    if (sel.ok && Array.isArray(sel.json) && sel.json.length) {
      rowExists = true;
      existingOwner = normalizeEmail(sel.json[0].owner_email);
    }
  } catch {
    /* table may be missing */
  }

  // Only enforce when a portal actor / issuer is present (generate path).
  if (actorEmail || claimedOwner) {
    const gate = assertCanWriteOwnedRow({
      actorEmail: actorEmail || claimedOwner,
      ownerEmail: existingOwner,
      claimedOwnerEmail: claimedOwner || actorEmail,
      rowExists,
    });
    if (!gate.ok) {
      return json(res, gate.status, {
        ok: false,
        error: gate.error,
        configured: true,
      });
    }
  }

  const rawEaPic =
    (eaIn && (eaIn.pictureUri || eaIn.picture_uri)) ||
    keyIn.eaPictureUri ||
    keyIn.ea_picture_uri ||
    null;
  const rawKeyPic =
    keyIn.eaPictureUri || keyIn.ea_picture_uri || rawEaPic || null;

  // Upload data: logos → public URLs before any strip/row write.
  const [eaPictureResolved, keyPictureResolved] = await Promise.all([
    resolvePictureUri(`eas/${eaId}`, rawEaPic),
    resolvePictureUri(`keys/${String(keyIn.id)}`, rawKeyPic),
  ]);
  const durableEaPic =
    eaPictureResolved || keyPictureResolved || stripDataUrl(rawEaPic);
  const durableKeyPic =
    keyPictureResolved || eaPictureResolved || stripDataUrl(rawKeyPic);

  const ownerEmail =
    existingOwner || claimedOwner || actorEmail || null;

  const ea = {
    id: eaId,
    name: String(
      (eaIn && (eaIn.name || eaIn.eaName)) ||
        keyIn.eaName ||
        keyIn.ea_name ||
        'EA',
    ),
    picture_uri: durableEaPic,
    symbols: Array.isArray(eaIn && (eaIn.symbols || eaIn.eaSymbols))
      ? eaIn.symbols || eaIn.eaSymbols
      : Array.isArray(keyIn.eaSymbols || keyIn.ea_symbols)
        ? keyIn.eaSymbols || keyIn.ea_symbols
        : [],
    created_at:
      (eaIn && (eaIn.createdAt || eaIn.created_at)) ||
      new Date().toISOString(),
    updated_at: new Date().toISOString(),
    owner_email: ownerEmail,
  };

  const assigneeEmail = normalizeEmail(
    keyIn.assigneeEmail || keyIn.assignee_email || '',
  );
  const issuedByEmail = normalizeEmail(
    keyIn.issuedByEmail || keyIn.issued_by_email || keyIn.mentorId || '',
  );
  const mentorId =
    normalizeEmail(keyIn.mentorId || keyIn.mentor_id || '') ||
    issuedByEmail ||
    null;
  const subscriptionId = String(
    keyIn.subscriptionId || keyIn.subscription_id || '',
  ).trim() || null;
  const licenseDuration = String(
    keyIn.licenseDuration || keyIn.license_duration || '',
  ).trim() || null;
  const licenseStatus = String(
    keyIn.licenseStatus || keyIn.license_status || keyIn.status || 'unused',
  );
  const regenerate = Boolean(keyIn.regenerate);

  if (!assigneeEmail || !assigneeEmail.includes('@')) {
    return json(res, 400, {
      ok: false,
      error: 'Client email (assigneeEmail) is required to generate a license key',
    });
  }
  if (!issuedByEmail && !mentorId) {
    return json(res, 400, {
      ok: false,
      error: 'Mentor identity (issuedByEmail) is required',
    });
  }

  // Ownership: mentors may only write keys as themselves (super admin exempt).
  if (issuedByEmail && !isSuperAdmin(issuedByEmail)) {
    /* identity stamped below — further checks when subscription linked */
  }

  // One email = one live license key. Mentors must delete the existing key
  // before generating a new one (including cross-mentor).
  if (isGenerate) {
    const emailGate = await assertEmailCanReceiveNewKey(assigneeEmail);
    if (!emailGate.ok) {
      // Same-mentor regenerate: revoke their own live keys for this email first.
      const existingIssuer = normalizeEmail(
        emailGate.existing?.issuedByEmail || '',
      );
      const self = normalizeEmail(issuedByEmail || mentorId || actorEmail);
      if (
        regenerate &&
        emailGate.code === 'email_has_mentor' &&
        existingIssuer &&
        self &&
        existingIssuer === self
      ) {
        const { findLiveKeysForEmail } = require('../_lib/licenseExclusivity');
        const live = await findLiveKeysForEmail(assigneeEmail);
        for (const old of live) {
          const oldIssuer = normalizeEmail(
            old.issued_by_email || old.mentor_id || '',
          );
          if (oldIssuer !== self) continue;
          await sbFetch(
            `/rest/v1/license_keys?id=eq.${encodeURIComponent(old.id)}`,
            {
              method: 'PATCH',
              body: {
                status: 'revoked',
                license_status: 'revoked',
                device_id: null,
              },
              prefer: 'return=minimal',
            },
          );
        }
      } else {
        return json(res, emailGate.status, {
          ok: false,
          error: emailGate.error || MSG_EMAIL_HAS_MENTOR,
          code: emailGate.code || 'email_has_mentor',
          userMessage: emailGate.error || MSG_EMAIL_HAS_MENTOR,
          configured: true,
        });
      }
    }
  }

  // If subscription linked: must be approved/active for this client; no dup key unless regenerate.
  if (subscriptionId) {
    try {
      const subSel = await sbFetch(
        `/rest/v1/subscriptions?id=eq.${encodeURIComponent(subscriptionId)}&select=*&limit=1`,
      );
      if (subSel.ok && Array.isArray(subSel.json) && subSel.json[0]) {
        const sub = subSel.json[0];
        const st = String(sub.status || '').toLowerCase();
        if (st !== 'approved' && st !== 'active') {
          return json(res, 403, {
            ok: false,
            error: `Subscription is ${st || 'unknown'} — only approved/active subscriptions can receive keys`,
          });
        }
        if (normalizeEmail(sub.client_email) !== assigneeEmail) {
          return json(res, 403, {
            ok: false,
            error: 'Subscription client email does not match assignee email',
          });
        }
        const existing = await sbFetch(
          `/rest/v1/license_keys?subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=id,license_status,status`,
        );
        if (existing.ok && Array.isArray(existing.json) && existing.json.length) {
          const live = existing.json.filter(
            (r) =>
              String(r.license_status || '').toLowerCase() !== 'revoked' &&
              String(r.status || '').toLowerCase() !== 'revoked',
          );
          if (live.length && !regenerate) {
            return json(res, 409, {
              ok: false,
              error:
                'A license key already exists for this subscription. Pass regenerate=true to revoke and replace.',
            });
          }
          if (live.length && regenerate) {
            for (const old of live) {
              await sbFetch(
                `/rest/v1/license_keys?id=eq.${encodeURIComponent(old.id)}`,
                {
                  method: 'PATCH',
                  body: {
                    status: 'revoked',
                    license_status: 'revoked',
                  },
                  prefer: 'return=minimal',
                },
              );
            }
          }
        }
      }
    } catch {
      /* continue — storage fallback path may still write */
    }
  }

  const expiresAt = computeExpiresAt(licenseDuration);

  const keyRow = {
    id: String(keyIn.id),
    ea_id: ea.id,
    ea_name: String(keyIn.eaName || keyIn.ea_name || ea.name),
    key: String(keyIn.key),
    key_normalized: keyNorm,
    created_at: keyIn.createdAt || keyIn.created_at || new Date().toISOString(),
    ea_picture_uri: durableKeyPic,
    ea_symbols: Array.isArray(keyIn.eaSymbols || keyIn.ea_symbols)
      ? keyIn.eaSymbols || keyIn.ea_symbols
      : ea.symbols,
    assignee_name: keyIn.assigneeName || keyIn.assignee_name || null,
    assignee_email: assigneeEmail,
    issued_by_email: issuedByEmail || mentorId || actorEmail || null,
    mentor_id: mentorId || issuedByEmail || actorEmail || null,
    subscription_id: subscriptionId,
    license_duration: licenseDuration,
    license_status: licenseStatus,
    expires_at: expiresAt,
    status: keyIn.status || 'unused',
    activated_at: keyIn.activatedAt || keyIn.activated_at || null,
  };

  // Stamp EA owner when mentor generates against their robot
  if (issuedByEmail || mentorId) {
    ea.owner_email = issuedByEmail || mentorId;
  }

  // 1) Prefer relational tables when the schema is applied.
  let tableError = null;
  try {
    const eaUpsert = await sbFetch('/rest/v1/managed_eas?on_conflict=id', {
      method: 'POST',
      body: [ea],
      prefer: 'resolution=merge-duplicates,return=minimal',
    });
    if (!eaUpsert.ok) {
      tableError =
        eaUpsert.json?.message ||
        eaUpsert.json?.code ||
        eaUpsert.text.slice(0, 180);
      if (eaUpsert.status !== 404 && eaUpsert.json?.code !== 'PGRST205') {
        // Real error (not missing table) — still try storage, but report.
      }
    } else {
      const keyUpsert = await sbFetch('/rest/v1/license_keys?on_conflict=id', {
        method: 'POST',
        body: [keyRow],
        prefer: 'resolution=merge-duplicates,return=minimal',
      });
      if (keyUpsert.ok) {
        // Also mirror to storage for redundancy.
        try {
          await storagePutJson(`catalog/keys/${keyNorm}.json`, {
            ...keyRow,
            ea,
          });
          await storagePutJson(`catalog/eas/${ea.id}.json`, ea);
        } catch {
          /* table write succeeded — storage mirror optional */
        }
        return json(res, 200, {
          ok: true,
          via: 'table',
          key_normalized: keyNorm,
          configured: true,
          ea_picture_uri: durableEaPic,
          key_picture_uri: durableKeyPic,
        });
      }
      tableError =
        keyUpsert.json?.message ||
        keyUpsert.json?.code ||
        keyUpsert.text.slice(0, 180);
    }
  } catch (err) {
    tableError = String(err?.message || err);
  }

  // 2) Durable Storage fallback (works before SQL migrations are applied).
  try {
    await storagePutJson(`catalog/eas/${ea.id}.json`, ea);
    await storagePutJson(`catalog/keys/${keyNorm}.json`, {
      ...keyRow,
      ea,
    });
    return json(res, 200, {
      ok: true,
      via: 'storage',
      key_normalized: keyNorm,
      configured: true,
      serviceKeyKind: admin.serviceKeyKind,
      tableError: tableError || undefined,
      ea_picture_uri: durableEaPic,
      key_picture_uri: durableKeyPic,
      hint:
        tableError && /PGRST205|schema cache|does not exist/i.test(tableError)
          ? 'Tables missing — wrote to Storage. Apply supabase/migrations/*.sql for relational sync.'
          : undefined,
    });
  } catch (err) {
    const rls = err?.code === 'STORAGE_RLS';
    const kind = err?.keyKind || admin.serviceKeyKind;
    return json(res, 502, safeFailPayload(502, err, { code: 'handler' }));
  }
};

function computeExpiresAt(duration) {
  const d = String(duration || '')
    .trim()
    .toLowerCase();
  if (!d || d === 'unlimited' || d === 'lifetime') return null;
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const map = {
    '30d': 30,
    '1m': 30,
    '1 month': 30,
    '90d': 90,
    '3m': 90,
    '3 months': 90,
    '180d': 180,
    '6m': 180,
    '6 months': 180,
    '365d': 365,
    '12m': 365,
    '1y': 365,
    '1 year': 365,
  };
  const days = map[d];
  if (!days) return null;
  return new Date(now + days * day).toISOString();
}
