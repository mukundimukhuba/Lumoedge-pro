const { applyCors, json, readJsonBody } = require('../_lib/cors');
const { getSupabaseAdmin, sbFetch } = require('../_lib/supabaseAdmin');
const {
  normalizeEmail,
  isSuperAdminEmail,
} = require('../_lib/superAdmin');

/**
 * POST /api/subscriptions/list
 * Body: { actorEmail, role?: 'admin'|'client'|'mentor', clientEmail? }
 * - admin (super admin only): all subscriptions
 * - client: only that client's rows (clientEmail required, must match)
 * - mentor: approved/active for optional clientEmail
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
      error: 'Supabase service role not configured.',
      configured: false,
    });
  }

  let body = {};
  if (req.method === 'GET') {
    try {
      const u = new URL(req.url || '', 'http://localhost');
      body = {
        actorEmail: u.searchParams.get('actorEmail') || '',
        role: u.searchParams.get('role') || 'client',
        clientEmail: u.searchParams.get('clientEmail') || '',
      };
    } catch {
      body = {};
    }
  } else {
    try {
      body = await readJsonBody(req);
    } catch {
      return json(res, 400, { ok: false, error: 'Invalid JSON body' });
    }
  }

  const actorEmail = normalizeEmail(body.actorEmail || body.actor_email);
  const role = String(body.role || 'client').toLowerCase();
  const clientEmail = normalizeEmail(body.clientEmail || body.client_email);

  if (role === 'admin') {
    if (!isSuperAdminEmail(actorEmail)) {
      return json(res, 403, {
        ok: false,
        error: 'Only super admin can list all subscriptions',
      });
    }
    const rows = await listViaRpc('list_admin_subscriptions', {
      actor_email: actorEmail,
    });
    if (rows) {
      return json(res, 200, { ok: true, via: 'rpc', subscriptions: rows.map(mapSub) });
    }
    const fallback = await listTableAll();
    return json(res, 200, {
      ok: true,
      via: fallback.via,
      subscriptions: fallback.rows.map(mapSub),
    });
  }

  if (role === 'mentor') {
    if (!actorEmail) {
      return json(res, 400, { ok: false, error: 'actorEmail required' });
    }
    const rows = await listViaRpc('list_mentor_client_subscriptions', {
      actor_email: actorEmail,
      p_client_email: clientEmail || null,
    });
    if (rows) {
      return json(res, 200, { ok: true, via: 'rpc', subscriptions: rows.map(mapSub) });
    }
    const all = await listTableAll();
    const filtered = all.rows.filter((r) => {
      const st = String(r.status || '');
      if (st !== 'approved' && st !== 'active') return false;
      if (clientEmail && normalizeEmail(r.client_email) !== clientEmail) {
        return false;
      }
      if (isSuperAdminEmail(actorEmail)) return true;
      const m = normalizeEmail(r.mentor_email);
      return !m || m === actorEmail;
    });
    return json(res, 200, {
      ok: true,
      via: all.via,
      subscriptions: filtered.map(mapSub),
    });
  }

  // client
  const email = clientEmail || actorEmail;
  if (!email) {
    return json(res, 400, { ok: false, error: 'clientEmail required' });
  }
  const rows = await listViaRpc('list_client_subscriptions', {
    p_client_email: email,
  });
  if (rows) {
    return json(res, 200, {
      ok: true,
      via: 'rpc',
      // Prefer active/approved first so older clients that take subscriptions[0]
      // never land on Declined/Pending when a usable row exists.
      subscriptions: preferUsableFirst(rows.map(mapSub)),
    });
  }
  const all = await listTableAll();
  const filtered = all.rows.filter(
    (r) => normalizeEmail(r.client_email) === email,
  );
  return json(res, 200, {
    ok: true,
    via: all.via,
    subscriptions: preferUsableFirst(filtered.map(mapSub)),
  });
};

/** Rank so active/approved beat pending/declined (AN-129). */
function preferUsableFirst(subs) {
  const rank = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'active') return 0;
    if (s === 'approved') return 1;
    if (s === 'pending') return 2;
    if (s === 'expired') return 3;
    if (s === 'declined') return 4;
    return 5;
  };
  return [...subs].sort((a, b) => {
    const byRank = rank(a.status) - rank(b.status);
    if (byRank !== 0) return byRank;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
}

async function listViaRpc(name, body) {
  try {
    const rpc = await sbFetch(`/rest/v1/rpc/${name}`, {
      method: 'POST',
      body,
    });
    if (rpc.ok && Array.isArray(rpc.json)) return rpc.json;
  } catch {
    /* ignore */
  }
  return null;
}

async function listTableAll() {
  try {
    const sel = await sbFetch(
      '/rest/v1/subscriptions?select=*&order=created_at.desc',
    );
    if (sel.ok && Array.isArray(sel.json)) {
      return { via: 'table', rows: sel.json };
    }
  } catch {
    /* ignore */
  }
  return { via: 'empty', rows: [] };
}

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
