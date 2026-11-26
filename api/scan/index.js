const { applyCors, json, readJsonBody } = require('../_lib/cors');
const {
  VISION_ROOT,
  applyConservativeGate,
  buildConservativeScanBody,
} = require('../_lib/scanGate');

/**
 * POST /api/scan — proxy to lumoedge.com vision with conservative payload + gate.
 * Body: { image, id? }. Never invents prices; prefers SKIP.
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
    return json(res, 400, { ok: false, accuracy: 0, error: 'Invalid JSON body' });
  }

  const image = String(body.image || '').split('#')[0];
  if (!image.startsWith('data:image/')) {
    return json(res, 400, {
      ok: false,
      accuracy: 0,
      error: 'image data URL required',
    });
  }

  const payload = buildConservativeScanBody(body);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 55_000);

  try {
    const upstream = await fetch(`${VISION_ROOT}/api/scan`, {
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
        accuracy: 0,
        error: 'Scanner unavailable. Please try again later.',
      });
    }
    if (!upstream.ok) {
      return json(res, upstream.status, {
        ok: false,
        accuracy: Number(data.accuracy) || 0,
        error:
          String(data.error || '').trim() ||
          `Scanner unavailable (${upstream.status}).`,
      });
    }
    const gated = applyConservativeGate(data);
    return json(res, 200, gated);
  } catch (err) {
    const aborted = err && err.name === 'AbortError';
    return json(res, 504, {
      ok: false,
      accuracy: 0,
      error: aborted
        ? 'Scan timed out — try a clearer chart screenshot.'
        : 'Scanner unavailable. Please try again later.',
    });
  } finally {
    clearTimeout(timer);
  }
};
