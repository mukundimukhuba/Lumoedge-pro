export type BrokerRecord = {
  name: string;
  servers: string[];
  /** Used for favicon / lettermark fallback */
  domain?: string;
  region?: 'za' | 'global' | 'prop';
  color: string;
};

function s(...servers: string[]) {
  return servers;
}

/** Catalog with MT servers + visual identity. */
export const BROKER_RECORDS: BrokerRecord[] = [
  {
    name: 'Razor Markets',
    domain: 'razormarkets.co.za',
    region: 'za',
    color: '#E10600',
    servers: s('RazorMarkets-Live', 'RazorMarkets-MT5', 'RazorMarkets-Demo'),
  },
  {
    name: 'RCG Markets',
    domain: 'rcgmarkets.com',
    region: 'za',
    color: '#0B3D91',
    servers: s('RCG-Live', 'RCGMarkets-MT5', 'RCG-Demo'),
  },
  {
    name: 'Banxso',
    domain: 'banxso.com',
    region: 'za',
    color: '#111111',
    servers: s('Banxso-Live', 'Banxso-MT5', 'Banxso-Demo'),
  },
  {
    name: 'Scope Markets',
    domain: 'scopemarkets.co.za',
    region: 'za',
    color: '#1A3C6E',
    servers: s('ScopeMarkets-Live', 'ScopeMarkets-MT5', 'ScopeMarkets-Demo'),
  },
  {
    name: 'Vault Markets',
    domain: 'vaultmarkets.co.za',
    region: 'za',
    color: '#6B2D5B',
    servers: s('VaultMarkets-Live', 'VaultMarkets-MT5', 'VaultMarkets-Demo'),
  },
  {
    name: 'JustMarkets SA',
    domain: 'justmarkets.com',
    region: 'za',
    color: '#00A651',
    servers: s('JustMarketsSA-Live', 'JustMarkets-MT5', 'JustMarketsSA-Demo'),
  },
  {
    name: 'GT247',
    domain: 'gt247.com',
    region: 'za',
    color: '#E30613',
    servers: s('GT247-Live', 'GT247-MT5', 'GT247-Demo'),
  },
  {
    name: 'Afriforesx',
    domain: 'afriforesx.com',
    region: 'za',
    color: '#C8102E',
    servers: s('Afriforesx-Live', 'Afriforesx-MT5', 'Afriforesx-Demo'),
  },
  {
    name: 'Accendo Markets',
    domain: 'accendomarkets.co.za',
    region: 'za',
    color: '#0B1F3A',
    servers: s('Accendo-Live', 'Accendo-Demo'),
  },
  {
    name: 'Orange Markets',
    domain: 'orangemarkets.co.za',
    region: 'za',
    color: '#FF6600',
    servers: s('OrangeMarkets-Live', 'OrangeMarkets-Demo'),
  },
  {
    name: 'Trade360 SA',
    domain: 'trade360.com',
    region: 'za',
    color: '#00B4D8',
    servers: s('Trade360-Live', 'Trade360-Demo'),
  },
  {
    name: 'AVATRADE SA',
    domain: 'avatrade.co.za',
    region: 'za',
    color: '#E30613',
    servers: s('AvaTradeSA-Live', 'AvaTradeSA-Demo'),
  },
  {
    name: 'Admiral Markets',
    domain: 'admiralmarkets.com',
    region: 'global',
    color: '#003366',
    servers: s('AdmiralsGroup-Live', 'AdmiralsGroup-Demo'),
  },
  {
    name: 'Admirals',
    domain: 'admirals.com',
    region: 'global',
    color: '#003366',
    servers: s('AdmiralsGroup-Live', 'AdmiralsGroup-Demo'),
  },
  {
    name: 'Alpari',
    domain: 'alpari.com',
    region: 'global',
    color: '#E30613',
    servers: s('Alpari-Live', 'Alpari-Demo'),
  },
  {
    name: 'AvaTrade',
    domain: 'avatrade.com',
    region: 'global',
    color: '#00A0E3',
    servers: s('Ava-Real', 'AvaTrade-Demo', 'Ava-Demo'),
  },
  {
    name: 'Axi',
    domain: 'axi.com',
    region: 'global',
    color: '#E30613',
    servers: s('Axi-Live', 'Axi-Demo'),
  },
  {
    name: 'AxiTrader',
    domain: 'axi.com',
    region: 'global',
    color: '#E30613',
    servers: s('AxiTrader-Live', 'AxiTrader-Demo'),
  },
  {
    name: 'BlackBull Markets',
    domain: 'blackbull.com',
    region: 'global',
    color: '#000000',
    servers: s('BlackBullMarkets-Live', 'BlackBullMarkets-Demo'),
  },
  {
    name: 'Blueberry Markets',
    domain: 'blueberrymarkets.com',
    region: 'global',
    color: '#4B0082',
    servers: s('Blueberry-Live', 'Blueberry-Demo'),
  },
  {
    name: 'CMC Markets',
    domain: 'cmcmarkets.com',
    region: 'global',
    color: '#0033A0',
    servers: s('CMCMarkets-Live', 'CMCMarkets-Demo'),
  },
  {
    name: 'Deriv',
    domain: 'deriv.com',
    region: 'global',
    color: '#FF444F',
    servers: s('Deriv-Server', 'Deriv-Demo'),
  },
  {
    name: 'Dukascopy',
    domain: 'dukascopy.com',
    region: 'global',
    color: '#003366',
    servers: s('Dukascopy-Live', 'Dukascopy-Demo'),
  },
  {
    name: 'Eightcap',
    domain: 'eightcap.com',
    region: 'global',
    color: '#111111',
    servers: s('Eightcap-Live', 'Eightcap-Demo'),
  },
  {
    name: 'Exness',
    domain: 'exness.com',
    region: 'global',
    color: '#FFD100',
    servers: s('Exness-MT5Real', 'Exness-Real', 'Exness-MT5Trial', 'Exness-Trial'),
  },
  {
    name: 'FBS',
    domain: 'fbs.com',
    region: 'global',
    color: '#E30613',
    servers: s('FBS-Real', 'FBS-Demo'),
  },
  {
    name: 'FP Markets',
    domain: 'fpmarkets.com',
    region: 'global',
    color: '#003087',
    servers: s('FPMarkets-Live', 'FPMarkets-Demo'),
  },
  {
    name: 'FXCM',
    domain: 'fxcm.com',
    region: 'global',
    color: '#0033A0',
    servers: s('FXCM-Live', 'FXCM-Demo'),
  },
  {
    name: 'FXOpen',
    domain: 'fxopen.com',
    region: 'global',
    color: '#FF6600',
    servers: s('FXOpen-Live', 'FXOpen-Demo'),
  },
  {
    name: 'FXPro',
    domain: 'fxpro.com',
    region: 'global',
    color: '#E30613',
    servers: s('FxPro-Live', 'FxPro-Demo'),
  },
  {
    name: 'FXTM',
    domain: 'forextime.com',
    region: 'global',
    color: '#0033A0',
    servers: s('FXTM-Live', 'FXTM-Demo'),
  },
  {
    name: 'Forex.com',
    domain: 'forex.com',
    region: 'global',
    color: '#003366',
    servers: s('ForexCom-Live', 'ForexCom-Demo'),
  },
  {
    name: 'Fusion Markets',
    domain: 'fusionmarkets.com',
    region: 'global',
    color: '#FF6A00',
    servers: s('FusionMarkets-Live', 'FusionMarkets-Demo'),
  },
  {
    name: 'GO Markets',
    domain: 'gomarkets.com',
    region: 'global',
    color: '#00A651',
    servers: s('GOMarkets-Live', 'GOMarkets-Demo'),
  },
  {
    name: 'Global Prime',
    domain: 'globalprime.com.au',
    region: 'global',
    color: '#111111',
    servers: s('GlobalPrime-Live', 'GlobalPrime-Demo'),
  },
  {
    name: 'HF Markets',
    domain: 'hfm.com',
    region: 'global',
    color: '#E30613',
    servers: s('HFMarketsGlobal-Live', 'HFMarketsGlobal-Demo'),
  },
  {
    name: 'HFM',
    domain: 'hfm.com',
    region: 'global',
    color: '#E30613',
    servers: s('HFMarketsGlobal-Live', 'HFMarketsGlobal-Demo'),
  },
  {
    name: 'HotForex',
    domain: 'hfm.com',
    region: 'global',
    color: '#E30613',
    servers: s('HotForex-Live', 'HotForex-Demo'),
  },
  {
    name: 'IC Markets',
    domain: 'icmarkets.com',
    region: 'global',
    color: '#E31C23',
    servers: s('ICMarkets-Live', 'ICMarketsSC-MT5', 'ICMarketsSC-Demo', 'ICMarketsEU-Demo', 'ICMarketsAU-Demo', 'ICMarkets-Demo'),
  },
  {
    name: 'IC Markets AU',
    domain: 'icmarkets.com.au',
    region: 'global',
    color: '#E31C23',
    servers: s('ICMarketsAU-Live', 'ICMarketsAU-Demo'),
  },
  {
    name: 'IC Markets Global',
    domain: 'icmarkets.com',
    region: 'global',
    color: '#E31C23',
    servers: s('ICMarketsSC-MT5', 'ICMarketsSC-Demo'),
  },
  {
    name: 'IG',
    domain: 'ig.com',
    region: 'global',
    color: '#DE002B',
    servers: s('IG-Live', 'IG-Demo', 'IGMarkets-Demo'),
  },
  {
    name: 'InstaForex',
    domain: 'instaforex.com',
    region: 'global',
    color: '#E30613',
    servers: s('InstaForex-Live', 'InstaForex-Demo'),
  },
  {
    name: 'JustMarkets',
    domain: 'justmarkets.com',
    region: 'global',
    color: '#1E90FF',
    servers: s('JustMarkets-Live', 'JustMarkets-Demo'),
  },
  {
    name: 'LiteFinance',
    domain: 'litefinance.org',
    region: 'global',
    color: '#1E88E5',
    servers: s('LiteFinance-Live', 'LiteFinance-Demo'),
  },
  {
    name: 'MetaQuotes Demo',
    domain: 'metaquotes.net',
    region: 'global',
    color: '#4A90D9',
    servers: s('MetaQuotes-Demo', 'MetaQuotes-Demo2'),
  },
  {
    name: 'MetaTrader 4 Demo',
    domain: 'metatrader4.com',
    region: 'global',
    color: '#4A90D9',
    servers: s('MetaQuotes-Demo'),
  },
  {
    name: 'MetaTrader 5 Demo',
    domain: 'metatrader5.com',
    region: 'global',
    color: '#4A90D9',
    servers: s('AccessServer', 'MetaQuotes-Demo'),
  },
  {
    name: 'MultiBank Group',
    domain: 'multibankfx.com',
    region: 'global',
    color: '#003087',
    servers: s('MultiBank-Live', 'MultiBank-Demo'),
  },
  {
    name: 'OANDA',
    domain: 'oanda.com',
    region: 'global',
    color: '#00A3E0',
    servers: s('OANDA-Live', 'OANDA-Demo'),
  },
  {
    name: 'Octa',
    domain: 'octafx.com',
    region: 'global',
    color: '#00A651',
    servers: s('OctaFX-Live', 'OctaFX-Demo'),
  },
  {
    name: 'OctaFX',
    domain: 'octafx.com',
    region: 'global',
    color: '#00A651',
    servers: s('OctaFX-Live', 'OctaFX-Demo'),
  },
  {
    name: 'Pepperstone',
    domain: 'pepperstone.com',
    region: 'global',
    color: '#FF5000',
    servers: s('Pepperstone-MT5-Live01', 'Pepperstone-Demo', 'PepperstoneUK-Demo', 'Pepperstone-MT5-Demo01'),
  },
  {
    name: 'Pepperstone AU',
    domain: 'pepperstone.com.au',
    region: 'global',
    color: '#FF5000',
    servers: s('PepperstoneAU-Live', 'PepperstoneAU-Demo'),
  },
  {
    name: 'Pepperstone UK',
    domain: 'pepperstone.com',
    region: 'global',
    color: '#FF5000',
    servers: s('PepperstoneUK-Live', 'PepperstoneUK-Demo'),
  },
  {
    name: 'PrimeXBT',
    domain: 'primexbt.com',
    region: 'global',
    color: '#F0B90B',
    servers: s('PrimeXBT-Live', 'PrimeXBT-Demo'),
  },
  {
    name: 'PuPrime',
    domain: 'puprime.com',
    region: 'global',
    color: '#1A73E8',
    servers: s('PuPrime-Live', 'PuPrime-Demo'),
  },
  {
    name: 'RoboForex',
    domain: 'roboforex.com',
    region: 'global',
    color: '#E30613',
    servers: s('RoboForex-Pro', 'RoboForex-ECN', 'RoboForex-Demo'),
  },
  {
    name: 'StarTrader',
    domain: 'startrader.com',
    region: 'global',
    color: '#FFD700',
    servers: s('StarTrader-Live', 'StarTrader-Demo'),
  },
  {
    name: 'TMGM',
    domain: 'tmgm.com',
    region: 'global',
    color: '#0033A0',
    servers: s('TMGM-Live', 'TMGM-Demo'),
  },
  {
    name: 'ThinkMarkets',
    domain: 'thinkmarkets.com',
    region: 'global',
    color: '#00B2A9',
    servers: s('ThinkMarkets-Live', 'ThinkMarkets-Demo'),
  },
  {
    name: 'Tickmill',
    domain: 'tickmill.com',
    region: 'global',
    color: '#00A3E0',
    servers: s('Tickmill-Live', 'Tickmill-Demo', 'TickmillUK-Demo'),
  },
  {
    name: 'VT Markets',
    domain: 'vtmarkets.com',
    region: 'global',
    color: '#E31C23',
    servers: s('VTMarkets-Live', 'VTMarkets-Demo'),
  },
  {
    name: 'Vantage',
    domain: 'vantagemarkets.com',
    region: 'global',
    color: '#E31C23',
    servers: s('VantageInternational-Live', 'VantageInternational-Demo'),
  },
  {
    name: 'Vantage Markets',
    domain: 'vantagemarkets.com',
    region: 'global',
    color: '#E31C23',
    servers: s('VantageInternational-Live', 'VantageInternational-Demo'),
  },
  {
    name: 'XM',
    domain: 'xm.com',
    region: 'global',
    color: '#FF6600',
    servers: s('XM-Real', 'XMGlobal-MT5', 'XMGlobal-Demo', 'XM-Demo'),
  },
  {
    name: 'XM Global',
    domain: 'xm.com',
    region: 'global',
    color: '#FF6600',
    servers: s('XMGlobal-MT5', 'XMGlobal-Demo'),
  },
  {
    name: 'FTMO',
    domain: 'ftmo.com',
    region: 'prop',
    color: '#1A1A1A',
    servers: s('FTMO-Server', 'FTMO-MT5', 'FTMO-Demo'),
  },
  {
    name: 'FundedNext',
    domain: 'fundednext.com',
    region: 'prop',
    color: '#7C3AED',
    servers: s('FundedNext-Live', 'FundedNext-Demo'),
  },
  {
    name: 'FundingPips',
    domain: 'fundingpips.com',
    region: 'prop',
    color: '#5B8DEF',
    servers: s('FundingPips-Live', 'FundingPips-Demo'),
  },
  {
    name: 'The Funded Trader',
    domain: 'thefundedtraderprogram.com',
    region: 'prop',
    color: '#111111',
    servers: s('TFT-Live', 'TFT-Demo'),
  },
];

const BY_NAME = new Map(
  BROKER_RECORDS.map((b) => [b.name.toLowerCase(), b]),
);

export const BROKERS = BROKER_RECORDS.map((b) => b.name);

const BROKER_ALIASES: Record<string, string> = {
  icmarkets: 'IC Markets',
  icm: 'IC Markets',
  pepper: 'Pepperstone',
  pepperston: 'Pepperstone',
  xmtrading: 'XM',
  exnes: 'Exness',
  gt247: 'GT247',
  afriforesx: 'Afriforesx',
  roboforex: 'RoboForex',
  tickmil: 'Tickmill',
  hfm: 'HFM',
  hfmarkets: 'HF Markets',
  fundedpips: 'FundingPips',
  ftmoo: 'FTMO',
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
};

export function normalizeBrokerKey(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function levenshtein(a: string, b: string): number {
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

/** Generic tokens that alone should not rank a broker. */
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

function scoreBroker(query: string, name: string): number {
  const q = query.trim().toLowerCase();
  const qKey = normalizeBrokerKey(query);
  const n = name.toLowerCase();
  const nKey = normalizeBrokerKey(name);
  if (!qKey) return 0;
  if (n === q || nKey === qKey) return 1000;
  if (n.startsWith(q) || nKey.startsWith(qKey)) return 900;
  if (n.includes(q) || nKey.includes(qKey)) return 750;

  const qTokens = q.split(/[^a-z0-9]+/).filter(Boolean);
  const nTokens = n.split(/[^a-z0-9]+/).filter(Boolean);
  const distinctive = qTokens.filter((t) => !QUERY_STOPWORDS.has(t));
  const needed = distinctive.length > 0 ? distinctive : qTokens;

  const fuzzyKey = normalizeBrokerKey(needed.join(' '));
  if (fuzzyKey.length >= 2) {
    const dist = levenshtein(
      fuzzyKey,
      nKey.slice(0, Math.max(fuzzyKey.length + 2, fuzzyKey.length)),
    );
    if (dist <= Math.max(1, Math.floor(Math.max(fuzzyKey.length, 1) / 3))) {
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
  // Multi-word queries with distinctive tokens (e.g. "razor markets")
  // require at least one distinctive hit — "markets" alone is not enough.
  if (distinctive.length > 0 && distinctiveHits === 0) return 0;
  if (needed.length > 1 && distinctiveHits < Math.ceil(needed.length * 0.5)) {
    return 0;
  }
  if (hits === 0) return 0;
  return 400 + distinctiveHits * 120 + hits * 20;
}

export function getBrokerRecord(name: string): BrokerRecord | undefined {
  return BY_NAME.get(name.toLowerCase());
}

export function getBrokerServers(name: string): string[] {
  return getBrokerRecord(name)?.servers?.slice() || [];
}

export function brokerLogoUri(name: string): string | null {
  const rec = getBrokerRecord(name);
  if (!rec?.domain) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(rec.domain)}&sz=128`;
}

export function filterBrokers(query: string, limit = 20): string[] {
  const q = query.trim();
  const lim = Math.max(1, Math.min(50, limit));
  if (!q) {
    // Empty: SA first, then majors
    const za = BROKER_RECORDS.filter((b) => b.region === 'za').map((b) => b.name);
    const rest = BROKER_RECORDS.filter((b) => b.region !== 'za').map((b) => b.name);
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
  const out: string[] = [];
  if (aliasHit) out.push(aliasHit);
  for (const s of scored) {
    if (!out.includes(s.name)) out.push(s.name);
    if (out.length >= lim) break;
  }
  return out;
}

export function canUseCustomBroker(query: string): boolean {
  const q = query.trim();
  if (q.length < 2) return false;
  return !BROKERS.some(
    (b) =>
      b.toLowerCase() === q.toLowerCase() ||
      normalizeBrokerKey(b) === normalizeBrokerKey(q),
  );
}
