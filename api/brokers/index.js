const { filterBrokers, canUseCustomBroker, BROKERS } = require('../_lib/catalog');
const { applyCors, json } = require('../_lib/cors');
const { brokerApiBase, upstreamSearch } = require('../_lib/upstream');

/**
 * GET /api/brokers?q=&limit=
 * Lists / searches brokers. Uses optional BROKER_API_URL upstream when set;
 * falls back to local catalog.
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
  const q = url.searchParams.get('q') || url.searchParams.get('query') || '';
  const limit = url.searchParams.get('limit') || '12';

  const upstream = await upstreamSearch(q, limit);
  if (upstream && upstream.length) {
    return json(res, 200, {
      brokers: upstream.slice(0, Number(limit) || 12),
      source: 'upstream',
      upstreamConfigured: true,
      allowCustom: canUseCustomBroker(q),
      totalLocal: BROKERS.length,
    });
  }

  const brokers = filterBrokers(q, limit);
  return json(res, 200, {
    brokers,
    source: 'local',
    upstreamConfigured: Boolean(brokerApiBase()),
    allowCustom: canUseCustomBroker(q),
    totalLocal: BROKERS.length,
  });
};
