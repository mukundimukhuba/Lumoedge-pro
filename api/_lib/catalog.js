/** Shared broker catalog + fuzzy search for /api/brokers */

const BROKERS = [
  'IC Markets',
  'Pepperstone',
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
  'Raw Trading',
  'JustMarkets',
  'Octa',
  'OctaFX',
  'LiteFinance',
  'InstaForex',
  'Alpari',
  'FXTM',
  'HotForex',
  'Dukascopy',
  'Swissquote',
  'TD365',
  'City Index',
  'Spreadex',
  'Markets.com',
  'XTB',
  'ActivTrades',
  'ADSS',
  'AMarkets',
  'IronFX',
  'FXCM',
  'FXOpen',
  'FXPro',
  'FxPig',
  'Gbe brokers',
  'GMI',
  'HYCM',
  'ICM Capital',
  'IFC Markets',
  'Infinox',
  'Ironbeam',
  'LegacyFX',
  'Libertex',
  'LMAX',
  'London Capital Group',
  'NPBFX',
  'Olymp Trade',
  'Orbex',
  'Pacific Union',
  'Phenix Capital',
  'PhillipCapital',
  'PrimeXBT',
  'Purple Trading',
  'Rakuten Securities',
  'Refresh Capital',
  'Scope Markets',
  'Skilling',
  'Spread Co',
  'Sterling Markets',
  'StoneX',
  'Supercharts',
  'T4Trade',
  'TeleTrade',
  'TenX Prime',
  'TMGM',
  'Tradier',
  'Tradovate',
  'Traders Way',
  'Tradeview Markets',
  'TriumphFX',
  'Ubermarkets',
  'Umarkets',
  'UniFee',
  'Valutrades',
  'Vantage International',
  'Vertex Markets',
  'VT Markets',
  'Windsor Brokers',
  'XBTFX',
  'Yapikredi Invest',
  'ZuluTrade',
  'StarTrader',
  'MultiBank Group',
  'DooPrime',
  'PuPrime',
  'Ultima Markets',
  'Moneta Markets',
  'ACYpartners',
  'Opofinance',
  'Errante',
  'Blueberry',
  'ATFX',
  'BDSwiss',
  'NordFX',
  'Just2Trade',
  'Tickmill UK',
  'Tickmill EU',
  'IC Markets AU',
  'IC Markets Global',
  'Pepperstone UK',
  'Pepperstone AU',
  'MetaQuotes Demo',
  'MetaTrader 5 Demo',
  'MetaTrader 4 Demo',
  'Deriv',
  'Binary.com',
  'Pocket Option',
  'IQ Option',
  'Quotex',
  'FreshForex',
  'Grand Capital',
  'Gerchik & Co',
  'Weltrade',
  'FiboGroup',
  'RoboForex EU',
  'RoboForex Ltd',
  'AvaTrade EU',
  'AvaTrade Global',
  'Fxview',
  'E8 Markets',
  'The5ers',
  'SurgeTrader',
  'Maven Trading',
  'Earn2Trade',
  'Apex Trader Funding',
  'Topstep',
  'Bulenox',
  'Leeloo Trading',
  'City Traders Imperium',
  'Funded Trading Plus',
  'True Forex Funds',
  'Goat Funded Trader',
];

const BROKER_ALIASES = {
  icmarkets: 'IC Markets',
  icmarket: 'IC Markets',
  icm: 'IC Markets',
  pepper: 'Pepperstone',
  pepperston: 'Pepperstone',
  xmtrading: 'XM',
  xmglobal: 'XM Global',
  exnes: 'Exness',
  ftmoo: 'FTMO',
  roboforex: 'RoboForex',
  tickmil: 'Tickmill',
  fpmarkets: 'FP Markets',
  avatrade: 'AvaTrade',
  oanda: 'OANDA',
  plus500: 'Plus500',
  admiral: 'Admiral Markets',
  admirals: 'Admirals',
  blackbull: 'BlackBull Markets',
  fusion: 'Fusion Markets',
  eightcap: 'Eightcap',
  hfm: 'HFM',
  hfmarkets: 'HF Markets',
  thinkmarkets: 'ThinkMarkets',
  vantagemarkets: 'Vantage Markets',
  axitrader: 'AxiTrader',
  cmc: 'CMC Markets',
  ibkr: 'Interactive Brokers',
  ib: 'Interactive Brokers',
  saxo: 'Saxo Bank',
  capitalcom: 'Capital.com',
  trading212: 'Trading 212',
  etoro: 'eToro',
  blueberry: 'Blueberry Markets',
  gomarkets: 'GO Markets',
  globalprime: 'Global Prime',
  justmarkets: 'JustMarkets',
  octafx: 'OctaFX',
  liteforex: 'LiteFinance',
  insta: 'InstaForex',
  hotforex: 'HotForex',
  dukas: 'Dukascopy',
  fxcm: 'FXCM',
  fxpro: 'FXPro',
  fxopen: 'FXOpen',
  fundedpips: 'FundingPips',
  tft: 'The Funded Trader',
  fundednext: 'FundedNext',
  mff: 'MyForexFunds',
  tmgm: 'TMGM',
  vtmarkets: 'VT Markets',
  puprime: 'PuPrime',
  dooprime: 'DooPrime',
  multibank: 'MultiBank Group',
  mt5demo: 'MetaTrader 5 Demo',
  mt4demo: 'MetaTrader 4 Demo',
  metaquotes: 'MetaQuotes Demo',
};

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
  const dist = levenshtein(
    qKey,
    nKey.slice(0, Math.max(qKey.length + 2, qKey.length)),
  );
  const maxLen = Math.max(qKey.length, 1);
  if (dist <= Math.max(1, Math.floor(maxLen / 3))) return 600 - dist * 40;
  const qTokens = q.split(/[^a-z0-9]+/).filter(Boolean);
  const nTokens = n.split(/[^a-z0-9]+/).filter(Boolean);
  let hits = 0;
  for (const t of qTokens) {
    if (nTokens.some((nt) => nt.startsWith(t) || t.startsWith(nt))) hits += 1;
  }
  if (hits > 0) return 400 + hits * 50;
  return 0;
}

function filterBrokers(query, limit = 10) {
  const q = String(query || '').trim();
  const lim = Math.max(1, Math.min(50, Number(limit) || 10));
  if (!q) return BROKERS.slice(0, lim);

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
