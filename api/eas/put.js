const { applyCors, json, readJsonBody } = require('../_lib/cors');
const {
  getSupabaseAdmin,
  sbFetch,
  storagePutJson,
  resolvePictureUri,
  stripDataUrl,
} = require('../_lib/supabaseAdmin');
const {
  normalizeEmail,
  assertCanWriteOwnedRow,
} = require('../_lib/mentorScope');

/**
 * POST /api/eas/put
 * Body: { ea: { id, name?, pictureUri?, symbols?, createdAt?, ownerEmail? },
 *         actorEmail?, cascade?: true }
 *
 * Managed EA is source of truth for branding. Upserts the EA, uploads data:
 * logos to public Storage URLs, then cascades name + picture to every
 * license_keys row with that ea_id (and Storage catalog mirrors).
 * Portal writes must include actorEmail; cross-mentor updates are rejected.
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

  const eaIn = body.ea || body.robot || body;
  const eaId = String(eaIn.id || eaIn.eaId || eaIn.ea_id || '').trim();
  if (!eaId) {
    return json(res, 400, { ok: false, error: 'ea id is required' });
  }

  const actorEmail = normalizeEmail(
    body.actorEmail || eaIn.ownerEmail || eaIn.owner_email || '',
  );
  const claimedOwner = normalizeEmail(
    eaIn.ownerEmail || eaIn.owner_email || actorEmail || '',
  );

  let existingOwner = '';
  let rowExists = false;
  try {
    const sel = await sbFetch(
      `/rest/v1/managed_eas?id=eq.${encodeURIComponent(eaId)}&select=id,owner_email&limit=1`,
    );
    if (sel.ok && Array.isArray(sel.json) && sel.json.length) {
      rowExists = true;
      existingOwner = normalizeEmail(sel.json[0].owner_email);
    }
  } catch {
    /* ownership check best-effort when table missing */
  }

  const gate = assertCanWriteOwnedRow({
    actorEmail,
    ownerEmail: existingOwner,
    claimedOwnerEmail: claimedOwner,
    rowExists,
  });
  if (!gate.ok) {
    return json(res, gate.status, {
      ok: false,
      error: gate.error,
      configured: true,
    });
  }

  const cascade = body.cascade !== false;
  const rawPic = eaIn.pictureUri || eaIn.picture_uri || null;
  const durablePic =
    (await resolvePictureUri(`eas/${eaId}`, rawPic)) || stripDataUrl(rawPic);

  const ownerEmail = existingOwner || claimedOwner || actorEmail || null;

  const ea = {
    id: eaId,
    name: String(eaIn.name || eaIn.eaName || 'EA').trim() || 'EA',
    picture_uri: durablePic,
    symbols: Array.isArray(eaIn.symbols) ? eaIn.symbols : [],
    created_at: eaIn.createdAt || eaIn.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    owner_email: ownerEmail,
  };

  let tableError = null;
  let cascaded = 0;
  let via = 'storage';

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
    } else {
      via = 'table';
      if (cascade) {
        // Patch all license keys under this EA so Activate/Home snapshots match.
        const patch = await sbFetch(
          `/rest/v1/license_keys?ea_id=eq.${encodeURIComponent(eaId)}`,
          {
            method: 'PATCH',
            body: {
              ea_name: ea.name,
              ea_picture_uri: durablePic,
            },
            prefer: 'return=representation',
          },
        );
        if (patch.ok && Array.isArray(patch.json)) {
          cascaded = patch.json.length;
        } else if (!patch.ok) {
          // Fallback: fetch keys then upsert one-by-one.
          try {
            const sel = await sbFetch(
              `/rest/v1/license_keys?ea_id=eq.${encodeURIComponent(eaId)}&select=*`,
            );
            if (sel.ok && Array.isArray(sel.json)) {
              for (const row of sel.json) {
                const next = {
                  ...row,
                  ea_name: ea.name,
                  ea_picture_uri: durablePic,
                };
                const up = await sbFetch(
                  '/rest/v1/license_keys?on_conflict=id',
                  {
                    method: 'POST',
                    body: [next],
                    prefer: 'resolution=merge-duplicates,return=minimal',
                  },
                );
                if (up.ok) cascaded += 1;
              }
            }
          } catch {
            /* cascade best-effort */
          }
        }
      }
    }
  } catch (err) {
    tableError = String(err?.message || err);
  }

  // Always mirror EA (+ cascade keys when we can read storage catalog).
  try {
    await storagePutJson(`catalog/eas/${eaId}.json`, ea);
    if (cascade) {
      // Best-effort: we can't list Storage folders reliably; keys mirror on next put.
    }
  } catch (err) {
    if (via !== 'table') {
      return json(res, 502, {
        ok: false,
        error: String(err?.message || err),
        tableError: tableError || undefined,
        configured: true,
      });
    }
  }

  return json(res, 200, {
    ok: true,
    via,
    configured: true,
    cascaded,
    tableError: tableError || undefined,
    ea: {
      id: ea.id,
      name: ea.name,
      pictureUri: durablePic,
      symbols: ea.symbols,
      createdAt: ea.created_at,
      ownerEmail: ownerEmail,
    },
    picture_uri: durablePic,
  });
};
