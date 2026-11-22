const { applyCors, json, readJsonBody } = require('../_lib/cors');
const {
  getSupabaseAdmin,
  sbFetch,
  storageGetJson,
} = require('../_lib/supabaseAdmin');

/**
 * GET/POST /api/eas/get
 * Body/query: { id: "ea_..." }
 * Returns managed EA branding (name + picture) — source of truth for Home.
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
    return json(res, 503, {
      ok: false,
      error:
        'Supabase service role not configured on server (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).',
      configured: false,
    });
  }

  let eaId = '';
  if (req.method === 'GET') {
    try {
      const u = new URL(req.url || '', 'http://localhost');
      eaId = u.searchParams.get('id') || u.searchParams.get('eaId') || '';
    } catch {
      eaId = '';
    }
  } else {
    try {
      const body = await readJsonBody(req);
      eaId = String(body.id || body.eaId || body.ea_id || '');
    } catch {
      return json(res, 400, { ok: false, error: 'Invalid JSON body' });
    }
  }

  eaId = String(eaId || '').trim();
  if (!eaId) {
    return json(res, 400, { ok: false, error: 'ea id is required' });
  }

  // 1) Table
  try {
    const sel = await sbFetch(
      `/rest/v1/managed_eas?id=eq.${encodeURIComponent(eaId)}&select=*&limit=1`,
    );
    if (sel.ok && Array.isArray(sel.json) && sel.json.length) {
      return json(res, 200, {
        ok: true,
        via: 'table',
        ea: mapEa(sel.json[0]),
        configured: true,
      });
    }
  } catch {
    /* continue */
  }

  // 2) Storage catalog
  try {
    const stored = await storageGetJson(`catalog/eas/${eaId}.json`);
    if (stored && stored.id) {
      return json(res, 200, {
        ok: true,
        via: 'storage',
        ea: mapEa(stored),
        configured: true,
      });
    }
  } catch {
    /* continue */
  }

  return json(res, 404, {
    ok: false,
    error: 'Managed EA not found',
    configured: true,
  });
};

function mapEa(row) {
  return {
    id: String(row.id),
    name: String(row.name || ''),
    pictureUri: row.picture_uri || row.pictureUri || null,
    symbols: Array.isArray(row.symbols) ? row.symbols : [],
    createdAt: String(row.created_at || row.createdAt || new Date().toISOString()),
  };
}
