const { applyCors, json } = require('./_lib/cors');
const { publicCaptchaConfig } = require('./_lib/humanChallenge');

/**
 * Public client config for Expo web when build-time `extra` omitted the anon key.
 * Returns only the project URL + anon/publishable key (safe to expose).
 * Never returns the service role.
 */
function normalizeSupabaseUrl(raw) {
  let url = String(raw || '')
    .trim()
    .replace(/\/+$/, '');
  if (!url) return '';
  url = url.replace(/\/rest\/v1$/i, '').replace(/\/rest$/i, '');
  return url.replace(/\/+$/, '');
}

function readAnonKey() {
  return (
    process.env.SUPABASE_ANON_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  ).trim();
}

function readServiceRoleConfigured() {
  return Boolean(
    (
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.supabase ||
      ''
    ).trim(),
  );
}

module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const supabaseUrl = normalizeSupabaseUrl(
    process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '',
  );
  const supabaseAnonKey = readAnonKey();
  const serviceRoleConfigured = Boolean(
    supabaseUrl && readServiceRoleConfigured(),
  );

  return json(res, 200, {
    ok: true,
    supabaseUrl: supabaseUrl || null,
    supabaseAnonKey: supabaseAnonKey || null,
    configured: Boolean(supabaseUrl && supabaseAnonKey),
    // Mentor register/list/approve use /api/mentors/* with service role when
    // the browser anon key is missing (common on Vercel).
    mentorApiConfigured: serviceRoleConfigured,
    captcha: publicCaptchaConfig(),
  });
};
