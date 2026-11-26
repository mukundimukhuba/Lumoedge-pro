#!/usr/bin/env node
/**
 * Proof: restore path never waits on network, paints cached account first.
 * Simulates ConnectBrokerScreen restore ordering (storage → UI → background).
 */
import assert from 'node:assert/strict';

const store = new Map();

const AsyncStorage = {
  async getItem(k) {
    return store.has(k) ? store.get(k) : null;
  },
  async setItem(k, v) {
    store.set(k, String(v));
  },
  async removeItem(k) {
    store.delete(k);
  },
  async multiRemove(keys) {
    for (const k of keys) store.delete(k);
  },
};

const MT5_TOKEN_KEY = 'edges-mt5-token-v1';
const MT5_LINK_KEY = 'edges-mt5-link-v1';
const MT5_ACCOUNT_CACHE_KEY = 'edges-mt5-account-v1';

async function saveMt5Link(link) {
  const payload = {
    token: link.token,
    broker: link.broker,
    server: link.server,
    login: link.login,
    savedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(MT5_LINK_KEY, JSON.stringify(payload));
  await AsyncStorage.setItem(MT5_TOKEN_KEY, link.token);
}

async function loadMt5Link() {
  const raw = await AsyncStorage.getItem(MT5_LINK_KEY);
  return raw ? JSON.parse(raw) : null;
}

async function saveMt5AccountCache(account) {
  // Never persist password-shaped fields
  const payload = {
    login: account.login,
    currency: account.currency,
    balance: account.balance,
    equity: account.equity,
    trades: account.trades || [],
    updatedAt: account.updatedAt || new Date().toISOString(),
    source: account.source || 'mt5-live',
  };
  assert.equal('password' in payload, false);
  await AsyncStorage.setItem(MT5_ACCOUNT_CACHE_KEY, JSON.stringify(payload));
}

async function loadMt5AccountCache() {
  const raw = await AsyncStorage.getItem(MT5_ACCOUNT_CACHE_KEY);
  return raw ? JSON.parse(raw) : null;
}

function hungFetch() {
  return new Promise(() => {
    /* never resolves — old bug hung here */
  });
}

async function restoreSession({ fetchAccount }) {
  const timeline = [];
  let restoring = true;
  let connected = false;
  let account = null;
  let selected = null;

  const paint = (label) => {
    timeline.push({
      label,
      restoring,
      connected,
      hasAccount: !!account,
      selected,
      showsRestoringCopy: restoring && !connected, // UI no longer shows Restoring text while connected
      showsDashboard: !restoring && connected && !!selected,
    });
  };

  paint('mount');

  const [link, cached] = await Promise.all([
    loadMt5Link(),
    loadMt5AccountCache(),
  ]);

  if (!link?.token) {
    restoring = false;
    paint('no-link');
    return { timeline, account, connected };
  }

  selected = link.broker;
  connected = true;
  if (cached) account = cached;
  restoring = false; // NEVER await network before this
  paint('after-local-hydrate');

  // Background refresh (may hang) must not change restoring
  void fetchAccount(link.token)
    .then((next) => {
      account = next;
      paint('background-live');
    })
    .catch(() => {
      paint('background-failed-keep-cache');
    });

  // Give hung fetch a tick — UI must already be dashboard
  await new Promise((r) => setTimeout(r, 50));
  paint('after-50ms-hung-network');

  return { timeline, account, connected, restoring };
}

await saveMt5Link({
  token: 'tok_demo',
  broker: 'RCG Markets',
  server: 'RCGMarkets-Real',
  login: '123456',
});
await saveMt5AccountCache({
  login: '123456',
  currency: 'USD',
  balance: 10420.55,
  equity: 10501.1,
  trades: [
    {
      id: '1',
      symbol: 'XAUUSD',
      side: 'buy',
      lots: 0.1,
      openPrice: 2650,
      pnl: 80.55,
    },
  ],
  updatedAt: '2026-11-26T00:40:00.000Z',
});

const hung = await restoreSession({ fetchAccount: hungFetch });
const after = hung.timeline.find((t) => t.label === 'after-local-hydrate');
const later = hung.timeline.find((t) => t.label === 'after-50ms-hung-network');

assert.ok(after, 'local hydrate paint missing');
assert.equal(after.restoring, false);
assert.equal(after.connected, true);
assert.equal(after.hasAccount, true);
assert.equal(after.showsDashboard, true);
assert.equal(after.showsRestoringCopy, false);

assert.ok(later);
assert.equal(later.restoring, false);
assert.equal(later.showsDashboard, true);
assert.equal(later.hasAccount, true);
assert.equal(hung.account.balance, 10420.55);

const cachedRaw = await AsyncStorage.getItem(MT5_ACCOUNT_CACHE_KEY);
assert.ok(cachedRaw);
assert.equal(cachedRaw.includes('password'), false);
assert.equal(cachedRaw.includes('tok_demo'), false); // account cache is not the token store

const proof = {
  ok: true,
  assertion: 'Cached dashboard paints before network; hung account fetch never re-enters Restoring',
  timeline: hung.timeline,
  cachedBalance: hung.account.balance,
  cachedEquity: hung.account.equity,
  trades: hung.account.trades.length,
};

console.log(JSON.stringify(proof, null, 2));
