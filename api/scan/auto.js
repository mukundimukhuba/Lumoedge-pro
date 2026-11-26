const { applyCors, json, readJsonBody } = require('../_lib/cors');
const {
  VISION_ROOT,
  SKIP_REASON,
  applyConservativeGate,
} = require('../_lib/scanGate');

/**
 * POST /api/scan/auto — live MT5 auto scan proxy.
 * Locked body: { symbol, id }. Applies conservative client-equivalent gate.
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
    return json(res, 400, { ok: false, error: 'Invalid JSON body' });
  }

  const symbol = String(body.symbol || '')
    .trim()
    .replace(/\s+/g, '');
  const id = String(body.id || body.token || '').trim();

  if (!symbol) {
    return json(res, 400, { ok: false, error: 'Type the symbol from your broker.' });
  }
  if (!id) {
    return json(res, 400, {
      ok: false,
      skip: true,
      trade: false,
      reason: SKIP_REASON.MT5_REQUIRED,
      error:
        'Connect MetaTrader first. Auto Scan reads the live market on your account.',
    });
  }

  // Exact curl body only.
  const payload = { symbol, id };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);

  try {
    const upstream = await fetch(`${VISION_ROOT}/api/scan/auto`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const raw = await upstream.text();
    let data = {};
    try {
      data = JSON.parse(raw);
    } catch {
      return json(res, 502, {
        ok: false,
        error: 'Auto Scan unavailable. Try again later.',
      });
    }
    if (!upstream.ok) {
      return json(res, upstream.status, {
        ok: false,
        error: String(data.error || data.message || `Auto Scan ${upstream.status}`),
        raw: data,
      });
    }
    const gated = applyConservativeGate({
      ...data,
      symbol: data.symbol || symbol,
    });
    return json(res, 200, gated);
  } catch (err) {
    const aborted = err && err.name === 'AbortError';
    return json(res, 504, {
      ok: false,
      error: aborted
        ? 'Auto Scan timed out.'
        : 'Auto Scan unreachable. Try again later.',
    });
  } finally {
    clearTimeout(timer);
  }
};
