const { applyCors, json } = require('../_lib/cors');
const { logTechError, newErrorRef, SAFE_CONFIG } = require('../_lib/safeErrors');
const {
  getSupabaseAdmin,
  sbFetch,
  probeStorageWrite,
} = require('../_lib/supabaseAdmin');

/**
 * GET /api/licenses/status — env + table reachability (no secrets).
 * Optional ?probeStorage=1 runs a write probe under catalog/_probe/.
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
  const missing = [];
  if (!admin.url) missing.push('SUPABASE_URL');
  if (!admin.serviceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!admin.anonKey) missing.push('SUPABASE_ANON_KEY');

  // Booleans only — never values or lengths of secrets.
  const present = (name) => Boolean(String(process.env[name] || '').trim());
  const envPresence = {
    SUPABASE_URL: present('SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: present('SUPABASE_SERVICE_ROLE_KEY'),
    SUPABASE_ANON_KEY: present('SUPABASE_ANON_KEY'),
    EXPO_PUBLIC_SUPABASE_URL: present('EXPO_PUBLIC_SUPABASE_URL'),
    EXPO_PUBLIC_SUPABASE_ANON_KEY: present('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
    supabase_alias: present('supabase'),
  };

  const out = {
    ok: true,
    urlConfigured: Boolean(admin.url),
    serviceRoleConfigured: Boolean(admin.serviceKey),
    anonConfigured: Boolean(admin.anonKey),
    serviceKeyKind: admin.serviceKeyKind,
    anonKeyKind: admin.anonKeyKind,
    missingEnvNames: missing,
    envPresence,
    hint: undefined,
    tables: { managed_eas: 'unknown', license_keys: 'unknown' },
  };

  if (!admin.configured) {
    const errorRef = newErrorRef();
    logTechError(errorRef, `missing env: ${missing.join(',')}`, { code: 'config' });
    out.ok = false;
    out.error = SAFE_CONFIG;
    out.userMessage = SAFE_CONFIG;
    out.errorRef = errorRef;
    // Booleans only for UI health — never env names in error strings
    out.configured = false;
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

  let probeStorage = false;
  try {
    const u = new URL(req.url || '', 'http://localhost');
    probeStorage = u.searchParams.get('probeStorage') === '1';
  } catch {
    probeStorage = false;
  }
  if (probeStorage) {
    out.storageWrite = await probeStorageWrite();
    if (
      out.storageWrite &&
      !out.storageWrite.ok &&
      /publishable|jwt:anon/i.test(String(out.storageWrite.keyKind || ''))
    ) {
      const errorRef = newErrorRef();
      logTechError(errorRef, out.storageWrite, { code: 'storage_key_kind' });
      out.userMessage = SAFE_CONFIG;
      out.errorRef = errorRef;
    }
  }

  return json(res, 200, out);
};
