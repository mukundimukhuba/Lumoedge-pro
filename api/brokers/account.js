const { applyCors, json } = require('../_lib/cors');
const { brokerApiBase } = require('../_lib/upstream');
const { getSession, publicAccount } = require('../_lib/sessions');

/**
 * GET /api/brokers/account?sessionId=
 * Real-time-ish balance / equity / open trades for a linked session.
 */
module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const url = new URL(req.url || '/', 'http://localhost');
  const sessionId = url.searchParams.get('sessionId') || '';

  if (!sessionId) {
    return json(res, 400, { error: 'sessionId is required' });
  }

  // Optional upstream account poll
  const base = brokerApiBase();
  if (base && sessionId.startsWith('up_')) {
    try {
      const u = new URL('/brokers/account', `${base}/`);
      u.searchParams.set('sessionId', sessionId.slice(3));
      const r = await fetch(u.toString(), {
        headers: { Accept: 'application/json' },
      });
      const data = await r.json();
      if (!r.ok) {
        return json(res, r.status, {
          error: data.error || 'Upstream account failed',
        });
      }
      return json(res, 200, { ...data, source: 'upstream' });
    } catch {
      return json(res, 502, { error: 'Upstream account unreachable' });
    }
  }

  const session = getSession(sessionId);
  if (!session) {
    return json(res, 404, { error: 'Session not found' });
  }
  return json(res, 200, {
    ...publicAccount(session),
    source: 'local-demo',
  });
};
