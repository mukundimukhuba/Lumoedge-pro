const { applyCors, json } = require('../_lib/cors');
const { fetchLiveSymbols } = require('../_lib/mt5Live');

/**
 * GET /api/brokers/symbols?id=MT5_TOKEN&q=&limit=
 * Live symbols for the connected broker session (mt5rest SymbolList /
 * SymbolParamsMany). Never returns a fabricated broker catalog.
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
  const q = url.searchParams.get('q') || url.searchParams.get('query') || '';
  const limit = url.searchParams.get('limit') || '48';

  if (!String(id).trim()) {
    return json(res, 400, { error: 'id (MT5 connect token) is required' });
  }

  const result = await fetchLiveSymbols(id, { q, limit });
  if (!result.ok) {
    return json(res, result.status || 502, {
      error: result.error || 'Live symbols unavailable',
      symbols: [],
    });
  }

  return json(res, 200, {
    ok: true,
    symbols: result.symbols,
    total: result.total,
    source: result.source || 'mt5-live',
    q: String(q || '').trim(),
  });
};
