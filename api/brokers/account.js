const { applyCors, json } = require('../_lib/cors');
const { fetchLiveAccount } = require('../_lib/mt5Live');

/**
 * GET /api/brokers/account?id=MT5_TOKEN
 * Also accepts ?sessionId= for compatibility (same token).
 * Live AccountSummary + OpenedOrders only — no mock data.
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
  const id =
    url.searchParams.get('id') ||
    url.searchParams.get('sessionId') ||
    url.searchParams.get('token') ||
    '';

  if (!String(id).trim()) {
    return json(res, 400, { error: 'id (MT5 connect token) is required' });
  }

  const result = await fetchLiveAccount(id);
  if (!result.ok) {
    return json(res, result.status || 502, {
      error: result.error || 'Live account unavailable',
    });
  }

  return json(res, 200, result.account);
};
