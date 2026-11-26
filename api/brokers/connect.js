const { applyCors, json, readJsonBody } = require('../_lib/cors');
const { connectLiveMt5 } = require('../_lib/mt5Live');

/**
 * POST /api/brokers/connect
 * Body: { broker, server, login, password }
 * Forwards to mt5rest ConnectEx (or legacy lumoedge bridge). Returns live MT5 token as id.
 * Never logs password. Never invents demo balance/trades.
 * Preflights bridge /health so a hung droplet fails fast with a clear error.
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

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { error: 'Invalid JSON body' });
  }

  const broker = String(body.broker || body.name || '').trim();
  const server = String(body.server || '').trim();
  const login = String(body.login || body.account || body.user || '').trim();
  const password = String(body.password || '');

  if (!broker) {
    return json(res, 400, { error: 'broker is required' });
  }
  if (!server || !login) {
    return json(res, 400, {
      error: 'server and login are required',
    });
  }
  if (!password.trim()) {
    return json(res, 400, {
      ok: false,
      error: 'Trading password is required.',
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
      error: result.error || 'MT5 connect failed',
      bridge: result.bridge || undefined,
    });
  }

  const token = result.token;
  return json(res, 200, {
    ok: true,
    broker,
    server,
    login,
    linked: true,
    source: 'mt5-live',
    message: `${broker} linked · live MT5`,
    token,
    id: token,
    sessionId: token,
    // Account is fetched live via /api/brokers/account?id= — never seeded here
    account: null,
  });
}

module.exports = handler;
module.exports.config = { maxDuration: 60 };
