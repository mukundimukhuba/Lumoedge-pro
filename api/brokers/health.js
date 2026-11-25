const { applyCors, json } = require('../_lib/cors');
const { probeBridgeHealth, mt5Root } = require('../_lib/mt5Live');

/**
 * GET /api/brokers/health
 * Probes BROKER_API_URL / LUMOEDGE_MT5_URL /health. Never fakes success.
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

  const configured = Boolean(
    (process.env.LUMOEDGE_MT5_URL || process.env.BROKER_API_URL || '').trim(),
  );
  const health = await probeBridgeHealth({ timeoutMs: 4000 });

  // Do not echo the raw host URL (may be private). Only say whether configured.
  return json(res, health.ok ? 200 : 503, {
    ok: health.ok,
    configured,
    reachable: health.reachable === true,
    latencyMs: health.latencyMs,
    path: health.path || undefined,
    detail: health.detail,
    error: health.ok ? undefined : health.error || 'MT5 bridge unhealthy',
    // Soft hint for ops — mode only, never credentials
    mode: /lumoedge\.com/i.test(mt5Root()) ? 'lumoedge-bridge' : 'mt5rest',
  });
};

module.exports.config = { maxDuration: 15 };
