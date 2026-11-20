/**
 * In-memory demo sessions for local account streaming.
 * When BROKER_API_URL is set, account data comes from upstream instead.
 * Never stores passwords.
 */

const sessions = new Map();

function seedTrades(broker, login) {
  const seed = [...`${broker}${login}`].reduce((a, c) => a + c.charCodeAt(0), 0);
  // ~40% of demos start with no open trades
  if (seed % 5 < 2) return [];
  const n = 1 + (seed % 3);
  const symbols = ['EURUSD', 'XAUUSD', 'GBPUSD', 'USDJPY', 'NAS100'];
  const trades = [];
  for (let i = 0; i < n; i++) {
    const sym = symbols[(seed + i) % symbols.length];
    const buy = (seed + i) % 2 === 0;
    const lots = [0.01, 0.05, 0.1, 0.2][(seed + i) % 4];
    const pnl = ((seed % 200) - 80) * (i + 1) * 0.35;
    trades.push({
      id: `T${login}-${i + 1}`,
      symbol: sym,
      side: buy ? 'Buy' : 'Sell',
      lots,
      openPrice: sym.includes('XAU') ? 2650 + (seed % 40) : 1.08 + (seed % 30) / 1000,
      pnl: Math.round(pnl * 100) / 100,
    });
  }
  return trades;
}

function createSession({ broker, server, login }) {
  const id = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const seed = [...`${broker}${login}${server}`].reduce(
    (a, c) => a + c.charCodeAt(0),
    0,
  );
  const balance = 1000 + (seed % 9000);
  const trades = seedTrades(broker, login);
  const floating = trades.reduce((a, t) => a + t.pnl, 0);
  const session = {
    id,
    broker,
    server,
    login,
    currency: 'USD',
    balance: Math.round(balance * 100) / 100,
    equity: Math.round((balance + floating) * 100) / 100,
    trades,
    createdAt: Date.now(),
    tick: 0,
  };
  sessions.set(id, session);
  return session;
}

function tickSession(session) {
  session.tick += 1;
  // Mild equity drift for "live" feel
  session.trades = session.trades.map((t) => {
    const drift = Math.sin((session.tick + t.lots * 10) / 3) * (0.4 + t.lots);
    return {
      ...t,
      pnl: Math.round((t.pnl + drift * 0.15) * 100) / 100,
    };
  });
  const floating = session.trades.reduce((a, t) => a + t.pnl, 0);
  session.equity = Math.round((session.balance + floating) * 100) / 100;
  return session;
}

function getSession(id) {
  const s = sessions.get(id);
  if (!s) return null;
  return tickSession(s);
}

function publicAccount(session) {
  return {
    sessionId: session.id,
    broker: session.broker,
    server: session.server,
    login: session.login,
    currency: session.currency,
    balance: session.balance,
    equity: session.equity,
    trades: session.trades,
    updatedAt: new Date().toISOString(),
  };
}

module.exports = {
  createSession,
  getSession,
  publicAccount,
};
