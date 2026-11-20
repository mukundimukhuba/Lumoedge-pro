/**
 * Live MT5 via https://lumoedge.com/api/mt5* (droplet bridge).
 * Never logs passwords. No mock balances/trades.
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

function mapOrder(raw, i = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const symbol = String(
    raw.Symbol || raw.symbol || raw.Instrument || raw.instrument || '',
  ).trim();
  if (!symbol) return null;
  const typeRaw = String(
    raw.Type || raw.type || raw.OrderType || raw.orderType || raw.Side || raw.side || '',
  ).toLowerCase();
  const side = typeRaw.includes('sell')
    ? 'Sell'
    : typeRaw.includes('buy')
      ? 'Buy'
      : typeRaw
        ? typeRaw
        : 'Buy';
  const lots = num(
    raw.Lots ?? raw.lots ?? raw.Volume ?? raw.volume ?? raw.LotsVolume,
    0,
  );
  const openPrice = num(
    raw.OpenPrice ??
      raw.openPrice ??
      raw.PriceOpen ??
      raw.priceOpen ??
      raw.Price ??
      raw.price,
    0,
  );
  const pnl = num(
    raw.Profit ?? raw.profit ?? raw.PnL ?? raw.pnl ?? raw.Floating ?? raw.floating,
    0,
  );
  const id = String(
    raw.Ticket ?? raw.ticket ?? raw.Order ?? raw.order ?? raw.id ?? `ord_${i}`,
  );
  return { id, symbol, side, lots, openPrice, pnl };
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
  const ordersRes = await mt5Get(
    `/OpenedOrders?id=${encodeURIComponent(token)}`,
  );
  if (ordersRes.ok && Array.isArray(ordersRes.data)) {
    trades = ordersRes.data.map(mapOrder).filter(Boolean);
  } else if (ordersRes.ok && ordersRes.data && typeof ordersRes.data === 'object') {
    const list =
      ordersRes.data.orders ||
      ordersRes.data.Orders ||
      ordersRes.data.items ||
      [];
    if (Array.isArray(list)) trades = list.map(mapOrder).filter(Boolean);
  }
  // If OpenedOrders fails, still return account with empty trades (honest)

  return {
    ok: true,
    account: {
      id: token,
      sessionId: token,
      login: login || undefined,
      currency: currency || undefined,
      balance: balance ?? equity ?? 0,
      equity: equity ?? balance ?? 0,
      margin: margin ?? undefined,
      freeMargin: freeMargin ?? undefined,
      leverage: leverage ?? undefined,
      trades,
      updatedAt: new Date().toISOString(),
      source: 'mt5-live',
    },
  };
}

module.exports = {
  connectLiveMt5,
  fetchLiveAccount,
  mt5Root,
};
