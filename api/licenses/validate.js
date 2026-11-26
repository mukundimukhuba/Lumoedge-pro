const { applyCors, json, readJsonBody } = require('../_lib/cors');
const { safeFailPayload } = require('../_lib/safeErrors');
const { getSupabaseAdmin } = require('../_lib/supabaseAdmin');
const { validateKeyOnDevice } = require('../_lib/licenseExclusivity');

/**
 * POST /api/licenses/validate
 * Body: { key, email, deviceId }
 * Client polls while EA is active — revoked/deleted keys or other-device binds
 * immediately revoke local access.
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
      access: false,
    });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, {
      ok: false,
      error: 'Invalid JSON body',
      access: false,
    });
  }

  const result = await validateKeyOnDevice({
    rawKey: body.key || body.licenseKey || '',
    clientEmail: body.email || body.clientEmail || '',
    deviceId: body.deviceId || body.device_id || '',
  });

  return json(res, result.status || (result.ok ? 200 : 403), {
    ok: Boolean(result.ok),
    access: Boolean(result.access),
    error: result.error,
    code: result.code,
    userMessage: result.error,
    deviceId: result.deviceId,
    keyId: result.keyId,
    configured: true,
  });
};
