const { applyCors, json, readJsonBody } = require('../_lib/cors');
const { connectLiveMt5, fetchLiveAccount } = require('../_lib/mt5Live');
const { assertRcgAccount, normalizeServer } = require('../_lib/rcgAllowlist');
const {
  rateLimitVerify,
  makeClaimToken,
  fingerprintToken,
  findExistingClaim,
  rcgPublicServers,
} = require('../_lib/giveaway');

/**
 * POST /api/giveaway/verify
 * Body: { login, password, server }
 * Connects live MT5 via BROKER_API_URL, confirms RCG (server allowlist /
 * company signal), returns a short-lived claimToken. Never stores password.
 *
 * GET  /api/giveaway/verify → public allowlist servers (no secrets).
 */
async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      servers: rcgPublicServers(),
      broker: 'RCG Markets',
      offer: 'Free robot + free Lumo Edge Pro app access for RCG account holders only',
    });
  }

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const limited = rateLimitVerify(req);
  if (!limited.ok) {
    return json(res, limited.status, {
      ok: false,
      error: limited.error,
      code: limited.code,
    });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { ok: false, error: 'Invalid JSON body' });
  }

  const login = String(body.login || body.account || body.user || '').trim();
  const password = String(body.password || '');
  const server = normalizeServer(body.server || '');

  if (!login) {
    return json(res, 400, { ok: false, error: 'MT5 login is required', code: 'login_required' });
  }
  if (!server) {
    return json(res, 400, { ok: false, error: 'MT5 server is required', code: 'server_required' });
  }
  if (!password.trim()) {
    return json(res, 400, {
      ok: false,
      error: 'Trading password is required (not investor).',
      code: 'password_required',
    });
  }

  // Soft pre-check: allowlisted servers skip the post-connect company path
  // ambiguity. Unknown servers still connect so company_match can accept
  // renamed MetaQuotes names Mukundi has not added to the allowlist yet.
  const result = await connectLiveMt5({
    user: login,
    password,
    server,
  });

  if (!result.ok) {
    return json(res, result.status || 502, {
      ok: false,
      error: result.error || 'Could not verify trading account',
      code: 'connect_failed',
      userMessage: result.error || 'Could not verify trading account',
    });
  }

  // Optional company signal from AccountSummary (when bridge exposes it).
  let company = '';
  try {
    const acct = await fetchLiveAccount(result.token);
    if (acct.ok && acct.account) {
      company = String(
        acct.account.company ||
          acct.account.Company ||
          acct.account.companyName ||
          acct.account.CompanyName ||
          '',
      ).trim();
      // Prefer login from live summary when present
      if (acct.account.login) {
        /* keep form login — both should match */
      }
    }
  } catch {
    /* company optional */
  }

  const gate = assertRcgAccount({ server, company: company || undefined });
  if (!gate.ok) {
    return json(res, 403, {
      ok: false,
      error: gate.reason,
      code: gate.code || 'not_rcg',
      userMessage: gate.reason,
    });
  }

  const claimToken = makeClaimToken({
    login,
    server,
    mt5TokenFingerprint: fingerprintToken(result.token),
  });

  // Soft hint if this login already claimed (still return token so they can
  // re-fetch the same key via claim).
  let alreadyClaimed = false;
  try {
    const hit = await findExistingClaim({ login });
    alreadyClaimed = Boolean(hit?.row?.key);
  } catch {
    alreadyClaimed = false;
  }

  return json(res, 200, {
    ok: true,
    verified: true,
    broker: 'RCG Markets',
    server,
    loginMasked: maskLogin(login),
    claimToken,
    alreadyClaimed,
    reason: gate.reason,
    message: alreadyClaimed
      ? 'RCG account verified. This login already claimed — enter your email to retrieve your key.'
      : 'RCG account verified. Enter your email to claim free robot + app access.',
  });
}

function maskLogin(login) {
  const s = String(login || '');
  if (s.length <= 3) return '***';
  return `${'*'.repeat(Math.max(0, s.length - 3))}${s.slice(-3)}`;
}

module.exports = handler;
module.exports.config = { maxDuration: 60 };
