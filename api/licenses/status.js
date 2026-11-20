const { applyCors, json } = require('../_lib/cors');
const { getSupabaseAdmin, sbFetch } = require('../_lib/supabaseAdmin');

/**
 * GET /api/licenses/status — env + table reachability (no secrets).
 */
module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const admin = getSupabaseAdmin();
  const out = {
    ok: true,
    urlConfigured: Boolean(admin.url),
    serviceRoleConfigured: Boolean(admin.serviceKey),
    anonConfigured: Boolean(admin.anonKey),
    tables: { managed_eas: 'unknown', license_keys: 'unknown' },
  };

  if (!admin.configured) {
    out.ok = false;
    out.error = 'SUPABASE_URL or service role missing on server';
    return json(res, 200, out);
  }

  for (const t of ['managed_eas', 'license_keys']) {
    try {
      const r = await sbFetch(`/rest/v1/${t}?select=id&limit=1`);
      if (r.ok) out.tables[t] = 'ok';
      else if (r.json?.code === 'PGRST205' || r.status === 404)
        out.tables[t] = 'missing';
      else out.tables[t] = `error:${r.json?.code || r.status}`;
    } catch (err) {
      out.tables[t] = `error:${String(err?.message || err).slice(0, 80)}`;
    }
  }

  out.ok =
    out.tables.managed_eas === 'ok' || out.tables.license_keys === 'ok'
      ? true
      : out.tables.managed_eas === 'missing';
  out.storageFallback =
    out.tables.managed_eas === 'missing' ||
    out.tables.license_keys === 'missing';
  return json(res, 200, out);
};
