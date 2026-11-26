/**
 * Offline proof: broker symbol casing must survive allow → select → OrderSend path.
 * Run: node scripts/test-symbol-case.js
 */
const assert = require('assert');
const { preserveBrokerSymbol } = require('../api/_lib/mt5Live');

// Mirror client helpers (keep in sync with mobile/src/brokers/symbolMeta.ts)
function preserveClient(symbol) {
  return String(symbol || '')
    .trim()
    .replace(/\s+/g, '');
}
function symbolsMatch(a, b) {
  const left = preserveClient(a);
  const right = preserveClient(b);
  if (!left || !right) return false;
  return left.toUpperCase() === right.toUpperCase();
}
function dedupeBrokerSymbols(symbols) {
  const out = [];
  const seen = new Set();
  for (const raw of symbols) {
    const sym = preserveClient(raw);
    if (!sym) continue;
    const key = sym.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(sym);
  }
  return out;
}
function healKnownBrokerSuffix(symbol) {
  let s = preserveClient(symbol);
  if (/\.cent$/i.test(s)) s = s.replace(/\.cent$/i, '.cent');
  return s;
}
function rematchBrokerSpelling(symbol, brokerSymbols) {
  const sym = preserveClient(symbol);
  if (!sym) return sym;
  const hit = brokerSymbols.find((s) => symbolsMatch(s.symbol, sym));
  return healKnownBrokerSuffix(hit?.symbol || sym);
}
function normalizeQuoteSetup(input) {
  const symbol = preserveClient(input.symbol);
  if (!symbol) return null;
  return { symbol, lotSize: 0.01, trades: 1 };
}

const BROKER = 'XAUUSD.cent';

// 1) Allowed → Selected must not uppercase
const selected = normalizeQuoteSetup({ symbol: BROKER });
assert.strictEqual(selected.symbol, BROKER, 'select preserves .cent');

// 2) Dedupe keeps first exact spelling
assert.deepStrictEqual(
  dedupeBrokerSymbols([BROKER, 'XAUUSD.CENT', ' eurusd ']),
  [BROKER, 'eurusd'],
  'dedupe keeps first casing',
);

// 3) Rematch heals previously uppercased Selected rows
assert.strictEqual(
  rematchBrokerSpelling('XAUUSD.CENT', [{ symbol: BROKER }]),
  BROKER,
  'rematch .CENT → .cent',
);

// 4) Auto-scan / OrderSend path: server preserveBrokerSymbol
assert.strictEqual(
  preserveBrokerSymbol(BROKER),
  BROKER,
  'OrderSend preserveBrokerSymbol',
);
assert.strictEqual(
  preserveBrokerSymbol('  XAUUSD.cent '),
  BROKER,
  'OrderSend trims only',
);

// 5) Regression: old buggy uppercasing would produce the failing ticker
const buggy = String(BROKER).trim().replace(/\s+/g, '').toUpperCase();
assert.strictEqual(buggy, 'XAUUSD.CENT');
assert.notStrictEqual(
  preserveBrokerSymbol(BROKER),
  buggy,
  'must not match uppercased reject form',
);

// 6) Heal OCR/API .CENT even without a rematch hint (US30.cent broker spelling)
assert.strictEqual(
  preserveBrokerSymbol('US30.CENT'),
  'US30.cent',
  'OrderSend heals US30.CENT → US30.cent',
);
assert.strictEqual(
  rematchBrokerSpelling('US30.CENT', [{ symbol: 'EURUSD' }]),
  'US30.cent',
  'rematch without hit still heals .cent',
);

console.log('test-symbol-case: ok');
console.log(
  JSON.stringify(
    {
      brokerSymbolList: BROKER,
      afterSelect: selected.symbol,
      afterOrderSendNormalize: preserveBrokerSymbol(BROKER),
      rematchedFromUpper: rematchBrokerSpelling('XAUUSD.CENT', [
        { symbol: BROKER },
      ]),
      us30Healed: preserveBrokerSymbol('US30.CENT'),
    },
    null,
    2,
  ),
);
