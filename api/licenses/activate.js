const { applyCors, json, readJsonBody } = require('../_lib/cors');
const { safeFailPayload } = require('../_lib/safeErrors');
const { getSupabaseAdmin } = require('../_lib/supabaseAdmin');
const { activateKeyOnDevice } = require('../_lib/licenseExclusivity');

/**
 * POST /api/licenses/activate
 * Body: { key, email, deviceId }
 * Binds one email + key to one device. Rejects other devices with a clear message.
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

  const result = await activateKeyOnDevice({
    rawKey: body.key || body.licenseKey || '',
    clientEmail: body.email || body.clientEmail || body.assigneeEmail || '',
    deviceId: body.deviceId || body.device_id || '',
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
    via: result.via,
    deviceId: result.deviceId,
    key: result.key
      ? {
          id: String(result.key.id),
          eaId: String(result.key.ea_id || result.key.eaId || ''),
          eaName: String(result.key.ea_name || result.key.eaName || ''),
          key: String(result.key.key),
          status: 'active',
          licenseStatus: 'active',
          deviceId: result.deviceId,
          assigneeEmail:
            result.key.assignee_email || result.key.assigneeEmail || null,
          activatedAt:
            result.key.activated_at || result.key.activatedAt || null,
        }
      : undefined,
    configured: true,
  });
};
