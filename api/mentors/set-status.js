const { applyCors, json, readJsonBody } = require('../_lib/cors');
const { getSupabaseAdmin, sbFetch } = require('../_lib/supabaseAdmin');
const {
  normalizeEmail,
  isSuperAdminEmail,
  SUPER_ADMIN_EMAIL,
} = require('../_lib/superAdmin');

/**
 * POST /api/mentors/set-status
 * Super admin approve / decline / suspend / reactivate (+ key allotment).
 * Body: { actorEmail, email, status, keyAllotment? }
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
  const email = normalizeEmail(body.email || body.targetEmail || body.target_email);
  const status = String(body.status || body.newStatus || '')
    .trim()
    .toLowerCase();
  const hasAllotment =
    body.keyAllotment != null || body.key_allotment != null;
  const keyAllotment = hasAllotment
    ? Math.max(
        0,
        Math.floor(Number(body.keyAllotment ?? body.key_allotment) || 0),
      )
    : null;

  if (!isSuperAdminEmail(actorEmail)) {
    return json(res, 403, {
      ok: false,
      error: `Only the super admin (${SUPER_ADMIN_EMAIL}) can change mentor status.`,
    });
  }
  if (!email || !email.includes('@')) {
    return json(res, 400, { ok: false, error: 'Valid target email required' });
  }
  if (email === SUPER_ADMIN_EMAIL) {
    return json(res, 400, {
      ok: false,
      error: 'Cannot change super admin account status',
    });
  }
  if (!['pending', 'approved', 'declined', 'suspended'].includes(status)) {
    return json(res, 400, { ok: false, error: 'Invalid status' });
  }

  try {
    const rpc = await sbFetch('/rest/v1/rpc/admin_set_mentor_status', {
      method: 'POST',
      body: {
        actor_email: SUPER_ADMIN_EMAIL,
        target_email: email,
        new_status: status,
        new_allotment: keyAllotment,
      },
    });
    if (rpc.ok && rpc.json && rpc.json.email) {
      return json(res, 200, {
        ok: true,
        via: 'rpc',
        mentor: mapMentor(rpc.json),
      });
    }
    if (rpc.status !== 404 && rpc.json?.code !== 'PGRST202') {
      return json(res, 502, {
        ok: false,
        error:
          rpc.json?.message ||
          rpc.text?.slice(0, 200) ||
          'admin_set_mentor_status failed',
      });
    }
  } catch {
    /* table fallback */
  }

  const patch = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (keyAllotment != null) {
    patch.key_allotment = keyAllotment;
  }

  const upd = await sbFetch(
    `/rest/v1/mentor_profiles?email=eq.${encodeURIComponent(email)}`,
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
      mentor: mapMentor(upd.json[0]),
    });
  }

  return json(res, 404, {
    ok: false,
    error:
      upd.json?.message ||
      upd.text?.slice(0, 200) ||
      'Mentor not found in shared database',
  });
};

function mapMentor(row) {
  const statusRaw = String(row.status || 'pending').toLowerCase();
  const status = [
    'pending',
    'approved',
    'declined',
    'demo',
    'suspended',
  ].includes(statusRaw)
    ? statusRaw
    : 'pending';
  const roleRaw = String(row.portal_role || row.role || 'mentor').toLowerCase();
  const role =
    roleRaw === 'super_admin' || roleRaw === 'regular_admin'
      ? roleRaw
      : 'mentor';
  return {
    email: normalizeEmail(row.email),
    mentorName: String(row.mentor_name || row.mentorName || ''),
    name: String(row.name || ''),
    contact: String(row.contact || ''),
    status,
    role,
    keyAllotment: Number(row.key_allotment ?? row.keyAllotment ?? 0) || 0,
    createdAt: String(row.created_at || row.createdAt || ''),
  };
}
