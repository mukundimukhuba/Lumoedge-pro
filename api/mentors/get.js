const { applyCors, json, readJsonBody } = require('../_lib/cors');
const { getSupabaseAdmin, sbFetch } = require('../_lib/supabaseAdmin');
const { normalizeEmail } = require('../_lib/superAdmin');

/**
 * POST /api/mentors/get  (also GET ?email=)
 * Fetch one mentor_profiles row from shared DB (service role).
 * Used for pending-status refresh and cross-device password verify when
 * the browser has no anon key.
 *
 * Body: { email }
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
      body = { email: u.searchParams.get('email') || '' };
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

  const email = normalizeEmail(body.email);
  if (!email || !email.includes('@')) {
    return json(res, 400, { ok: false, error: 'Valid email required' });
  }

  try {
    const sel = await sbFetch(
      `/rest/v1/mentor_profiles?email=eq.${encodeURIComponent(email)}&select=*&limit=1`,
    );
    if (!sel.ok) {
      return json(res, 502, {
        ok: false,
        error:
          sel.json?.message ||
          sel.text?.slice(0, 200) ||
          'mentor_profiles lookup failed',
      });
    }
    const row = Array.isArray(sel.json) ? sel.json[0] : null;
    if (!row) {
      return json(res, 404, { ok: false, error: 'Mentor not found', mentor: null });
    }
    return json(res, 200, { ok: true, via: 'table', mentor: mapMentor(row) });
  } catch (err) {
    return json(res, 502, {
      ok: false,
      error: String(err?.message || err).slice(0, 200),
    });
  }
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
    passwordHash: row.password_hash
      ? String(row.password_hash)
      : undefined,
  };
}
