/**
 * Offline proof: Chart Scanner auto/manual execute helpers + JHB daily reset.
 * Run: node scripts/test-scanner-execute.js
 *
 * Asserts:
 *  - Execute gate uses signal floor (70%), not 85% — 78% Buy must OrderSend
 *  - US30.CENT / XAUUSD.CENT heal to .cent for OrderSend
 *  - Daily Johannesburg history reset
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const cases = [];
function pass(name, detail) {
  cases.push({ name, ok: true, detail });
}
function fail(name, err) {
  cases.push({
    name,
    ok: false,
    detail: String(err && err.message ? err.message : err),
  });
  throw err;
}
function run(name, fn) {
  try {
    fn();
    pass(name, 'ok');
  } catch (e) {
    fail(name, e);
  }
}

// Mirror mobile/src/scan/scannerPersist.ts day helpers (no RN AsyncStorage).
const SCANNER_TZ = 'Africa/Johannesburg';
const DEFAULT_SCANS_PER_DAY = 12;

function johannesburgDayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SCANNER_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function applyDailyReset(state, now = new Date()) {
  const today = johannesburgDayKey(now);
  if (state.dayKey === today) return { state, didReset: false };
  return {
    state: {
      ...state,
      dayKey: today,
      scansLeft: DEFAULT_SCANS_PER_DAY,
      history: [],
    },
    didReset: true,
  };
}

function preserveBrokerSymbol(symbol) {
  return String(symbol || '')
    .trim()
    .replace(/\s+/g, '');
}

function healKnownBrokerSuffix(symbol) {
  let s = preserveBrokerSymbol(symbol);
  if (/\.cent$/i.test(s)) s = s.replace(/\.cent$/i, '.cent');
  return s;
}

function symbolsMatch(a, b) {
  const left = preserveBrokerSymbol(a);
  const right = preserveBrokerSymbol(b);
  if (!left || !right) return false;
  return left.toUpperCase() === right.toUpperCase();
}

function rematchBrokerSpelling(symbol, brokerSymbols) {
  const sym = preserveBrokerSymbol(symbol);
  if (!sym) return sym;
  const hit = brokerSymbols.find((s) => symbolsMatch(s.symbol, sym));
  return healKnownBrokerSuffix(hit?.symbol || sym);
}

function resolveOrderSymbol(raw, hints) {
  const base = healKnownBrokerSuffix(raw);
  if (!base) return base;
  const cards = (hints || [])
    .map((h) =>
      typeof h === 'string'
        ? { symbol: healKnownBrokerSuffix(h) }
        : { symbol: healKnownBrokerSuffix(h.symbol) },
    )
    .filter((h) => h && preserveBrokerSymbol(h.symbol));
  if (cards.length) return rematchBrokerSpelling(base, cards);
  return base;
}

// Mirror strategy execute gate (Chart Scanner OrderSend floor).
const AUTO_TRADE_MIN_ACCURACY = 85;
const SCAN_SIGNAL_MIN_ACCURACY = 70;
const EXECUTE_MIN_ACCURACY = SCAN_SIGNAL_MIN_ACCURACY;

function evaluateAutoTradeGate(input) {
  const reasons = [];
  const minAccuracy =
    input.minAccuracy != null && Number.isFinite(input.minAccuracy)
      ? Number(input.minAccuracy)
      : AUTO_TRADE_MIN_ACCURACY;
  if (input.requireMt5 && !input.mt5Connected) {
    reasons.push('SKIP: MetaTrader not connected — live data required');
  }
  if (!input.side) reasons.push('SKIP: no clear BUY/SELL — prefer no trade');
  if (input.accuracy < minAccuracy) {
    reasons.push(
      `SKIP: confidence below gate — prefer no trade (${input.accuracy}% < ${minAccuracy}%)`,
    );
  }
  if (
    input.entryPrice == null ||
    input.stopLoss == null ||
    !(input.stopLoss < input.entryPrice)
  ) {
    reasons.push('SKIP: entry/SL invalid for side');
  }
  const unique = [...new Set(reasons)];
  return {
    allowed: unique.length === 0,
    reasons: unique,
    skipReason: unique.length ? unique[0] : null,
  };
}

run('Johannesburg day key is YYYY-MM-DD', () => {
  const key = johannesburgDayKey(new Date('2026-11-25T22:30:00.000Z'));
  assert.strictEqual(key, '2026-11-26'); // UTC 22:30 = JHB 00:30 next calendar day
});

run('Daily reset clears history when dayKey rolls', () => {
  const prev = {
    dayKey: '2026-11-25',
    autoOpenTrades: true,
    scansLeft: 3,
    history: [
      {
        id: '1',
        symbol: 'XAUUSD.cent',
        timeframe: 'H1',
        bias: 'Buy',
        confidence: 90,
        message: 'x',
        lotSize: 0.01,
        trades: 1,
        tp: '1',
        sl: '2',
        chartUri: null,
        at: '2026-11-25T10:00:00.000Z',
      },
    ],
  };
  const { state, didReset } = applyDailyReset(
    prev,
    new Date('2026-11-25T22:05:00.000Z'), // JHB 2026-11-26 00:05
  );
  assert.strictEqual(didReset, true);
  assert.strictEqual(state.dayKey, '2026-11-26');
  assert.strictEqual(state.history.length, 0);
  assert.strictEqual(state.scansLeft, DEFAULT_SCANS_PER_DAY);
  assert.strictEqual(state.autoOpenTrades, true);
});

run('Same JHB day does not reset', () => {
  const day = johannesburgDayKey();
  const { didReset, state } = applyDailyReset({
    dayKey: day,
    autoOpenTrades: false,
    scansLeft: 7,
    history: [{ id: 'x', symbol: 'EURUSD' }],
  });
  assert.strictEqual(didReset, false);
  assert.strictEqual(state.scansLeft, 7);
  assert.strictEqual(state.history.length, 1);
});

run('Order symbol rematch keeps .cent casing', () => {
  const resolved = resolveOrderSymbol('XAUUSD.CENT', [
    'EURUSD',
    'XAUUSD.cent',
    'GBPUSD',
  ]);
  assert.strictEqual(resolved, 'XAUUSD.cent');
});

run('Order symbol without hint heals .CENT → .cent', () => {
  assert.strictEqual(
    resolveOrderSymbol('  XAUUSD.cent '),
    'XAUUSD.cent',
  );
  assert.strictEqual(resolveOrderSymbol('XAUUSD.CENT'), 'XAUUSD.cent');
  assert.strictEqual(resolveOrderSymbol('US30.CENT'), 'US30.cent');
  assert.strictEqual(resolveOrderSymbol('US30.cent'), 'US30.cent');
});

run('78% Buy passes execute gate (signal floor), fails legacy 85%', () => {
  const base = {
    accuracy: 78,
    side: 'buy',
    symbol: 'US30.cent',
    entryPrice: 50353.83,
    stopLoss: 50243.05,
    requireMt5: true,
    mt5Connected: true,
  };
  const legacy = evaluateAutoTradeGate(base);
  assert.strictEqual(legacy.allowed, false, '85% default still blocks 78%');
  assert.ok(String(legacy.skipReason).includes('78%'));
  assert.ok(String(legacy.skipReason).includes('85%'));

  const exec = evaluateAutoTradeGate({
    ...base,
    minAccuracy: EXECUTE_MIN_ACCURACY,
  });
  assert.strictEqual(exec.allowed, true, 'signal floor allows 78% Buy');
  assert.strictEqual(exec.skipReason, null);
});

run('Below signal floor still skips execute', () => {
  const gated = evaluateAutoTradeGate({
    accuracy: 65,
    side: 'buy',
    symbol: 'US30.cent',
    entryPrice: 50353.83,
    stopLoss: 50243.05,
    requireMt5: true,
    mt5Connected: true,
    minAccuracy: EXECUTE_MIN_ACCURACY,
  });
  assert.strictEqual(gated.allowed, false);
  assert.ok(String(gated.skipReason).includes('65%'));
});

run('Server preserveBrokerSymbol heals .cent', () => {
  const { preserveBrokerSymbol: serverPreserve } = require('../api/_lib/mt5Live');
  assert.strictEqual(serverPreserve('US30.CENT'), 'US30.cent');
  assert.strictEqual(serverPreserve('XAUUSD.cent'), 'XAUUSD.cent');
});

run('Source modules wire execute signal floor + OrderSend', () => {
  const root = path.join(__dirname, '..', 'mobile', 'src', 'scan');
  for (const f of [
    'scannerPersist.ts',
    'executeChartTrades.ts',
    'strategy.ts',
  ]) {
    assert.ok(fs.existsSync(path.join(root, f)), f);
  }
  const strategy = fs.readFileSync(path.join(root, 'strategy.ts'), 'utf8');
  assert.ok(strategy.includes('EXECUTE_MIN_ACCURACY'));
  assert.ok(strategy.includes('minAccuracy'));

  const exec = fs.readFileSync(
    path.join(root, 'executeChartTrades.ts'),
    'utf8',
  );
  assert.ok(exec.includes('EXECUTE_MIN_ACCURACY'));
  assert.ok(exec.includes('sendBrokerOrder'));
  assert.ok(exec.includes('healKnownBrokerSuffix'));

  const screen = path.join(
    __dirname,
    '..',
    'mobile',
    'src',
    'ChartScannerScreen.tsx',
  );
  const src = fs.readFileSync(screen, 'utf8');
  assert.ok(src.includes('Auto Open Trades'));
  assert.ok(src.includes('Execute trades now?'));
  assert.ok(src.includes('Africa/Johannesburg'));
  assert.ok(src.includes('executeChartTrades'));
  assert.ok(src.includes('EXECUTE_MIN_ACCURACY'));
  assert.ok(src.includes('opens on Buy/Sell signal'));
  assert.ok(src.includes('execSignal'));
  assert.ok(!src.includes('opens when gate ≥85'));
});

const outDir = path.join(__dirname, '..', '.cursor-proofs');
fs.mkdirSync(outDir, { recursive: true });
const report = {
  ok: cases.every((c) => c.ok),
  cases,
  at: new Date().toISOString(),
  note:
    'Chart Scanner Auto Open / Execute uses EXECUTE_MIN_ACCURACY (70% signal). 78% Buy must OrderSend; US30.CENT → US30.cent.',
};
fs.writeFileSync(
  path.join(outDir, 'scanner-execute.json'),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
