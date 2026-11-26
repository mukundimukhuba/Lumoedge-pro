/**
 * Offline unit checks for live-symbol parsing helpers (no network).
 * Run: node scripts/test-broker-symbols.js
 */
const {
  inferSymbolCategory,
  inferSymbolDescription,
  normalizeSymbolNameList,
  mapSymbolParamsRow,
} = require('../api/_lib/mt5Live');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(inferSymbolCategory('XAUUSD.mic') === 'METALS', 'XAU metals');
assert(inferSymbolCategory('EURUSD') === 'FOREX', 'EURUSD forex');
assert(inferSymbolCategory('BTCUSD') === 'CRYPTO', 'BTC crypto');
assert(inferSymbolCategory('NAS100') === 'INDICES', 'NAS indices');
assert(
  inferSymbolDescription('EURUSD', '') === 'Euro / USD',
  'EURUSD description',
);
assert(
  inferSymbolDescription('XAUUSD.r', 'Gold spot') === 'Gold spot',
  'broker description wins',
);

assert(
  JSON.stringify(normalizeSymbolNameList(['EURUSD', ' XAUUSD '])) ===
    JSON.stringify(['EURUSD', 'XAUUSD']),
  'string list',
);
assert(
  JSON.stringify(
    normalizeSymbolNameList({ names: ['GBPUSD', 'USDJPY'] }),
  ) === JSON.stringify(['GBPUSD', 'USDJPY']),
  'names object',
);

const mapped = mapSymbolParamsRow({
  symbol: 'XAUUSD.mic',
  symbolInfo: { description: 'Gold vs US Dollar' },
  symbolGroup: { groupName: 'Metals' },
});
assert(mapped && mapped.symbol === 'XAUUSD.mic', 'map symbol');
assert(mapped.category === 'METALS', 'map category from group');
assert(mapped.description === 'Gold vs US Dollar', 'map description');

console.log('test-broker-symbols: ok');
