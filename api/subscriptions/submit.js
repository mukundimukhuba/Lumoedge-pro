const { applyCors, json, readJsonBody } = require('../_lib/cors');
const { getSupabaseAdmin, sbFetch, storagePutJson } = require('../_lib/supabaseAdmin');
const { normalizeEmail } = require('../_lib/superAdmin');

/**
 * POST /api/subscriptions/submit
 * Client payment submission → pending subscription.
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
        'Supabase service role not configured (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).',
      configured: false,
    });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { ok: false, error: 'Invalid JSON body' });
  }

  const clientName = String(body.clientName || body.client_name || body.name || '').trim();
  const clientEmail = normalizeEmail(body.clientEmail || body.client_email || body.email);
  const paymentMethod = String(
    body.paymentMethod || body.payment_method || '',
  ).trim();
  const paymentReference = String(
    body.paymentReference || body.payment_reference || body.paymentProof || '',
  ).trim();
  const paymentProof = String(
    body.paymentProof || body.payment_proof || paymentReference || '',
  ).trim();
  const amountUsd = Number(body.amountUsd || body.amount_usd || 35) || 35;
  const eaName = body.eaName || body.ea_name || null;
  const mentorEmail = normalizeEmail(body.mentorEmail || body.mentor_email || '') || null;

  if (!clientName) {
    return json(res, 400, { ok: false, error: 'Client name required' });
  }
  if (!clientEmail || !clientEmail.includes('@')) {
    return json(res, 400, { ok: false, error: 'Valid client email required' });
  }
  if (!paymentMethod) {
    return json(res, 400, { ok: false, error: 'Payment method required' });
  }
  if (!paymentReference && !paymentProof) {
    return json(res, 400, {
      ok: false,
      error: 'Payment reference / proof required',
    });
  }

  // If this email already has an active/approved subscription, return it.
  // Creating another pending row masks access ("Approval pending" incident).
  try {
    const existing = await sbFetch(
      `/rest/v1/subscriptions?client_email=ilike.${encodeURIComponent(
        clientEmail,
      )}&status=in.(active,approved)&select=*&order=created_at.desc&limit=1`,
    );
    if (existing.ok && Array.isArray(existing.json) && existing.json[0]) {
      return json(res, 200, {
        ok: true,
        via: 'existing',
        reused: true,
        subscription: mapSub(existing.json[0]),
      });
    }
  } catch {
    /* continue to create */
  }

  // Prefer RPC (enforces validation + unique id)
  try {
    const rpc = await sbFetch('/rest/v1/rpc/submit_subscription', {
      method: 'POST',
      body: {
        p_client_name: clientName,
        p_client_email: clientEmail,
        p_payment_method: paymentMethod,
        p_payment_reference: paymentReference || paymentProof,
        p_payment_proof: paymentProof || paymentReference,
        p_amount_usd: amountUsd,
        p_ea_name: eaName,
        p_mentor_email: mentorEmail,
      },
    });
    if (rpc.ok && rpc.json && rpc.json.id) {
      return json(res, 200, {
        ok: true,
        via: 'rpc',
        subscription: mapSub(rpc.json),
      });
    }
    if (rpc.status !== 404 && rpc.json?.code !== 'PGRST202') {
      return json(res, 502, {
        ok: false,
        error:
          rpc.json?.message ||
          rpc.json?.hint ||
          rpc.text?.slice(0, 200) ||
          'submit_subscription failed',
      });
    }
  } catch (err) {
    /* fall through to table/storage */
    if (String(err?.message || '').includes('not configured')) {
      return json(res, 503, { ok: false, error: String(err.message) });
    }
  }

  const id = `sub_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  const row = {
    id,
    client_name: clientName,
    client_email: clientEmail,
    ea_name: eaName,
    mentor_email: mentorEmail,
    amount_usd: amountUsd,
    payment_method: paymentMethod,
    payment_reference: paymentReference || paymentProof,
    payment_proof: paymentProof || paymentReference,
    payment_date: new Date().toISOString(),
    status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    const ins = await sbFetch('/rest/v1/subscriptions', {
      method: 'POST',
      body: [row],
      prefer: 'return=representation',
    });
    if (ins.ok && Array.isArray(ins.json) && ins.json[0]) {
      return json(res, 200, {
        ok: true,
        via: 'table',
        subscription: mapSub(ins.json[0]),
      });
    }
  } catch {
    /* fall through */
  }

  // Do not report Storage-only success to clients: Super Admin list/approve
  // need the subscriptions table + RPCs from migration 008. Best-effort
  // Storage write is for ops recovery only — still return a safe failure.
  try {
    await storagePutJson(`catalog/subscriptions/${id}.json`, row);
  } catch {
    /* ignore */
  }
  return json(res, 503, {
    ok: false,
    error:
      'Payment registration is temporarily unavailable. Please try again later or contact support.',
    code: 'SUBSCRIPTIONS_SCHEMA_MISSING',
  });
};

function mapSub(row) {
  return {
    id: String(row.id),
    clientName: String(row.client_name || row.clientName || ''),
    clientEmail: normalizeEmail(row.client_email || row.clientEmail),
    eaId: row.ea_id || row.eaId || null,
    eaName: row.ea_name || row.eaName || null,
    mentorEmail: row.mentor_email || row.mentorEmail || null,
    mentorName: row.mentor_name || row.mentorName || null,
    amountUsd: Number(row.amount_usd ?? row.amountUsd ?? 35) || 35,
    paymentMethod: String(row.payment_method || row.paymentMethod || ''),
    paymentReference: String(
      row.payment_reference || row.paymentReference || '',
    ),
    paymentProof: row.payment_proof || row.paymentProof || null,
    paymentDate: String(
      row.payment_date || row.paymentDate || row.created_at || '',
    ),
    status: String(row.status || 'pending'),
    reviewedBy: row.reviewed_by || row.reviewedBy || null,
    reviewedAt: row.reviewed_at || row.reviewedAt || null,
    reviewNote: row.review_note || row.reviewNote || null,
    createdAt: String(row.created_at || row.createdAt || ''),
    updatedAt: String(row.updated_at || row.updatedAt || ''),
  };
}
