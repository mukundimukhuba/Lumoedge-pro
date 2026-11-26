const { applyCors, json, readJsonBody } = require('../_lib/cors');
const { getSupabaseAdmin, sbFetch } = require('../_lib/supabaseAdmin');
const {
  normalizeEmail,
  isSuperAdminEmail,
} = require('../_lib/superAdmin');

/**
 * POST /api/mentors/list
 * Shared-DB mentor list for Super Admin Pending / All.
 * Body: { actorEmail } — must be super admin.
 * Optional GET ?actorEmail=
 *
 * Never merges device cache — service-role table is source of truth.
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
      body = { actorEmail: u.searchParams.get('actorEmail') || '' };
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
  if (!isSuperAdminEmail(actorEmail)) {
    return json(res, 403, {
      ok: false,
      error: 'Only super admin can list all mentor profiles',
    });
  }

  try {
    const sel = await sbFetch(
      '/rest/v1/mentor_profiles?select=*&order=created_at.desc',
    );
    if (sel.ok && Array.isArray(sel.json)) {
      return json(res, 200, {
        ok: true,
        via: 'table',
        mentors: sel.json.map(mapMentor),
        pendingCount: sel.json.filter(
          (r) => String(r.status || '').toLowerCase() === 'pending',
        ).length,
      });
    }
    return json(res, 502, {
      ok: false,
      error:
        sel.json?.message ||
        sel.text?.slice(0, 200) ||
        'Could not list mentor_profiles',
    });
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
    // Omit password hashes from admin list payloads.
  };
}
