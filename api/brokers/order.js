const { applyCors, json, readJsonBody } = require('../_lib/cors');
const { sendLiveOrder } = require('../_lib/mt5Live');

/**
 * POST /api/brokers/order
 * Body: { id, symbol, operation, volume, stopLoss?, takeProfit?, comment?, slippage? }
 * Forwards to lumoedge.com /api/mt5/OrderSend.
 * Returns clear { error } from the bridge on failure — never invents fills.
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

  const id = String(body.id || body.token || body.sessionId || '').trim();
  const symbol = String(body.symbol || '').trim();
  const operation = body.operation;
  const volume = body.volume ?? body.lotSize ?? body.lots;
  const stopLoss = body.stopLoss ?? body.stoploss ?? body.sl;
  const takeProfit = body.takeProfit ?? body.takeprofit ?? body.tp;
  const comment = body.comment;
  const slippage = body.slippage;

  const result = await sendLiveOrder({
    id,
    symbol,
    operation,
    volume,
    stopLoss,
    takeProfit,
    comment,
    slippage,
  });

  if (!result.ok) {
    return json(res, result.status || 502, {
      ok: false,
      error: result.error || 'OrderSend failed',
    });
  }

  return json(res, 200, {
    ok: true,
    symbol,
    operation: Number(operation),
    volume: Number(volume),
    result: result.result,
  });
};
