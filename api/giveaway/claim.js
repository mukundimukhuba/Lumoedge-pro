const { applyCors, json, readJsonBody } = require('../_lib/cors');
const { getSupabaseAdmin } = require('../_lib/supabaseAdmin');
const { safeFailPayload } = require('../_lib/safeErrors');
const {
  rateLimitClaim,
  verifyClaimToken,
  issueGiveawayLicense,
  assertGiveawayAccess,
} = require('../_lib/giveaway');

/**
 * POST /api/giveaway/claim
 * Body: { accessToken, claimToken, email, name? }
 * Issues one free Lumo Edge Pro license for a verified RCG MT5 account.
 * Requires the secret invite token. One claim per MT5 login and per email.
 */
async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const limited = rateLimitClaim(req);
  if (!limited.ok) {
    return json(res, limited.status, {
      ok: false,
      error: limited.error,
      code: limited.code,
    });
  }

  const admin = getSupabaseAdmin();
  if (!admin.configured) {
    return json(res, 503, {
      ...safeFailPayload(503, 'supabase admin not configured', { code: 'config' }),
      configured: false,
    });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { ok: false, error: 'Invalid JSON body' });
  }

  const accessGate = assertGiveawayAccess(
    body.accessToken ||
      body.access_token ||
      body.t ||
      req.headers['x-giveaway-token'] ||
      '',
  );
  if (!accessGate.ok) {
    return json(res, accessGate.status, {
      ok: false,
      error: accessGate.error,
      code: accessGate.code,
    });
  }

  const tokenGate = verifyClaimToken(
    body.claimToken || body.claim_token || body.token || '',
  );
  if (!tokenGate.ok) {
    return json(res, 401, {
      ok: false,
      error: tokenGate.error,
      code: tokenGate.code,
      userMessage: tokenGate.error,
    });
  }

  const email = String(body.email || body.clientEmail || '').trim();
  const name = String(body.name || body.clientName || '').trim();

  const issued = await issueGiveawayLicense({
    login: tokenGate.login,
    server: tokenGate.server,
    email,
    name,
  });

  if (!issued.ok) {
    return json(res, issued.status || 400, {
      ok: false,
      error: issued.error,
      code: issued.code,
      userMessage: issued.error,
    });
  }

  return json(res, 200, {
    ok: true,
    alreadyClaimed: Boolean(issued.alreadyClaimed),
    key: issued.key,
    eaName: issued.eaName,
    server: issued.server,
    loginMasked: maskLogin(issued.login),
    instructions: {
      app: 'https://lumoedgepro.vercel.app',
      steps: [
        'Open Lumo Edge Pro on your phone (or the web app).',
        'Enter the email you used for this claim.',
        'Paste your license key on the Activate screen.',
        'Connect your RCG Markets MT5 account in Connect Broker to trade.',
      ],
    },
    message: issued.alreadyClaimed
      ? 'You already claimed this giveaway. Here is your existing license key.'
      : 'Claim successful — free robot + app access unlocked.',
  });
}

function maskLogin(login) {
  const s = String(login || '');
  if (s.length <= 3) return '***';
  return `${'*'.repeat(Math.max(0, s.length - 3))}${s.slice(-3)}`;
}

module.exports = handler;
module.exports.config = { maxDuration: 30 };
