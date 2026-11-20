/** Shared broker catalog + fuzzy search for /api/brokers */

const BROKERS = [
  // South Africa
  'EasyEquities',
  'GT247',
  'Standard Bank OST',
  'Absa Stockbrokers',
  'FNB Share Investing',
  'Investec Securities',
  'PSG Wealth',
  'Sasfin Securities',
  'Orange Securities',
  'Sygnia Securities',
  'Ninety One',
  'Afriforesx',
  'Accendo Markets',
  'Bidvest Securities',
  'Satrix',
  'Razor Markets',
  'RCG Markets',
  'Banxso',
  'Scope Markets',
  'Vault Markets',
  'JustMarkets SA',
  'FNB',
  'Standard Bank FX',
  'Orange Markets',
  'Trade360 SA',
  'AVATRADE SA',
  // Global / MT5
  'IC Markets',
  'IC Markets AU',
  'IC Markets Global',
  'Pepperstone',
  'Pepperstone UK',
  'Pepperstone AU',
  'XM',
  'XM Global',
  'Exness',
  'FTMO',
  'FundingPips',
  'The Funded Trader',
  'FundedNext',
  'MyForexFunds',
  'RoboForex',
  'Tickmill',
  'Tickmill UK',
  'Tickmill EU',
  'FP Markets',
  'AvaTrade',
  'OANDA',
  'IG',
  'Plus500',
  'Admiral Markets',
  'Admirals',
  'BlackBull Markets',
  'Fusion Markets',
  'Eightcap',
  'HFM',
  'HF Markets',
  'FBS',
  'ThinkMarkets',
  'Vantage',
  'Vantage Markets',
  'Axi',
  'AxiTrader',
  'CMC Markets',
  'Forex.com',
  'Interactive Brokers',
  'Saxo Bank',
  'Capital.com',
  'Trading 212',
  'eToro',
  'Blueberry Markets',
  'GO Markets',
  'Global Prime',
  'JustMarkets',
  'Octa',
  'OctaFX',
  'LiteFinance',
  'InstaForex',
  'Alpari',
  'FXTM',
  'HotForex',
  'Dukascopy',
  'FXCM',
  'FXOpen',
  'FXPro',
  'PrimeXBT',
  'TMGM',
  'VT Markets',
  'PuPrime',
  'MultiBank Group',
  'StarTrader',
  'MetaQuotes Demo',
  'MetaTrader 5 Demo',
  'MetaTrader 4 Demo',
  'Deriv',
  'NordFX',
  'DooPrime',
  'Ultima Markets',
  'Moneta Markets',
];

const BROKER_ALIASES = {
  icmarkets: 'IC Markets',
  icm: 'IC Markets',
  pepper: 'Pepperstone',
  pepperston: 'Pepperstone',
  xmtrading: 'XM',
  exnes: 'Exness',
  ftmoo: 'FTMO',
  roboforex: 'RoboForex',
  tickmil: 'Tickmill',
  hfm: 'HFM',
  hfmarkets: 'HF Markets',
  fundedpips: 'FundingPips',
  gt247: 'GT247',
  easyequities: 'EasyEquities',
  easyequity: 'EasyEquities',
  standardbank: 'Standard Bank OST',
  standardbankfx: 'Standard Bank FX',
  standardbankost: 'Standard Bank OST',
  absa: 'Absa Stockbrokers',
  fnb: 'FNB',
  fnbshareinvesting: 'FNB Share Investing',
  investec: 'Investec Securities',
  psg: 'PSG Wealth',
  afriforesx: 'Afriforesx',
  satrix: 'Satrix',
  razor: 'Razor Markets',
  razormarkets: 'Razor Markets',
  razormarket: 'Razor Markets',
  rcg: 'RCG Markets',
  rcgmarkets: 'RCG Markets',
  banxso: 'Banxso',
  scope: 'Scope Markets',
  scopemarkets: 'Scope Markets',
  vault: 'Vault Markets',
  vaultmarkets: 'Vault Markets',
  justmarketssa: 'JustMarkets SA',
  justmarkets: 'JustMarkets',
  mt5demo: 'MetaTrader 5 Demo',
  mt4demo: 'MetaTrader 4 Demo',
  metaquotes: 'MetaQuotes Demo',
};

const QUERY_STOPWORDS = new Set([
  'markets',
  'market',
  'broker',
  'brokers',
  'trading',
  'forex',
  'capital',
  'securities',
  'bank',
  'fx',
  'mt5',
  'mt4',
  'sa',
  'global',
  'ltd',
  'limited',
  'the',
]);

function normalizeBrokerKey(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) row[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = cur;
    }
  }
  return row[b.length];
}

function scoreBroker(query, name) {
  const q = String(query || '').trim().toLowerCase();
  const qKey = normalizeBrokerKey(query);
  const n = name.toLowerCase();
  const nKey = normalizeBrokerKey(name);
  if (!qKey) return 0;
  if (n === q || nKey === qKey) return 1000;
  if (n.startsWith(q) || nKey.startsWith(qKey)) return 900 - Math.min(qKey.length, 40);
  if (n.includes(q) || nKey.includes(qKey)) return 750 - Math.min(nKey.indexOf(qKey), 40);

  const qTokens = q.split(/[^a-z0-9]+/).filter(Boolean);
  const nTokens = n.split(/[^a-z0-9]+/).filter(Boolean);
  const distinctive = qTokens.filter((t) => !QUERY_STOPWORDS.has(t));
  const needed = distinctive.length > 0 ? distinctive : qTokens;

  // Fuzzy match only on distinctive tokens (never on "markets" alone)
  const fuzzyKey = normalizeBrokerKey(needed.join(' '));
  if (fuzzyKey.length >= 2) {
    const dist = levenshtein(
      fuzzyKey,
      nKey.slice(0, Math.max(fuzzyKey.length + 2, fuzzyKey.length)),
    );
    const maxLen = Math.max(fuzzyKey.length, 1);
    if (dist <= Math.max(1, Math.floor(maxLen / 3))) {
      // Still require the distinctive stem to appear in the name key
      // for short queries like "rcg" / "razor"
      const stemOk =
        distinctive.length === 0 ||
        distinctive.some(
          (t) =>
            nKey.includes(t) ||
            nTokens.some((nt) => nt.startsWith(t) || t.startsWith(nt)),
        );
      if (stemOk) return 600 - dist * 40;
    }
  }

  let hits = 0;
  let distinctiveHits = 0;
  for (const t of qTokens) {
    const matched = nTokens.some(
      (nt) => nt.startsWith(t) || t.startsWith(nt) || nt.includes(t),
    );
    if (matched) {
      hits += 1;
      if (!QUERY_STOPWORDS.has(t)) distinctiveHits += 1;
    }
  }
  if (distinctive.length > 0 && distinctiveHits === 0) return 0;
  if (needed.length > 1 && distinctiveHits < Math.ceil(needed.length * 0.5)) {
    return 0;
  }
  if (hits === 0) return 0;
  return 400 + distinctiveHits * 120 + hits * 20;
}

function filterBrokers(query, limit = 10) {
  const q = String(query || '').trim();
  const lim = Math.max(1, Math.min(50, Number(limit) || 10));
  if (!q) {
    // SA brokers first when listing
    const za = [
      'Razor Markets',
      'RCG Markets',
      'Banxso',
      'Scope Markets',
      'Vault Markets',
      'JustMarkets SA',
      'EasyEquities',
      'GT247',
      'Standard Bank FX',
      'Standard Bank OST',
      'FNB',
      'FNB Share Investing',
      'Absa Stockbrokers',
      'Investec Securities',
      'PSG Wealth',
      'Afriforesx',
      'Satrix',
    ];
    const rest = BROKERS.filter((b) => !za.includes(b));
    return [...za, ...rest].slice(0, lim);
  }

  const qKey = normalizeBrokerKey(q);
  const aliasHit = BROKER_ALIASES[qKey] || BROKER_ALIASES[q.toLowerCase()];
  const scored = BROKERS.map((name) => ({
    name,
    score: scoreBroker(q, name),
  }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const out = [];
  if (aliasHit) out.push(aliasHit);
  for (const s of scored) {
    if (!out.includes(s.name)) out.push(s.name);
    if (out.length >= lim) break;
  }
  return out;
}

function canUseCustomBroker(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return false;
  return !BROKERS.some(
    (b) =>
      b.toLowerCase() === q.toLowerCase() ||
      normalizeBrokerKey(b) === normalizeBrokerKey(q),
  );
}

module.exports = {
  BROKERS,
  filterBrokers,
  canUseCustomBroker,
  normalizeBrokerKey,
};
