const { applyCors, json, readJsonBody } = require('../lib/cors');
const { connectLiveMt5, fetchLiveAccount } = require('../lib/mt5Live');
const { assertRcgAccount, normalizeServer } = require('../lib/rcgAllowlist');
const {
  rateLimitVerify,
  makeClaimToken,
  fingerprintToken,
  findExistingClaim,
  issueGiveawayLicense,
  rcgPublicServers,
  assertGiveawayAccess,
  GIVEAWAY_EA_NAME,
} = require('../lib/giveaway');

/**
 * POST /api/giveaway/verify
 * Body: { accessToken, login, password, server, email, name? }
 * Verifies RCG MT5, then auto-issues Unlimited Bull license key (no mentor step).
 *
 * GET /api/giveaway/verify?t=<accessToken> → server list for the invite page.
 */
async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method === 'GET') {
    const url = new URL(req.url || '/', 'http://localhost');
    const gate = assertGiveawayAccess(
      url.searchParams.get('t') ||
        url.searchParams.get('accessToken') ||
        req.headers['x-giveaway-token'] ||
        '',
    );
    if (!gate.ok) {
      return json(res, gate.status, {
        ok: false,
        error: gate.error,
        code: gate.code,
      });
    }
    return json(res, 200, {
      ok: true,
      servers: rcgPublicServers(),
      broker: 'RCG Markets',
      eaName: GIVEAWAY_EA_NAME(),
      offer:
        'Free UNLIMITED BULL robot + free Lumo Edge Pro app access for RCG account holders only',
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

  const login = String(body.login || body.account || body.user || '').trim();
  const password = String(body.password || '');
  const server = normalizeServer(body.server || '');
  const email = String(body.email || body.clientEmail || '').trim();
  const name = String(body.name || body.clientName || '').trim();

  if (!login) {
    return json(res, 400, {
      ok: false,
      error: 'MT5 login is required',
      code: 'login_required',
    });
  }
  if (!server) {
    return json(res, 400, {
      ok: false,
      error: 'MT5 server is required',
      code: 'server_required',
    });
  }
  if (!password.trim()) {
    return json(res, 400, {
      ok: false,
      error: 'Trading password is required (not investor).',
      code: 'password_required',
    });
  }
  if (!email || !email.includes('@')) {
    return json(res, 400, {
      ok: false,
      error: 'Email is required so we can issue your Unlimited Bull license key.',
      code: 'email_required',
    });
  }

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

  // Auto-issue Unlimited Bull key immediately after RCG verify (no mentor step).
  const issued = await issueGiveawayLicense({
    login,
    server,
    email,
    name,
  });

  if (!issued.ok) {
    // Still return claimToken so a retry via /claim can recover.
    return json(res, issued.status || 400, {
      ok: false,
      verified: true,
      claimToken,
      error: issued.error,
      code: issued.code,
      userMessage: issued.error,
    });
  }

  let alreadyClaimed = Boolean(issued.alreadyClaimed);
  if (!alreadyClaimed) {
    try {
      const hit = await findExistingClaim({ login, email });
      alreadyClaimed = Boolean(hit?.row?.key) && hit.row.key === issued.key;
    } catch {
      /* ignore */
    }
  }

  return json(res, 200, {
    ok: true,
    verified: true,
    broker: 'RCG Markets',
    server,
    loginMasked: maskLogin(login),
    claimToken,
    alreadyClaimed,
    key: issued.key,
    eaName: issued.eaName,
    reason: gate.reason,
    instructions: {
      app: 'https://lumoedgepro.vercel.app',
      steps: [
        'Open Lumo Edge Pro on your phone (or the web app).',
        'Enter the email you used for this claim.',
        'Paste your license key on the Activate screen.',
        'Connect your RCG Markets MT5 account in Connect Broker to trade.',
      ],
    },
    message: alreadyClaimed
      ? `RCG verified — here is your existing ${issued.eaName} license key.`
      : `RCG verified — your ${issued.eaName} license key is ready.`,
  });
}

function maskLogin(login) {
  const s = String(login || '');
  if (s.length <= 3) return '***';
  return `${'*'.repeat(Math.max(0, s.length - 3))}${s.slice(-3)}`;
}

module.exports = handler;
module.exports.config = { maxDuration: 60 };
