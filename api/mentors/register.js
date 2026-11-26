const { applyCors, json, readJsonBody } = require('../_lib/cors');
const { getSupabaseAdmin, sbFetch } = require('../_lib/supabaseAdmin');
const { normalizeEmail, isSuperAdminEmail } = require('../_lib/superAdmin');

/**
 * POST /api/mentors/register
 * Shared-DB mentor signup (service role). Client must not treat local-only
 * pending as success when this fails.
 *
 * Body: { email, mentorName, name, contact, passwordHash }
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

  const email = normalizeEmail(body.email);
  const mentorName = String(body.mentorName || body.mentor_name || '').trim();
  const name = String(body.name || '').trim();
  const contact = String(body.contact || '').trim();
  const passwordHash = String(
    body.passwordHash || body.password_hash || '',
  ).trim();

  if (!email || !email.includes('@')) {
    return json(res, 400, { ok: false, error: 'Valid email required' });
  }
  if (isSuperAdminEmail(email)) {
    return json(res, 400, {
      ok: false,
      error: 'Cannot register super admin via mentor signup',
    });
  }
  if (!mentorName) {
    return json(res, 400, { ok: false, error: 'Mentor display name required' });
  }
  if (!name) {
    return json(res, 400, { ok: false, error: 'Full name required' });
  }
  if (!contact) {
    return json(res, 400, { ok: false, error: 'Contact required' });
  }
  if (!passwordHash || passwordHash.length < 16) {
    return json(res, 400, { ok: false, error: 'passwordHash required' });
  }

  // Prefer security-definer RPC (preserves approved/demo/suspended on re-register)
  try {
    const rpc = await sbFetch('/rest/v1/rpc/register_mentor_pending', {
      method: 'POST',
      body: {
        p_email: email,
        p_mentor_name: mentorName,
        p_name: name,
        p_contact: contact,
        p_password_hash: passwordHash,
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
          'register_mentor_pending failed',
      });
    }
  } catch (err) {
    if (String(err?.message || '').includes('not configured')) {
      return json(res, 503, { ok: false, error: String(err.message) });
    }
  }

  const now = new Date().toISOString();
  const row = {
    email,
    mentor_name: mentorName,
    name,
    contact,
    password_hash: passwordHash,
    status: 'pending',
    portal_role: 'mentor',
    key_allotment: 0,
    created_at: now,
    updated_at: now,
  };

  // Upsert with portal_role; retry without if column missing
  let ins = await sbFetch('/rest/v1/mentor_profiles?on_conflict=email', {
    method: 'POST',
    body: [row],
    prefer: 'resolution=merge-duplicates,return=representation',
  });
  if (
    !ins.ok &&
    /portal_role/i.test(String(ins.json?.message || ins.text || ''))
  ) {
    const { portal_role: _pr, ...withoutRole } = row;
    ins = await sbFetch('/rest/v1/mentor_profiles?on_conflict=email', {
      method: 'POST',
      body: [withoutRole],
      prefer: 'resolution=merge-duplicates,return=representation',
    });
  }

  if (ins.ok && Array.isArray(ins.json) && ins.json[0]) {
    return json(res, 200, {
      ok: true,
      via: 'table',
      mentor: mapMentor(ins.json[0]),
    });
  }

  return json(res, 502, {
    ok: false,
    error:
      ins.json?.message ||
      ins.text?.slice(0, 200) ||
      'Could not create mentor profile in shared database',
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
    // Hash returned so cross-device login can verify after register.
    passwordHash: row.password_hash
      ? String(row.password_hash)
      : row.passwordHash
        ? String(row.passwordHash)
        : undefined,
  };
}
