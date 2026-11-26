const { applyCors, json, readJsonBody } = require('../_lib/cors');
const { safeFailPayload } = require('../_lib/safeErrors');
const { getSupabaseAdmin } = require('../_lib/supabaseAdmin');
const { deleteMentorLicenseKey } = require('../_lib/licenseExclusivity');

/**
 * POST /api/licenses/delete
 * Body: { keyId, actorEmail }
 * Mentor deletes one student key they issued. Client loses EA access; linked
 * subscription expires so they must subscribe again. No mass-delete.
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
    return json(res, 503, {
      ...safeFailPayload(503, 'supabase admin not configured', {
        code: 'config',
      }),
      configured: false,
    });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { ok: false, error: 'Invalid JSON body' });
  }

  const result = await deleteMentorLicenseKey({
    keyId: body.keyId || body.id || body.key_id || '',
    actorEmail: body.actorEmail || body.actor_email || body.issuedByEmail || '',
  });

  if (!result.ok) {
    return json(res, result.status || 400, {
      ok: false,
      error: result.error,
      code: result.code,
      userMessage: result.error,
      configured: true,
    });
  }

  return json(res, 200, {
    ok: true,
    revoked: true,
    keyId: result.keyId,
    assigneeEmail: result.assigneeEmail,
    expiredSubscriptions: result.expiredSubscriptions || 0,
    configured: true,
  });
};
