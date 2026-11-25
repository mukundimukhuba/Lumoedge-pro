const { applyCors, json, readJsonBody } = require('../_lib/cors');
const { safeFailPayload, sanitizePublicBody } = require('../_lib/safeErrors');
const { getSupabaseAdmin, sbFetch } = require('../_lib/supabaseAdmin');
const {
  normalizeEmail,
  isSuperAdmin,
} = require('../_lib/mentorScope');

/**
 * GET/POST /api/eas/list
 * Body/query: { actorEmail }
 * Returns managed EAs owned by the actor (or all for super admin).
 */
module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const admin = getSupabaseAdmin();
  if (!admin.configured) {
    return json(
      res,
      503,
      safeFailPayload(503, 'supabase admin not configured', {
        userMessage:
          'The service is temporarily unavailable. Please try again later.',
        code: 'config',
      }),
    );
  }

  let actorEmail = '';
  if (req.method === 'GET') {
    try {
      const u = new URL(req.url || '', 'http://localhost');
      actorEmail = u.searchParams.get('actorEmail') || u.searchParams.get('email') || '';
    } catch {
      actorEmail = '';
    }
  } else {
    try {
      const body = await readJsonBody(req);
      actorEmail = String(body.actorEmail || body.email || '');
    } catch {
      return json(res, 400, { ok: false, error: 'Invalid JSON body' });
    }
  }

  actorEmail = normalizeEmail(actorEmail);
  if (!actorEmail) {
    return json(res, 400, {
      ok: false,
      error: 'actorEmail is required',
      configured: true,
    });
  }

  try {
    // Prefer RPC when migration 006 is applied
    const rpc = await sbFetch('/rest/v1/rpc/list_mentor_eas', {
      method: 'POST',
      body: { actor_email: actorEmail },
    });
    if (rpc.ok && Array.isArray(rpc.json)) {
      return json(res, 200, {
        ok: true,
        via: 'rpc',
        configured: true,
        superAdmin: isSuperAdmin(actorEmail),
        eas: rpc.json.map(mapEa),
      });
    }

    let path = '/rest/v1/managed_eas?select=*&order=created_at.desc';
    if (!isSuperAdmin(actorEmail)) {
      path += `&owner_email=eq.${encodeURIComponent(actorEmail)}`;
    }
    const sel = await sbFetch(path);
    if (!sel.ok) {
      return json(
        res,
        502,
        safeFailPayload(502, sel.json || sel.text || 'list failed', {
          code: 'eas_list',
          meta: { via: 'table' },
        }),
      );
    }
    return json(res, 200, {
      ok: true,
      via: 'table',
      configured: true,
      superAdmin: isSuperAdmin(actorEmail),
      eas: (sel.json || []).map(mapEa),
    });
  } catch (err) {
    return json(res, 502, {
      ...safeFailPayload(502, err, { code: 'eas_list' }),
      configured: true,
    });
  }
};

function mapEa(row) {
  return {
    id: String(row.id),
    name: String(row.name || ''),
    pictureUri: row.picture_uri || row.pictureUri || null,
    symbols: Array.isArray(row.symbols) ? row.symbols : [],
    createdAt: String(row.created_at || row.createdAt || new Date().toISOString()),
    ownerEmail: row.owner_email || row.ownerEmail || null,
  };
}
