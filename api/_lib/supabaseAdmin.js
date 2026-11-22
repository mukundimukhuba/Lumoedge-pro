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

/** Classify key shape/role without revealing the secret. */
function classifyKeyKind(raw) {
  const k = String(raw || '').trim();
  if (!k) return 'empty';
  if (k.startsWith('sb_secret')) return 'sb_secret';
  if (k.startsWith('sb_publishable')) return 'sb_publishable';
  if (k.startsWith('sb_')) return 'sb_other';
  if (k.startsWith('eyJ')) {
    try {
      const mid = k.split('.')[1];
      if (!mid) return 'jwt:bad';
      const json = Buffer.from(mid, 'base64url').toString('utf8');
      const payload = JSON.parse(json);
      const role = String(payload.role || 'unknown');
      return `jwt:${role}`;
    } catch {
      return 'jwt:bad';
    }
  }
  return 'unknown';
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
    serviceKeyKind: classifyKeyKind(serviceKey),
    anonKeyKind: classifyKeyKind(anonKey),
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

function isNoSuchKey(status, text, json) {
  if (status === 404) return true;
  const code = json?.code || json?.statusCode || '';
  const msg = String(json?.message || text || '');
  return (
    String(code) === '404' ||
    String(code) === 'NoSuchKey' ||
    /NoSuchKey|not_found|Object not found/i.test(msg)
  );
}

function isRlsDenied(status, text, json) {
  const msg = String(json?.message || text || '');
  const code = String(json?.code || json?.error || '');
  return (
    status === 403 ||
    String(json?.statusCode) === '403' ||
    /row-level security|AccessDenied|Unauthorized/i.test(msg) ||
    /AccessDenied/i.test(code)
  );
}

async function ensureEaPicturesBucket() {
  const { url, serviceKey } = getSupabaseAdmin();
  if (!url || !serviceKey) return false;
  const res = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: 'ea-pictures',
      name: 'ea-pictures',
      public: true,
    }),
  });
  if (res.ok || res.status === 409) return true;
  const text = await res.text();
  if (/already|exists|duplicate/i.test(text)) return true;
  // Bucket may already exist; GET to confirm
  const get = await fetch(`${url}/storage/v1/bucket/ea-pictures`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  return get.ok;
}

async function storageObjectFetch(objectPath, { method = 'GET', body, upsert } = {}) {
  const { url, serviceKey } = getSupabaseAdmin();
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  };
  if (body != null) {
    headers['Content-Type'] = 'application/json';
  }
  if (upsert) headers['x-upsert'] = 'true';
  return fetch(`${url}/storage/v1/object/ea-pictures/${objectPath}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
}

/** Upload JSON to ea-pictures with service role. Retries without upsert + PUT. */
async function storagePutJson(objectPath, value) {
  await ensureEaPicturesBucket();

  const attempts = [
    { method: 'POST', upsert: false },
    { method: 'POST', upsert: true },
    { method: 'PUT', upsert: true },
  ];

  let lastStatus = 0;
  let lastText = '';
  let lastJson = null;
  let sawExists = false;

  for (const attempt of attempts) {
    const res = await storageObjectFetch(objectPath, {
      method: attempt.method,
      body: value,
      upsert: attempt.upsert,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    lastStatus = res.status;
    lastText = text;
    lastJson = json;

    if (res.ok) return true;

    // Conflict without upsert → retry with upsert/PUT
    if (
      res.status === 400 ||
      res.status === 409 ||
      /already|exists|Duplicate|ResourceAlreadyExists/i.test(text)
    ) {
      sawExists = true;
      continue;
    }

    if (isRlsDenied(res.status, text, json)) {
      const kind = getSupabaseAdmin().serviceKeyKind;
      const err = new Error(
        `storage put RLS denied (${res.status}; keyKind=${kind}): ${text.slice(0, 160)}`,
      );
      err.code = 'STORAGE_RLS';
      err.keyKind = kind;
      throw err;
    }
  }

  if (sawExists) {
    // Last resort: delete then plain insert
    try {
      await storageObjectFetch(objectPath, { method: 'DELETE' });
    } catch {
      /* ignore */
    }
    const res = await storageObjectFetch(objectPath, {
      method: 'POST',
      body: value,
      upsert: false,
    });
    const text = await res.text();
    if (res.ok) return true;
    lastStatus = res.status;
    lastText = text;
    try {
      lastJson = text ? JSON.parse(text) : null;
    } catch {
      lastJson = null;
    }
    if (isRlsDenied(res.status, text, lastJson)) {
      const kind = getSupabaseAdmin().serviceKeyKind;
      const err = new Error(
        `storage put RLS denied (${res.status}; keyKind=${kind}): ${text.slice(0, 160)}`,
      );
      err.code = 'STORAGE_RLS';
      err.keyKind = kind;
      throw err;
    }
  }

  const err = new Error(
    `storage put failed (${lastStatus}): ${String(lastText).slice(0, 180)}`,
  );
  err.code = 'STORAGE_PUT';
  throw err;
}

async function storageGetPublicJson(objectPath) {
  const { url } = getSupabaseAdmin();
  const pub = await fetch(
    `${url}/storage/v1/object/public/ea-pictures/${objectPath}`,
  );
  const pubText = await pub.text();
  let pubJson = null;
  try {
    pubJson = pubText ? JSON.parse(pubText) : null;
  } catch {
    pubJson = null;
  }
  if (pub.ok) return { ok: true, value: pubJson };
  if (isNoSuchKey(pub.status, pubText, pubJson)) return { ok: false, missing: true };
  return { ok: false, missing: false, status: pub.status, text: pubText };
}

async function storageGetJson(objectPath) {
  // 1) Authenticated object get
  const res = await storageObjectFetch(objectPath, { method: 'GET' });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (res.ok) return json;

  // 2) Public URL fallback (public buckets serve reads without auth)
  if (isNoSuchKey(res.status, text, json) || isRlsDenied(res.status, text, json)) {
    const pub = await storageGetPublicJson(objectPath);
    if (pub.ok) return pub.value;
    if (pub.missing || isNoSuchKey(res.status, text, json)) return null;
  }

  if (isNoSuchKey(res.status, text, json)) return null;

  const err = new Error(
    `storage get failed (${res.status}): ${text.slice(0, 180)}`,
  );
  err.code = 'STORAGE_GET';
  throw err;
}

/** Non-destructive probe: can this key write under catalog/? */
async function probeStorageWrite() {
  const admin = getSupabaseAdmin();
  if (!admin.configured) {
    return { ok: false, reason: 'not_configured', keyKind: admin.serviceKeyKind };
  }
  const path = `catalog/_probe/${Date.now()}.json`;
  try {
    await storagePutJson(path, { probe: true, t: Date.now() });
    // best-effort cleanup
    try {
      await storageObjectFetch(path, { method: 'DELETE' });
    } catch {
      /* ignore */
    }
    return { ok: true, keyKind: admin.serviceKeyKind };
  } catch (err) {
    return {
      ok: false,
      reason: err?.code || 'error',
      keyKind: admin.serviceKeyKind,
      message: String(err?.message || err).slice(0, 160),
    };
  }
}

function stripDataUrl(uri) {
  if (!uri) return null;
  if (String(uri).startsWith('data:')) return null;
  return uri;
}

function parseDataUrlImage(dataUrl) {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(
    String(dataUrl || ''),
  );
  if (!m) return null;
  const mime = m[1];
  const b64 = m[2];
  let buffer;
  try {
    buffer = Buffer.from(b64, 'base64');
  } catch {
    return null;
  }
  if (!buffer.length) return null;
  const ext = /png/i.test(mime) ? 'png' : /webp/i.test(mime) ? 'webp' : 'jpg';
  return { mime, buffer, ext };
}

/**
 * Upload raw bytes to ea-pictures (service role). Used for EA logos so
 * license rows store a public http URL instead of stripping data: URLs.
 */
async function storagePutBytes(objectPath, buffer, contentType) {
  await ensureEaPicturesBucket();
  const { url, serviceKey } = getSupabaseAdmin();
  const attempts = [
    { method: 'POST', upsert: false },
    { method: 'POST', upsert: true },
    { method: 'PUT', upsert: true },
  ];
  let lastStatus = 0;
  let lastText = '';
  for (const attempt of attempts) {
    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': contentType || 'application/octet-stream',
    };
    if (attempt.upsert) headers['x-upsert'] = 'true';
    const res = await fetch(
      `${url}/storage/v1/object/ea-pictures/${objectPath}`,
      {
        method: attempt.method,
        headers,
        body: buffer,
      },
    );
    const text = await res.text();
    lastStatus = res.status;
    lastText = text;
    if (res.ok) return true;
    if (
      res.status === 400 ||
      res.status === 409 ||
      /already|exists|Duplicate|ResourceAlreadyExists/i.test(text)
    ) {
      continue;
    }
    if (isRlsDenied(res.status, text, null)) {
      const kind = getSupabaseAdmin().serviceKeyKind;
      const err = new Error(
        `storage put bytes RLS denied (${res.status}; keyKind=${kind}): ${text.slice(0, 160)}`,
      );
      err.code = 'STORAGE_RLS';
      err.keyKind = kind;
      throw err;
    }
  }
  const err = new Error(
    `storage put bytes failed (${lastStatus}): ${String(lastText).slice(0, 180)}`,
  );
  err.code = 'STORAGE_PUT';
  throw err;
}

function publicObjectUrl(objectPath) {
  const { url } = getSupabaseAdmin();
  return `${url}/storage/v1/object/public/ea-pictures/${objectPath}`;
}

/**
 * Turn a picture URI into a durable public URL.
 * - http(s)/file paths pass through
 * - data: image URLs are uploaded to ea-pictures/{objectBase}.jpg|png
 * - on upload failure, returns null (never persist giant data URLs in rows)
 */
async function resolvePictureUri(objectBase, uri) {
  if (!uri) return null;
  const s = String(uri);
  if (/^https?:\/\//i.test(s) || s.startsWith('file:') || s.startsWith('/')) {
    return s;
  }
  if (!s.startsWith('data:')) return null;
  const parsed = parseDataUrlImage(s);
  if (!parsed) return null;
  const objectPath = `${objectBase}.${parsed.ext}`;
  try {
    await storagePutBytes(objectPath, parsed.buffer, parsed.mime);
    return publicObjectUrl(objectPath);
  } catch (err) {
    console.warn(
      '[edges] resolvePictureUri upload failed',
      objectBase,
      String(err?.message || err).slice(0, 160),
    );
    return null;
  }
}

module.exports = {
  getSupabaseAdmin,
  classifyKeyKind,
  normalizeLicenseKey,
  sbFetch,
  storagePutJson,
  storageGetJson,
  storagePutBytes,
  ensureEaPicturesBucket,
  probeStorageWrite,
  stripDataUrl,
  resolvePictureUri,
};
