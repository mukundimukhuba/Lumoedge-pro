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
    (process.env.BROKER_API_URL || process.env.LUMOEDGE_MT5_URL || '').trim(),
  );
  const health = await probeBridgeHealth({ timeoutMs: 8000 });

  // Hostname only (no credentials). Lets ops confirm Production is not still
  // pinned to a hung IP after BROKER_API_URL was updated.
  return json(res, health.ok ? 200 : 503, {
    ok: health.ok,
    configured,
    reachable: health.reachable === true,
    latencyMs: health.latencyMs,
    path: health.path || undefined,
    detail: health.detail,
    error: health.ok ? undefined : health.error || 'MT5 bridge unhealthy',
    upstreamHost: health.upstreamHost || undefined,
    sourceEnv: health.sourceEnv || undefined,
    envConflict: health.envConflict === true ? true : undefined,
    // Soft hint for ops — mode only, never credentials
    mode: /lumoedge\.com/i.test(mt5Root()) ? 'lumoedge-bridge' : 'mt5rest',
  });
};

module.exports.config = { maxDuration: 15 };
