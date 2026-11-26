const { applyCors, json, readJsonBody } = require('../_lib/cors');
const { getSupabaseAdmin, sbFetch } = require('../_lib/supabaseAdmin');
const {
  normalizeEmail,
  isSuperAdminEmail,
} = require('../_lib/superAdmin');

/**
 * POST /api/licenses/list
 * Scoped key listing — never dumps the full catalog to clients.
 * Body: { role: 'mentor'|'client', actorEmail, clientEmail? }
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
      ok: false,
      error: 'Supabase service role not configured.',
      configured: false,
    });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { ok: false, error: 'Invalid JSON body' });
  }

  const role = String(body.role || '').toLowerCase();
  const actorEmail = normalizeEmail(body.actorEmail || body.actor_email);
  const clientEmail = normalizeEmail(body.clientEmail || body.client_email);

  if (role === 'client') {
    const email = clientEmail || actorEmail;
    if (!email) {
      return json(res, 400, { ok: false, error: 'clientEmail required' });
    }
    const rows = await rpcList('list_client_license_keys', {
      p_client_email: email,
    });
    if (rows) {
      return json(res, 200, { ok: true, via: 'rpc', keys: rows.map(mapKey) });
    }
    // Service-role table filter (never return unfiltered)
    const sel = await sbFetch(
      `/rest/v1/license_keys?assignee_email=eq.${encodeURIComponent(email)}&select=*&order=created_at.desc`,
    );
    if (sel.ok && Array.isArray(sel.json)) {
      return json(res, 200, {
        ok: true,
        via: 'table',
        keys: sel.json.map(mapKey),
      });
    }
    return json(res, 200, { ok: true, via: 'empty', keys: [] });
  }

  if (role === 'mentor') {
    if (!actorEmail) {
      return json(res, 400, { ok: false, error: 'actorEmail required' });
    }
    const rows = await rpcList('list_mentor_license_keys', {
      actor_email: actorEmail,
    });
    if (rows) {
      return json(res, 200, { ok: true, via: 'rpc', keys: rows.map(mapKey) });
    }
    if (isSuperAdminEmail(actorEmail)) {
      const sel = await sbFetch(
        '/rest/v1/license_keys?select=*&order=created_at.desc',
      );
      if (sel.ok && Array.isArray(sel.json)) {
        return json(res, 200, {
          ok: true,
          via: 'table',
          keys: sel.json.map(mapKey),
        });
      }
    } else {
      const sel = await sbFetch(
        `/rest/v1/license_keys?or=(issued_by_email.eq.${encodeURIComponent(actorEmail)},mentor_id.eq.${encodeURIComponent(actorEmail)})&select=*&order=created_at.desc`,
      );
      if (sel.ok && Array.isArray(sel.json)) {
        return json(res, 200, {
          ok: true,
          via: 'table',
          keys: sel.json.map(mapKey),
        });
      }
    }
    return json(res, 200, { ok: true, via: 'empty', keys: [] });
  }

  return json(res, 400, {
    ok: false,
    error: 'role must be mentor or client',
  });
};

async function rpcList(name, body) {
  try {
    const rpc = await sbFetch(`/rest/v1/rpc/${name}`, {
      method: 'POST',
      body,
    });
    if (rpc.ok && Array.isArray(rpc.json)) return rpc.json;
  } catch {
    /* ignore */
  }
  return null;
}

function mapKey(row) {
  return {
    id: String(row.id),
    eaId: String(row.ea_id || row.eaId || ''),
    eaName: String(row.ea_name || row.eaName || ''),
    key: String(row.key),
    createdAt: String(row.created_at || row.createdAt || ''),
    eaPictureUri: row.ea_picture_uri || row.eaPictureUri || null,
    eaSymbols: Array.isArray(row.ea_symbols)
      ? row.ea_symbols
      : Array.isArray(row.eaSymbols)
        ? row.eaSymbols
        : [],
    assigneeName: row.assignee_name || row.assigneeName || null,
    assigneeEmail: row.assignee_email || row.assigneeEmail || null,
    issuedByEmail: row.issued_by_email || row.issuedByEmail || null,
    mentorId: row.mentor_id || row.mentorId || row.issued_by_email || null,
    subscriptionId: row.subscription_id || row.subscriptionId || null,
    licenseDuration: row.license_duration || row.licenseDuration || null,
    licenseStatus:
      row.license_status || row.licenseStatus || row.status || 'unused',
    status: row.status || row.license_status || 'unused',
    activatedAt: row.activated_at || row.activatedAt || null,
    expiresAt: row.expires_at || row.expiresAt || null,
    deviceId: row.device_id || row.deviceId || null,
  };
}
