/**
 * Live MT5 via https://lumoedge.com/api/mt5* (droplet bridge).
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

async function readJson(res) {
  const text = (await res.text()).trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * POST /api/mt5/connect → { token }
 * Body: { user, password, server }
 */
async function connectLiveMt5({ user, password, server }) {
  const url = `${mt5Root()}/api/mt5/connect`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 22000);
  try {
    const res = await fetch(url, {
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
    const data = await readJson(res);
    if (!res.ok) {
      const err =
        (data && typeof data === 'object' && (data.error || data.message)) ||
        (typeof data === 'string' ? data : '') ||
        `Connect failed (${res.status})`;
      return { ok: false, status: res.status, error: String(err) };
    }
    const token =
      data && typeof data === 'object'
        ? String(data.token || data.id || '').trim()
        : typeof data === 'string'
          ? data.trim().replace(/^"|"$/g, '')
          : '';
    if (!token || /error|fail|invalid/i.test(token)) {
      return { ok: false, status: 502, error: token || 'No session token returned' };
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
  const url = `${mt5Root()}/api/mt5${pathWithQuery}`;
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

module.exports = {
  connectLiveMt5,
  fetchLiveAccount,
  mt5Root,
  mapOrder,
  extractOrdersList,
};
