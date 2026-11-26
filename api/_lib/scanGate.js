/**
 * Conservative scan / auto-trade gates (server mirror of mobile/src/scan/strategy).
 * Prefer SKIP over a bad trade. Never invent prices.
 */

const AUTO_TRADE_MIN_ACCURACY = 85;
const SCAN_SIGNAL_MIN_ACCURACY = 70;
const MAX_STOP_PCT = 0.08;
const MIN_STOP_PCT = 0.00015;

const SKIP_REASON = {
  NO_DIRECTION: 'SKIP: no clear BUY/SELL — prefer no trade',
  LOW_ACCURACY: 'SKIP: confidence below gate — prefer no trade',
  NO_PRICES: 'SKIP: no live entry/SL prices — will not invent levels',
  INVALID_PRICES: 'SKIP: entry/SL invalid for side',
  STOP_TOO_WIDE: 'SKIP: stop distance too wide',
  STOP_TOO_TIGHT: 'SKIP: stop distance too tight / noise',
  DEMO_SIGNAL: 'SKIP: demo / synthetic signal — live MT5 required',
  MT5_REQUIRED: 'SKIP: MetaTrader not connected — live data required',
  BOUNCE_AGAINST: 'SKIP: bounce against session — prefer no trade',
  FLAT_SESSION: 'SKIP: flat session — no trade',
  REVERSE_SESSION: 'SKIP: last bars reverse session — no trade',
  API_UNCLEAR: 'SKIP: scanner unclear / low conviction',
};

const VISION_ROOT = 'https://lumoedge.com';

function parseSide(raw) {
  const s = String(raw || '').toLowerCase();
  if (s.includes('sell')) return 'sell';
  if (s.includes('buy')) return 'buy';
  return null;
}

function explainPrices(side, entry, stopLoss) {
  if (
    entry == null ||
    stopLoss == null ||
    !Number.isFinite(entry) ||
    !Number.isFinite(stopLoss) ||
    entry <= 0 ||
    stopLoss <= 0 ||
    entry === stopLoss
  ) {
    return { ok: false, reason: SKIP_REASON.NO_PRICES };
  }
  const pct = Math.abs(entry - stopLoss) / entry;
  if (pct >= MAX_STOP_PCT) return { ok: false, reason: SKIP_REASON.STOP_TOO_WIDE };
  if (pct < MIN_STOP_PCT) return { ok: false, reason: SKIP_REASON.STOP_TOO_TIGHT };
  if (side === 'buy' && !(stopLoss < entry)) {
    return { ok: false, reason: SKIP_REASON.INVALID_PRICES };
  }
  if (side === 'sell' && !(stopLoss > entry)) {
    return { ok: false, reason: SKIP_REASON.INVALID_PRICES };
  }
  return { ok: true };
}

/**
 * Tighten a vision / auto-scan JSON body before returning to the client.
 */
function applyConservativeGate(data) {
  if (!data || typeof data !== 'object') {
    return {
      ok: false,
      skip: true,
      trade: false,
      accuracy: 0,
      reason: SKIP_REASON.API_UNCLEAR,
      error: 'Empty scan response',
    };
  }

  const out = { ...data };
  const accuracy = Math.round(Number(out.accuracy ?? out.accuracy_percent) || 0);
  out.accuracy = accuracy;
  const side = parseSide(out.direction || out.side);
  const entry = Number(out.entryPrice ?? out.entry_price);
  const stop = Number(out.stopLoss ?? out.stop_loss);
  const entryPrice = Number.isFinite(entry) && entry > 0 ? entry : null;
  const stopLoss = Number.isFinite(stop) && stop > 0 ? stop : null;
  out.entryPrice = entryPrice;
  out.stopLoss = stopLoss;

  if (out.demo) {
    out.ok = true;
    out.skip = true;
    out.trade = false;
    out.direction = undefined;
    out.reason = SKIP_REASON.DEMO_SIGNAL;
    return out;
  }

  if (out.skip || out.noTrade || out.trade === false) {
    out.skip = true;
    out.trade = false;
    out.reason = out.reason || SKIP_REASON.API_UNCLEAR;
    return out;
  }

  if (!side) {
    out.skip = true;
    out.trade = false;
    out.reason = SKIP_REASON.NO_DIRECTION;
    return out;
  }

  if (accuracy > 0 && accuracy < SCAN_SIGNAL_MIN_ACCURACY) {
    out.skip = true;
    out.trade = false;
    out.direction = undefined;
    out.reason = `${SKIP_REASON.LOW_ACCURACY} (${accuracy}% < ${SCAN_SIGNAL_MIN_ACCURACY}%)`;
    return out;
  }

  if (accuracy < AUTO_TRADE_MIN_ACCURACY) {
    out.skip = true;
    out.trade = false;
    out.reason = `${SKIP_REASON.LOW_ACCURACY} (${accuracy}% < ${AUTO_TRADE_MIN_ACCURACY}%)`;
    return out;
  }

  const prices = explainPrices(side, entryPrice, stopLoss);
  if (!prices.ok) {
    out.skip = true;
    out.trade = false;
    out.reason = prices.reason;
    return out;
  }

  out.direction = side;
  out.trade = true;
  out.skip = false;
  out.ok = out.ok !== false;
  return out;
}

function buildConservativeScanBody(body) {
  const image = String(body.image || '').split('#')[0];
  const id = String(body.id || body.token || body.mt5Id || '').trim();
  const payload = {
    image,
    strategy: 'right-edge-conservative',
    candles: 8,
    preferSkip: true,
    noGuess: true,
    minAccuracy: AUTO_TRADE_MIN_ACCURACY,
    instructions:
      'Right-edge only (last 5–8 candles). If unclear, return skip/no direction — never invent prices or bias. Prefer SKIP over a weak trade. Use live MT5 quotes when id is present.',
  };
  if (id) {
    payload.id = id;
    payload.liveMt5 = true;
  }
  return payload;
}

module.exports = {
  AUTO_TRADE_MIN_ACCURACY,
  SCAN_SIGNAL_MIN_ACCURACY,
  SKIP_REASON,
  VISION_ROOT,
  applyConservativeGate,
  buildConservativeScanBody,
  parseSide,
  explainPrices,
};
