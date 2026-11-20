const { applyCors, json, readJsonBody } = require('../_lib/cors');
const { brokerApiBase, upstreamConnect } = require('../_lib/upstream');

/**
 * POST /api/brokers/connect
 * Body: { broker, server, login, password }
 * Never logs password. Forwards to BROKER_API_URL when configured;
 * otherwise returns a local demo-linked success (credentials not stored).
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

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { error: 'Invalid JSON body' });
  }

  const broker = String(body.broker || body.name || '').trim();
  const server = String(body.server || '').trim();
  const login = String(body.login || body.account || '').trim();
  const password = String(body.password || '');

  if (!broker) {
    return json(res, 400, { error: 'broker is required' });
  }
  if (!server || !login || !password) {
    return json(res, 400, {
      error: 'server, login, and password are required',
    });
  }

  const upstreamConfigured = Boolean(brokerApiBase());
  if (upstreamConfigured) {
    const result = await upstreamConnect({
      broker,
      server,
      login,
      password,
    });
    if (!result) {
      return json(res, 502, { error: 'Upstream broker API unavailable' });
    }
    if (!result.ok) {
      return json(res, result.status || 502, {
        error:
          result.data?.error ||
          result.data?.message ||
          'Broker connect failed upstream',
        upstream: true,
      });
    }
    return json(res, 200, {
      ok: true,
      broker,
      server,
      login,
      linked: true,
      source: 'upstream',
      message: result.data?.message || `${broker} linked via broker API`,
      // never echo password
    });
  }

  // Local demo path — accept shape, do not persist credentials.
  return json(res, 200, {
    ok: true,
    broker,
    server,
    login,
    linked: true,
    source: 'local-demo',
    message: `${broker} linked · demo session ready (no live upstream)`,
  });
};
