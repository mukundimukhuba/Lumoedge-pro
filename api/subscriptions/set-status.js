const { applyCors, json, readJsonBody } = require('../_lib/cors');
const { getSupabaseAdmin, sbFetch } = require('../_lib/supabaseAdmin');
const {
  normalizeEmail,
  isSuperAdminEmail,
} = require('../_lib/superAdmin');

/**
 * POST /api/subscriptions/set-status
 * Super admin only: approve | decline (also active/expired/pending).
 * Body: { actorEmail, subscriptionId, status, reviewNote? }
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
      error: 'Supabase service role not configured.',
      configured: false,
    });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { ok: false, error: 'Invalid JSON body' });
  }

  const actorEmail = normalizeEmail(body.actorEmail || body.actor_email);
  const subscriptionId = String(
    body.subscriptionId || body.subscription_id || body.id || '',
  ).trim();
  let status = String(body.status || body.newStatus || '')
    .trim()
    .toLowerCase();
  const reviewNote = body.reviewNote || body.review_note || null;

  if (!isSuperAdminEmail(actorEmail)) {
    return json(res, 403, {
      ok: false,
      error: 'Only super admin can approve or decline payments',
    });
  }
  if (!subscriptionId) {
    return json(res, 400, { ok: false, error: 'subscriptionId required' });
  }
  if (
    !['approved', 'declined', 'active', 'expired', 'pending'].includes(status)
  ) {
    return json(res, 400, { ok: false, error: 'Invalid status' });
  }

  try {
    const rpc = await sbFetch('/rest/v1/rpc/admin_set_subscription_status', {
      method: 'POST',
      body: {
        actor_email: actorEmail,
        p_subscription_id: subscriptionId,
        p_new_status: status,
        p_review_note: reviewNote,
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
          rpc.text?.slice(0, 200) ||
          'admin_set_subscription_status failed',
      });
    }
  } catch (err) {
    /* table fallback */
  }

  // Approve → active (same as RPC)
  if (status === 'approved') status = 'active';

  const patch = {
    status,
    reviewed_by: actorEmail,
    reviewed_at: new Date().toISOString(),
    review_note: reviewNote,
    updated_at: new Date().toISOString(),
  };

  const upd = await sbFetch(
    `/rest/v1/subscriptions?id=eq.${encodeURIComponent(subscriptionId)}`,
    {
      method: 'PATCH',
      body: patch,
      prefer: 'return=representation',
    },
  );
  if (upd.ok && Array.isArray(upd.json) && upd.json[0]) {
    return json(res, 200, {
      ok: true,
      via: 'table',
      subscription: mapSub(upd.json[0]),
    });
  }

  return json(res, 404, {
    ok: false,
    error:
      upd.json?.message ||
      upd.text?.slice(0, 200) ||
      'Subscription not found — apply migration 008',
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
