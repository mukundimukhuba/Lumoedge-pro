const { applyCors, json } = require('../_lib/cors');
const { VISION_ROOT, AUTO_TRADE_MIN_ACCURACY } = require('../_lib/scanGate');

/**
 * GET /api/scan/status — proxy vision status + advertise conservative gate.
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

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const upstream = await fetch(`${VISION_ROOT}/api/scan/status`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: ctrl.signal,
    });
    let data = {};
    try {
      data = await upstream.json();
    } catch {
      data = {};
    }
    return json(res, upstream.ok ? 200 : upstream.status, {
      ...data,
      configured: data.configured !== false,
      preferSkip: true,
      minAccuracy: AUTO_TRADE_MIN_ACCURACY,
      source: data.source || 'lumoedge-proxy',
      hint:
        data.hint ||
        `Conservative gate ≥${AUTO_TRADE_MIN_ACCURACY}% — prefer SKIP over bad trades`,
    });
  } catch {
    return json(res, 200, {
      configured: true,
      preferSkip: true,
      minAccuracy: AUTO_TRADE_MIN_ACCURACY,
      source: 'lumoedge-proxy-offline',
      hint: `Vision upstream unreachable; client still prefers SKIP (gate ≥${AUTO_TRADE_MIN_ACCURACY}%)`,
    });
  } finally {
    clearTimeout(timer);
  }
};
