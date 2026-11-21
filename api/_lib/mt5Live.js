/**
 * Live MT5 via BROKER_API_URL / LUMOEDGE_MT5_URL.
 * - Native mt5rest droplet: GET /ConnectEx, /AccountSummary, …
 * - Legacy lumoedge.com bridge: POST /api/mt5/connect, GET /api/mt5/…
 * Never logs passwords. No mock balances/trades.
 *
 * OpenedOrders: mt5Api returns a raw array (see openedOrders()).
 * mt5rest fields are typically PascalCase (Ticket, Symbol, Lots, Profit, …).
 */

const LUMOEDGE_MT5 = (
  process.env.LUMOEDGE_MT5_URL ||
  process.env.BROKER_API_URL ||
  'https://lumoedge.com'
)
  .trim()
  .replace(/\/+$/, '');

function mt5Root() {
  return LUMOEDGE_MT5;
}

/** Native mt5rest vs lumoedge /api/mt5 bridge. */
function isMt5Rest() {
  const mode = String(process.env.MT5_API_MODE || '').trim().toLowerCase();
  if (mode === 'mt5rest' || mode === 'rest') return true;
  if (mode === 'bridge' || mode === 'lumoedge') return false;
  try {
    const host = new URL(
      /:\/\//.test(LUMOEDGE_MT5) ? LUMOEDGE_MT5 : `http://${LUMOEDGE_MT5}`,
    ).hostname;
    if (/lumoedge\.com$/i.test(host)) return false;
  } catch {
    /* fall through */
  }
  // Any non-lumoedge BROKER_API_URL (e.g. DigitalOcean droplet) → mt5rest.
  return Boolean(
    (process.env.LUMOEDGE_MT5_URL || process.env.BROKER_API_URL || '').trim(),
  );
}

async function readJson(res) {
  const text = (await res.text()).trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractToken(data) {
  if (data == null) return '';
  if (typeof data === 'string') {
    return data.trim().replace(/^"|"$/g, '');
  }
  if (typeof data === 'object') {
    return String(
      data.token || data.id || data.Id || data.Token || '',
    ).trim();
  }
  return '';
}

function extractError(data, status) {
  if (data && typeof data === 'object') {
    return String(data.error || data.message || data.Message || '').trim();
  }
  if (typeof data === 'string' && data.trim()) return data.trim();
  return `Connect failed (${status})`;
}

/**
 * Connect live MT5 → session token.
 * mt5rest: GET /ConnectEx?user&password&server
 * bridge:  POST /api/mt5/connect { user, password, server }
 */
async function connectLiveMt5({ user, password, server }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 22000);
  try {
    let res;
    if (isMt5Rest()) {
      const qs = new URLSearchParams({
        user: String(user).trim(),
        password: String(password),
        server: String(server).trim(),
        connectTimeoutSeconds: '15',
        errorReplyStatusCode: '400',
      });
      res = await fetch(`${mt5Root()}/ConnectEx?${qs.toString()}`, {
        method: 'GET',
        headers: { Accept: 'application/json, text/plain, */*' },
        signal: ctrl.signal,
      });
    } else {
      res = await fetch(`${mt5Root()}/api/mt5/connect`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user: String(user).trim(),
          password: String(password),
          server: String(server).trim(),
        }),
        signal: ctrl.signal,
      });
    }
    const data = await readJson(res);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: extractError(data, res.status),
      };
    }
    const token = extractToken(data);
    if (!token || /error|fail|invalid/i.test(token)) {
      return {
        ok: false,
        status: 502,
        error: token || extractError(data, res.status) || 'No session token returned',
      };
    }
    return { ok: true, token };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error:
        err instanceof Error
          ? `MT5 bridge unreachable: ${err.message}`
          : 'MT5 bridge unreachable',
    };
  } finally {
    clearTimeout(t);
  }
}

async function mt5Get(pathWithQuery) {
  const prefix = isMt5Rest() ? '' : '/api/mt5';
  const url = `${mt5Root()}${prefix}${pathWithQuery}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json, text/plain, */*' },
      signal: ctrl.signal,
    });
    const data = await readJson(res);
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      data: {
        error:
          err instanceof Error
            ? `MT5 unreachable: ${err.message}`
            : 'MT5 unreachable',
      },
    };
  } finally {
    clearTimeout(t);
  }
}

function num(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pick(raw, keys) {
  for (const k of keys) {
    if (raw[k] != null && raw[k] !== '') return raw[k];
  }
  return undefined;
}

/**
 * Map one OpenedOrders row. Keep rows that have a ticket even if Symbol is odd —
 * never silently drop live positions.
 */
function mapOrder(raw, i = 0) {
  if (!raw || typeof raw !== 'object') return null;

  const id = String(
    pick(raw, [
      'Ticket',
      'ticket',
      'Order',
      'order',
      'Position',
      'position',
      'Deal',
      'deal',
      'id',
      'Id',
    ]) ?? `ord_${i}`,
  );

  let symbol = String(
    pick(raw, [
      'Symbol',
      'symbol',
      'Instrument',
      'instrument',
      'Name',
      'name',
      'currency',
      'Currency',
    ]) ?? '',
  ).trim();
  if (!symbol) symbol = id.startsWith('ord_') ? '' : `#${id}`;
  if (!symbol) return null;

  const typeVal = pick(raw, [
    'Type',
    'type',
    'OrderType',
    'orderType',
    'Side',
    'side',
    'Cmd',
    'cmd',
    'Action',
    'action',
  ]);
  const typeRaw = String(typeVal ?? '').toLowerCase();
  let side = 'Buy';
  if (
    typeRaw === '1' ||
    typeRaw === 'sell' ||
    typeRaw.includes('sell') ||
    typeRaw === 'op_sell'
  ) {
    side = 'Sell';
  } else if (
    typeRaw === '0' ||
    typeRaw === 'buy' ||
    typeRaw.includes('buy') ||
    typeRaw === 'op_buy'
  ) {
    side = 'Buy';
  } else if (typeof typeVal === 'number') {
    side = typeVal === 1 ? 'Sell' : 'Buy';
  }

  let lots = num(
    pick(raw, ['Lots', 'lots', 'VolumeLots', 'volumeLots', 'Lot', 'lot']),
    null,
  );
  if (lots == null) {
    const vol = num(
      pick(raw, ['Volume', 'volume', 'LotsVolume', 'vol']),
      null,
    );
    if (vol != null) {
      // Integer volumes ≥1 are often lots×100 (0.01 lot → 1)
      lots = Number.isInteger(vol) && vol >= 1 ? vol / 100 : vol;
    } else {
      lots = 0;
    }
  }

  const openPrice = num(
    pick(raw, [
      'OpenPrice',
      'openPrice',
      'PriceOpen',
      'priceOpen',
      'Price',
      'price',
      'Open',
      'open',
    ]),
    0,
  );

  const pnl = num(
    pick(raw, [
      'Profit',
      'profit',
      'ProfitOpen',
      'profitOpen',
      'PnL',
      'pnl',
      'Floating',
      'floating',
      'Unrealized',
      'unrealized',
    ]),
    0,
  );

  return { id, symbol, side, lots, openPrice, pnl };
}

function extractOrdersList(data) {
  // mt5Api: Array.isArray(n) ? n : []
  if (Array.isArray(data)) return data;
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return extractOrdersList(parsed);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== 'object') return null;
  // Error payload from bridge
  if (data.code || data.message || data.error) return null;
  const list =
    data.orders ||
    data.Orders ||
    data.positions ||
    data.Positions ||
    data.OpenedOrders ||
    data.openedOrders ||
    data.items ||
    data.data ||
    data.result ||
    null;
  return Array.isArray(list) ? list : null;
}

/**
 * Live account snapshot for token `id`.
 * Returns null fields when MT5 fails — never invents balances/trades.
 */
async function fetchLiveAccount(id) {
  const token = String(id || '').trim();
  if (!token) {
    return { ok: false, status: 400, error: 'id (MT5 token) is required' };
  }

  const summaryRes = await mt5Get(
    `/AccountSummary?id=${encodeURIComponent(token)}`,
  );
  if (!summaryRes.ok) {
    const err =
      (summaryRes.data &&
        typeof summaryRes.data === 'object' &&
        (summaryRes.data.error ||
          summaryRes.data.message ||
          summaryRes.data.code)) ||
      (typeof summaryRes.data === 'string' ? summaryRes.data : '') ||
      'AccountSummary failed';
    return { ok: false, status: summaryRes.status || 502, error: String(err) };
  }

  const s =
    summaryRes.data && typeof summaryRes.data === 'object'
      ? summaryRes.data
      : {};

  const currency = String(
    s.Currency || s.currency || s.AccountCurrency || s.accountCurrency || '',
  ).trim();
  const balance = num(s.Balance ?? s.balance, null);
  const equity = num(s.Equity ?? s.equity, null);
  const margin = num(s.Margin ?? s.margin, null);
  const freeMargin = num(
    s.FreeMargin ?? s.freeMargin ?? s.MarginFree ?? s.marginFree,
    null,
  );
  const leverage = num(s.Leverage ?? s.leverage, null);
  const login = String(s.Login ?? s.login ?? s.Account ?? s.account ?? '').trim();

  if (balance == null && equity == null) {
    return {
      ok: false,
      status: 502,
      error: 'AccountSummary returned no balance/equity',
    };
  }

  let trades = [];
  let ordersOk = false;
  const ordersRes = await mt5Get(
    `/OpenedOrders?id=${encodeURIComponent(token)}`,
  );
  if (ordersRes.ok) {
    const list = extractOrdersList(ordersRes.data);
    if (list) {
      ordersOk = true;
      trades = list.map(mapOrder).filter(Boolean);
    } else if (ordersRes.data == null) {
      ordersOk = true;
      trades = [];
    } else if (
      typeof ordersRes.data === 'object' &&
      !Array.isArray(ordersRes.data) &&
      !ordersRes.data.code &&
      !ordersRes.data.message &&
      !ordersRes.data.error &&
      Object.keys(ordersRes.data).length === 0
    ) {
      ordersOk = true;
      trades = [];
    }
  }

  const bal = balance ?? equity ?? 0;
  const eq = equity ?? balance ?? 0;

  return {
    ok: true,
    account: {
      id: token,
      sessionId: token,
      login: login || undefined,
      currency: currency || undefined,
      balance: bal,
      equity: eq,
      margin: margin ?? undefined,
      freeMargin: freeMargin ?? undefined,
      leverage: leverage ?? undefined,
      trades,
      ordersOk,
      updatedAt: new Date().toISOString(),
      source: 'mt5-live',
    },
  };
}

/**
 * Live OrderSend — GET /api/mt5/OrderSend?id&symbol&operation&volume…
 * operation: 0 = buy, 1 = sell (mt5rest).
 * Surfaces bridge error/title/message to the client.
 */
async function sendLiveOrder({
  id,
  symbol,
  operation,
  volume,
  stopLoss,
  takeProfit,
  comment,
  slippage,
}) {
  const token = String(id || '').trim();
  const sym = String(symbol || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
  const op = Number(operation);
  const vol = Number(volume);
  if (!token) {
    return { ok: false, status: 400, error: 'id (MT5 token) is required' };
  }
  if (!sym) {
    return { ok: false, status: 400, error: 'symbol is required' };
  }
  if (!(op === 0 || op === 1)) {
    return {
      ok: false,
      status: 400,
      error: 'operation must be 0 (buy) or 1 (sell)',
    };
  }
  if (!Number.isFinite(vol) || vol <= 0) {
    return { ok: false, status: 400, error: 'volume (lot size) must be > 0' };
  }

  const qs = new URLSearchParams();
  qs.set('id', token);
  qs.set('symbol', sym);
  qs.set('operation', String(op));
  qs.set('volume', String(vol));
  if (comment != null && String(comment).trim()) {
    qs.set('comment', String(comment).trim().slice(0, 31));
  }
  if (slippage != null && Number.isFinite(Number(slippage))) {
    qs.set('slippage', String(Number(slippage)));
  }
  const sl = Number(stopLoss);
  if (Number.isFinite(sl) && sl > 0) qs.set('stoploss', String(sl));
  const tp = Number(takeProfit);
  if (Number.isFinite(tp) && tp > 0) qs.set('takeprofit', String(tp));

  const res = await mt5Get(`/OrderSend?${qs.toString()}`);
  if (!res.ok) {
    const d = res.data;
    let err = '';
    if (typeof d === 'string') err = d;
    else if (d && typeof d === 'object') {
      err = String(
        d.title || d.error || d.message || d.code || d.Message || '',
      ).trim();
    }
    return {
      ok: false,
      status: res.status || 502,
      error: err || `OrderSend failed (${res.status || 'bridge'})`,
      raw: d,
    };
  }

  // Some bridges return HTTP 200 with an error payload
  const d = res.data;
  if (d && typeof d === 'object') {
    const code = d.code ?? d.Code ?? d.errorCode;
    const msg = String(
      d.title || d.error || d.message || d.Message || '',
    ).trim();
    if (
      (typeof code === 'number' && code !== 0 && code !== 10009) ||
      (typeof code === 'string' &&
        code &&
        code !== '0' &&
        !/ok|success|done/i.test(code)) ||
      /reject|fail|invalid|error|denied|not enough|trade context/i.test(msg)
    ) {
      return {
        ok: false,
        status: 422,
        error: msg || `Order rejected (code ${code})`,
        raw: d,
      };
    }
  }

  return { ok: true, status: res.status || 200, result: d };
}

module.exports = {
  connectLiveMt5,
  fetchLiveAccount,
  sendLiveOrder,
  mt5Root,
  mapOrder,
  extractOrdersList,
};
