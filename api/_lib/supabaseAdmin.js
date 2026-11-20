/**
 * Server-side Supabase admin config (service role).
 * Never log key values. Accepts legacy alias `supabase`.
 */

function normalizeSupabaseUrl(raw) {
  let url = String(raw || '')
    .trim()
    .replace(/\/+$/, '');
  if (!url) return '';
  url = url.replace(/\/rest\/v1$/i, '').replace(/\/rest$/i, '');
  return url.replace(/\/+$/, '');
}

function readSupabaseUrl() {
  return normalizeSupabaseUrl(
    process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '',
  );
}

function readServiceRoleKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.supabase ||
    ''
  ).trim();
}

function readAnonKey() {
  return (
    process.env.SUPABASE_ANON_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  ).trim();
}

function getSupabaseAdmin() {
  const url = readSupabaseUrl();
  const serviceKey = readServiceRoleKey();
  const anonKey = readAnonKey();
  return {
    url,
    serviceKey,
    anonKey,
    configured: Boolean(url && serviceKey),
    clientConfigured: Boolean(url && anonKey),
  };
}

function normalizeLicenseKey(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

async function sbFetch(path, { method = 'GET', body, prefer } = {}) {
  const { url, serviceKey } = getSupabaseAdmin();
  if (!url || !serviceKey) {
    const err = new Error('Supabase admin not configured');
    err.code = 'NOT_CONFIGURED';
    throw err;
  }
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${url}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json, text };
}

/** Upload JSON (or bytes) to the public ea-pictures bucket with service role. */
async function storagePutJson(objectPath, value) {
  const { url, serviceKey } = getSupabaseAdmin();
  const res = await fetch(
    `${url}/storage/v1/object/ea-pictures/${objectPath}`,
    {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'x-upsert': 'true',
      },
      body: JSON.stringify(value),
    },
  );
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`storage put failed (${res.status}): ${text.slice(0, 180)}`);
    err.code = 'STORAGE_PUT';
    throw err;
  }
  return true;
}

async function storageGetJson(objectPath) {
  const { url, serviceKey } = getSupabaseAdmin();
  const res = await fetch(
    `${url}/storage/v1/object/ea-pictures/${objectPath}`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    },
  );
  if (res.status === 404) return null;
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`storage get failed (${res.status}): ${text.slice(0, 180)}`);
    err.code = 'STORAGE_GET';
    throw err;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function stripDataUrl(uri) {
  if (!uri) return null;
  if (String(uri).startsWith('data:')) return null;
  return uri;
}

module.exports = {
  getSupabaseAdmin,
  normalizeLicenseKey,
  sbFetch,
  storagePutJson,
  storageGetJson,
  stripDataUrl,
};
