const { applyCors, json, readJsonBody } = require('../_lib/cors');
const {
  getSupabaseAdmin,
  normalizeLicenseKey,
  sbFetch,
  storagePutJson,
  resolvePictureUri,
  stripDataUrl,
} = require('../_lib/supabaseAdmin');

/**
 * POST /api/licenses/put
 * Body: { ea?: {...}, key: {...} }
 * Writes EA + license key to Supabase tables when present; otherwise
 * durable Storage fallback under ea-pictures/catalog/.
 * Data-URL logos are uploaded to Storage and stored as public http URLs
 * (never stripped to null without attempting upload).
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
      error:
        'Supabase service role not configured on server (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).',
      configured: false,
    });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { ok: false, error: 'Invalid JSON body' });
  }

  const keyIn = body.key || body.license || null;
  const eaIn = body.ea || body.robot || null;
  if (!keyIn || !keyIn.key || !keyIn.id) {
    return json(res, 400, {
      ok: false,
      error: 'key object with id + key is required',
    });
  }

  const keyNorm = normalizeLicenseKey(keyIn.key);
  if (!keyNorm.startsWith('EDGES-') || keyNorm.length < 20) {
    return json(res, 400, { ok: false, error: 'Invalid license key format' });
  }

  const eaId = String(
    (eaIn && (eaIn.id || eaIn.eaId)) || keyIn.eaId || keyIn.ea_id || '',
  );
  if (!eaId) {
    return json(res, 400, { ok: false, error: 'ea id is required' });
  }

  const rawEaPic =
    (eaIn && (eaIn.pictureUri || eaIn.picture_uri)) ||
    keyIn.eaPictureUri ||
    keyIn.ea_picture_uri ||
    null;
  const rawKeyPic =
    keyIn.eaPictureUri || keyIn.ea_picture_uri || rawEaPic || null;

  // Upload data: logos → public URLs before any strip/row write.
  const [eaPictureResolved, keyPictureResolved] = await Promise.all([
    resolvePictureUri(`eas/${eaId}`, rawEaPic),
    resolvePictureUri(`keys/${String(keyIn.id)}`, rawKeyPic),
  ]);
  const durableEaPic =
    eaPictureResolved || keyPictureResolved || stripDataUrl(rawEaPic);
  const durableKeyPic =
    keyPictureResolved || eaPictureResolved || stripDataUrl(rawKeyPic);

  const ea = {
    id: eaId,
    name: String(
      (eaIn && (eaIn.name || eaIn.eaName)) ||
        keyIn.eaName ||
        keyIn.ea_name ||
        'EA',
    ),
    picture_uri: durableEaPic,
    symbols: Array.isArray(eaIn && (eaIn.symbols || eaIn.eaSymbols))
      ? eaIn.symbols || eaIn.eaSymbols
      : Array.isArray(keyIn.eaSymbols || keyIn.ea_symbols)
        ? keyIn.eaSymbols || keyIn.ea_symbols
        : [],
    created_at:
      (eaIn && (eaIn.createdAt || eaIn.created_at)) ||
      new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const keyRow = {
    id: String(keyIn.id),
    ea_id: ea.id,
    ea_name: String(keyIn.eaName || keyIn.ea_name || ea.name),
    key: String(keyIn.key),
    key_normalized: keyNorm,
    created_at: keyIn.createdAt || keyIn.created_at || new Date().toISOString(),
    ea_picture_uri: durableKeyPic,
    ea_symbols: Array.isArray(keyIn.eaSymbols || keyIn.ea_symbols)
      ? keyIn.eaSymbols || keyIn.ea_symbols
      : ea.symbols,
    assignee_name: keyIn.assigneeName || keyIn.assignee_name || null,
    assignee_email: keyIn.assigneeEmail || keyIn.assignee_email || null,
    issued_by_email: keyIn.issuedByEmail || keyIn.issued_by_email || null,
    status: keyIn.status || 'unused',
    activated_at: keyIn.activatedAt || keyIn.activated_at || null,
  };

  // 1) Prefer relational tables when the schema is applied.
  let tableError = null;
  try {
    const eaUpsert = await sbFetch('/rest/v1/managed_eas?on_conflict=id', {
      method: 'POST',
      body: [ea],
      prefer: 'resolution=merge-duplicates,return=minimal',
    });
    if (!eaUpsert.ok) {
      tableError =
        eaUpsert.json?.message ||
        eaUpsert.json?.code ||
        eaUpsert.text.slice(0, 180);
      if (eaUpsert.status !== 404 && eaUpsert.json?.code !== 'PGRST205') {
        // Real error (not missing table) — still try storage, but report.
      }
    } else {
      const keyUpsert = await sbFetch('/rest/v1/license_keys?on_conflict=id', {
        method: 'POST',
        body: [keyRow],
        prefer: 'resolution=merge-duplicates,return=minimal',
      });
      if (keyUpsert.ok) {
        // Also mirror to storage for redundancy.
        try {
          await storagePutJson(`catalog/keys/${keyNorm}.json`, {
            ...keyRow,
            ea,
          });
          await storagePutJson(`catalog/eas/${ea.id}.json`, ea);
        } catch {
          /* table write succeeded — storage mirror optional */
        }
        return json(res, 200, {
          ok: true,
          via: 'table',
          key_normalized: keyNorm,
          configured: true,
          ea_picture_uri: durableEaPic,
          key_picture_uri: durableKeyPic,
        });
      }
      tableError =
        keyUpsert.json?.message ||
        keyUpsert.json?.code ||
        keyUpsert.text.slice(0, 180);
    }
  } catch (err) {
    tableError = String(err?.message || err);
  }

  // 2) Durable Storage fallback (works before SQL migrations are applied).
  try {
    await storagePutJson(`catalog/eas/${ea.id}.json`, ea);
    await storagePutJson(`catalog/keys/${keyNorm}.json`, {
      ...keyRow,
      ea,
    });
    return json(res, 200, {
      ok: true,
      via: 'storage',
      key_normalized: keyNorm,
      configured: true,
      serviceKeyKind: admin.serviceKeyKind,
      tableError: tableError || undefined,
      ea_picture_uri: durableEaPic,
      key_picture_uri: durableKeyPic,
      hint:
        tableError && /PGRST205|schema cache|does not exist/i.test(tableError)
          ? 'Tables missing — wrote to Storage. Apply supabase/migrations/*.sql for relational sync.'
          : undefined,
    });
  } catch (err) {
    const rls = err?.code === 'STORAGE_RLS';
    const kind = err?.keyKind || admin.serviceKeyKind;
    return json(res, 502, {
      ok: false,
      error: String(err?.message || err),
      tableError: tableError || undefined,
      configured: true,
      serviceKeyKind: kind,
      hint: rls
        ? 'Storage RLS blocked the write. serviceKeyKind should be sb_secret or jwt:service_role. Apply supabase/migrations/*.sql (public INSERT on ea-pictures) or replace SERVICE_ROLE value with the project Secret key — no need to re-link Shared env.'
        : undefined,
    });
  }
};
