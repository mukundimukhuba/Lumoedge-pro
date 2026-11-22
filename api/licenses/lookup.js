const { applyCors, json, readJsonBody } = require('../_lib/cors');
const {
  getSupabaseAdmin,
  normalizeLicenseKey,
  sbFetch,
  storageGetJson,
} = require('../_lib/supabaseAdmin');

/**
 * POST /api/licenses/lookup
 * Body: { key: "EDGES-...." }
 * Looks up a mentor-issued key from license_keys (RPC/table) or Storage.
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

  let rawKey = '';
  if (req.method === 'GET') {
    try {
      const u = new URL(req.url || '', 'http://localhost');
      rawKey = u.searchParams.get('key') || '';
    } catch {
      rawKey = '';
    }
  } else {
    try {
      const body = await readJsonBody(req);
      rawKey = String(body.key || body.p_key || '');
    } catch {
      return json(res, 400, { ok: false, error: 'Invalid JSON body' });
    }
  }

  const keyNorm = normalizeLicenseKey(rawKey);
  if (!keyNorm.startsWith('EDGES-') || keyNorm.length < 20) {
    return json(res, 400, { ok: false, error: 'Invalid license key format' });
  }

  // 1) RPC
  try {
    const rpc = await sbFetch('/rest/v1/rpc/lookup_license_key', {
      method: 'POST',
      body: { p_key: keyNorm },
    });
    if (rpc.ok && Array.isArray(rpc.json) && rpc.json.length) {
      const row = rpc.json[0];
      const ea = await loadEaForKey(row);
      return json(res, 200, {
        ok: true,
        via: 'rpc',
        key: mapKeyWithEa(row, ea),
        ea,
      });
    }
  } catch {
    /* continue */
  }

  // 2) Table eq
  try {
    const sel = await sbFetch(
      `/rest/v1/license_keys?key_normalized=eq.${encodeURIComponent(keyNorm)}&select=*&limit=1`,
    );
    if (sel.ok && Array.isArray(sel.json) && sel.json.length) {
      const row = sel.json[0];
      const ea = await loadEaForKey(row);
      return json(res, 200, {
        ok: true,
        via: 'table',
        key: mapKeyWithEa(row, ea),
        ea,
      });
    }
  } catch {
    /* continue */
  }

  // 3) Storage catalog fallback (auth get, then public URL)
  try {
    const stored = await storageGetJson(`catalog/keys/${keyNorm}.json`);
    if (stored && stored.key) {
      let ea = stored.ea ? mapEa(stored.ea) : null;
      if (!ea && (stored.ea_id || stored.eaId)) {
        ea = await loadEaById(String(stored.ea_id || stored.eaId));
      }
      return json(res, 200, {
        ok: true,
        via: 'storage',
        key: mapKeyWithEa(stored, ea),
        ea,
      });
    }
  } catch (err) {
    return json(res, 502, {
      ok: false,
      error: String(err?.message || err),
      configured: true,
      serviceKeyKind: admin.serviceKeyKind,
    });
  }

  return json(res, 404, {
    ok: false,
    error: 'License key not found in Supabase tables or Storage catalog.',
    key_normalized: keyNorm,
    configured: true,
    serviceKeyKind: admin.serviceKeyKind,
  });
};

function mapKey(row) {
  return {
    id: String(row.id),
    eaId: String(row.ea_id || row.eaId || ''),
    eaName: String(row.ea_name || row.eaName || ''),
    key: String(row.key),
    createdAt: String(row.created_at || row.createdAt || new Date().toISOString()),
    eaPictureUri: row.ea_picture_uri || row.eaPictureUri || null,
    eaSymbols: Array.isArray(row.ea_symbols)
      ? row.ea_symbols
      : Array.isArray(row.eaSymbols)
        ? row.eaSymbols
        : [],
  };
}

/** Managed EA branding overlays the key snapshot. */
function mapKeyWithEa(row, ea) {
  const key = mapKey(row);
  if (!ea) return key;
  return {
    ...key,
    eaName: (ea.name || '').trim() || key.eaName,
    eaPictureUri: ea.pictureUri || key.eaPictureUri,
    eaSymbols:
      Array.isArray(ea.symbols) && ea.symbols.length
        ? ea.symbols
        : key.eaSymbols,
  };
}

function mapEa(row) {
  return {
    id: String(row.id),
    name: String(row.name || ''),
    pictureUri: row.picture_uri || row.pictureUri || null,
    symbols: Array.isArray(row.symbols) ? row.symbols : [],
    createdAt: String(row.created_at || row.createdAt || new Date().toISOString()),
  };
}

async function loadEaById(eaId) {
  if (!eaId) return null;
  try {
    const eaSel = await sbFetch(
      `/rest/v1/managed_eas?id=eq.${encodeURIComponent(eaId)}&select=*&limit=1`,
    );
    if (eaSel.ok && Array.isArray(eaSel.json) && eaSel.json.length) {
      return mapEa(eaSel.json[0]);
    }
  } catch {
    /* fall through */
  }
  try {
    const stored = await storageGetJson(`catalog/eas/${eaId}.json`);
    if (stored && stored.id) return mapEa(stored);
  } catch {
    /* ignore */
  }
  return null;
}

async function loadEaForKey(row) {
  const eaId = String(row.ea_id || row.eaId || '');
  return loadEaById(eaId);
}
