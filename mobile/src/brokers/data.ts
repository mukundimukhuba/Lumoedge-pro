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
  // —— South Africa ——
  {
    name: 'EasyEquities',
    domain: 'easyequities.co.za',
    region: 'za',
    color: '#00A651',
    servers: s('EasyEquities-Live', 'EasyEquities-Demo'),
  },
  {
    name: 'GT247',
    domain: 'gt247.com',
    region: 'za',
    color: '#E30613',
    servers: s('GT247-Live', 'GT247-Demo', 'GT247-MT5'),
  },
  {
    name: 'Standard Bank OST',
    domain: 'standardbank.co.za',
    region: 'za',
    color: '#0033A0',
    servers: s('StandardBank-Live', 'StandardBank-Demo'),
  },
  {
    name: 'Absa Stockbrokers',
    domain: 'absa.co.za',
    region: 'za',
    color: '#BE0F34',
    servers: s('Absa-Live', 'Absa-Demo'),
  },
  {
    name: 'FNB Share Investing',
    domain: 'fnb.co.za',
    region: 'za',
    color: '#00A651',
    servers: s('FNB-Live', 'FNB-Demo'),
  },
  {
    name: 'Investec Securities',
    domain: 'investec.com',
    region: 'za',
    color: '#003C71',
    servers: s('Investec-Live', 'Investec-Demo'),
  },
  {
    name: 'PSG Wealth',
    domain: 'psg.co.za',
    region: 'za',
    color: '#00A0DF',
    servers: s('PSG-Live', 'PSG-Demo'),
  },
  {
    name: 'Sasfin Securities',
    domain: 'sasfin.com',
    region: 'za',
    color: '#1B3A6B',
    servers: s('Sasfin-Live', 'Sasfin-Demo'),
  },
  {
    name: 'Orange Securities',
    domain: 'orangesecurities.co.za',
    region: 'za',
    color: '#FF6600',
    servers: s('OrangeSec-Live', 'OrangeSec-Demo'),
  },
  {
    name: 'Sygnia Securities',
    domain: 'sygnia.co.za',
    region: 'za',
    color: '#6C2DC7',
    servers: s('Sygnia-Live', 'Sygnia-Demo'),
  },
  {
    name: 'Ninety One',
    domain: 'ninetyone.com',
    region: 'za',
    color: '#00A3E0',
    servers: s('NinetyOne-Live', 'NinetyOne-Demo'),
  },
  {
    name: 'Afriforesx',
    domain: 'afriforesx.com',
    region: 'za',
    color: '#C8102E',
    servers: s('Afriforesx-Live', 'Afriforesx-Demo', 'Afriforesx-MT5'),
  },
  {
    name: 'Accendo Markets',
    domain: 'accendomarkets.co.za',
    region: 'za',
    color: '#0B1F3A',
    servers: s('Accendo-Live', 'Accendo-Demo'),
  },
  {
    name: 'Bidvest Securities',
    domain: 'bidvest.co.za',
    region: 'za',
    color: '#E30613',
    servers: s('Bidvest-Live', 'Bidvest-Demo'),
  },
  {
    name: 'Satrix',
    domain: 'satrix.co.za',
    region: 'za',
    color: '#FF6600',
    servers: s('Satrix-Live', 'Satrix-Demo'),
  },
  {
    name: 'Razor Markets',
    domain: 'razormarkets.co.za',
    region: 'za',
    color: '#E10600',
    servers: s('RazorMarkets-Live', 'RazorMarkets-Demo', 'RazorMarkets-MT5'),
  },
  {
    name: 'RCG Markets',
    domain: 'rcgmarkets.com',
    region: 'za',
    color: '#0B3D91',
    servers: s('RCG-Live', 'RCG-Demo', 'RCGMarkets-MT5'),
  },
  {
    name: 'Banxso',
    domain: 'banxso.com',
    region: 'za',
    color: '#111111',
    servers: s('Banxso-Live', 'Banxso-Demo', 'Banxso-MT5'),
  },
  {
    name: 'Scope Markets',
    domain: 'scopemarkets.co.za',
    region: 'za',
    color: '#1A3C6E',
    servers: s('ScopeMarkets-Live', 'ScopeMarkets-Demo', 'ScopeMarkets-MT5'),
  },
  {
    name: 'Vault Markets',
    domain: 'vaultmarkets.co.za',
    region: 'za',
    color: '#6B2D5B',
    servers: s('VaultMarkets-Live', 'VaultMarkets-Demo', 'VaultMarkets-MT5'),
  },
  {
    name: 'JustMarkets SA',
    domain: 'justmarkets.com',
    region: 'za',
    color: '#00A651',
    servers: s('JustMarketsSA-Live', 'JustMarketsSA-Demo', 'JustMarkets-MT5'),
  },
  {
    name: 'FNB',
    domain: 'fnb.co.za',
    region: 'za',
    color: '#00A651',
    servers: s('FNB-Live', 'FNB-Demo', 'FNB-FX'),
  },
  {
    name: 'Standard Bank FX',
    domain: 'standardbank.co.za',
    region: 'za',
    color: '#0033A0',
    servers: s('StandardBankFX-Live', 'StandardBankFX-Demo', 'StandardBank-MT5'),
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

  // —— Global / MT5 majors ——
  {
    name: 'IC Markets',
    domain: 'icmarkets.com',
    region: 'global',
    color: '#E31C23',
    servers: s(
      'ICMarketsSC-Demo',
      'ICMarketsSC-MT5',
      'ICMarketsEU-Demo',
      'ICMarketsAU-Demo',
      'ICMarkets-Demo',
      'ICMarkets-Live',
    ),
  },
  {
    name: 'IC Markets AU',
    domain: 'icmarkets.com.au',
    region: 'global',
    color: '#E31C23',
    servers: s('ICMarketsAU-Demo', 'ICMarketsAU-Live'),
  },
  {
    name: 'IC Markets Global',
    domain: 'icmarkets.com',
    region: 'global',
    color: '#E31C23',
    servers: s('ICMarketsSC-Demo', 'ICMarketsSC-MT5'),
  },
  {
    name: 'Pepperstone',
    domain: 'pepperstone.com',
    region: 'global',
    color: '#FF5000',
    servers: s(
      'Pepperstone-Demo',
      'PepperstoneUK-Demo',
      'Pepperstone-MT5-Live01',
      'Pepperstone-MT5-Demo01',
    ),
  },
  {
    name: 'Pepperstone UK',
    domain: 'pepperstone.com',
    region: 'global',
    color: '#FF5000',
    servers: s('PepperstoneUK-Demo', 'PepperstoneUK-Live'),
  },
  {
    name: 'Pepperstone AU',
    domain: 'pepperstone.com.au',
    region: 'global',
    color: '#FF5000',
    servers: s('PepperstoneAU-Demo', 'PepperstoneAU-Live'),
  },
  {
    name: 'XM',
    domain: 'xm.com',
    region: 'global',
    color: '#FF6600',
    servers: s('XMGlobal-Demo', 'XMGlobal-MT5', 'XM-Demo', 'XM-Real'),
  },
  {
    name: 'XM Global',
    domain: 'xm.com',
    region: 'global',
    color: '#FF6600',
    servers: s('XMGlobal-Demo', 'XMGlobal-MT5'),
  },
  {
    name: 'Exness',
    domain: 'exness.com',
    region: 'global',
    color: '#FFD100',
    servers: s('Exness-MT5Trial', 'Exness-MT5Real', 'Exness-Trial', 'Exness-Real'),
  },
  {
    name: 'FTMO',
    domain: 'ftmo.com',
    region: 'prop',
    color: '#1A1A1A',
    servers: s('FTMO-Demo', 'FTMO-Server', 'FTMO-MT5'),
  },
  {
    name: 'FundingPips',
    domain: 'fundingpips.com',
    region: 'prop',
    color: '#5B8DEF',
    servers: s('FundingPips-Demo', 'FundingPips-Live'),
  },
  {
    name: 'FundedNext',
    domain: 'fundednext.com',
    region: 'prop',
    color: '#7C3AED',
    servers: s('FundedNext-Demo', 'FundedNext-Live'),
  },
  {
    name: 'The Funded Trader',
    domain: 'thefundedtraderprogram.com',
    region: 'prop',
    color: '#111111',
    servers: s('TFT-Demo', 'TFT-Live'),
  },
  {
    name: 'RoboForex',
    domain: 'roboforex.com',
    region: 'global',
    color: '#E30613',
    servers: s('RoboForex-Demo', 'RoboForex-Pro', 'RoboForex-ECN'),
  },
  {
    name: 'Tickmill',
    domain: 'tickmill.com',
    region: 'global',
    color: '#00A3E0',
    servers: s('Tickmill-Demo', 'TickmillUK-Demo', 'Tickmill-Live'),
  },
  {
    name: 'FP Markets',
    domain: 'fpmarkets.com',
    region: 'global',
    color: '#003087',
    servers: s('FPMarkets-Demo', 'FPMarkets-Live'),
  },
  {
    name: 'AvaTrade',
    domain: 'avatrade.com',
    region: 'global',
    color: '#00A0E3',
    servers: s('AvaTrade-Demo', 'Ava-Demo', 'Ava-Real'),
  },
  {
    name: 'OANDA',
    domain: 'oanda.com',
    region: 'global',
    color: '#00A3E0',
    servers: s('OANDA-Demo', 'OANDA-Live'),
  },
  {
    name: 'IG',
    domain: 'ig.com',
    region: 'global',
    color: '#DE002B',
    servers: s('IG-Demo', 'IG-Live', 'IGMarkets-Demo'),
  },
  {
    name: 'Plus500',
    domain: 'plus500.com',
    region: 'global',
    color: '#00A651',
    servers: s('Plus500CY-Demo', 'Plus500-Demo'),
  },
  {
    name: 'HFM',
    domain: 'hfm.com',
    region: 'global',
    color: '#E30613',
    servers: s('HFMarketsGlobal-Demo', 'HFMarketsGlobal-Live'),
  },
  {
    name: 'HF Markets',
    domain: 'hfm.com',
    region: 'global',
    color: '#E30613',
    servers: s('HFMarketsGlobal-Demo', 'HFMarketsGlobal-Live'),
  },
  {
    name: 'ThinkMarkets',
    domain: 'thinkmarkets.com',
    region: 'global',
    color: '#00B2A9',
    servers: s('ThinkMarkets-Demo', 'ThinkMarkets-Live'),
  },
  {
    name: 'Vantage',
    domain: 'vantagemarkets.com',
    region: 'global',
    color: '#E31C23',
    servers: s('VantageInternational-Demo', 'VantageInternational-Live'),
  },
  {
    name: 'Vantage Markets',
    domain: 'vantagemarkets.com',
    region: 'global',
    color: '#E31C23',
    servers: s('VantageInternational-Demo', 'VantageInternational-Live'),
  },
  {
    name: 'Eightcap',
    domain: 'eightcap.com',
    region: 'global',
    color: '#111111',
    servers: s('Eightcap-Demo', 'Eightcap-Live'),
  },
  {
    name: 'BlackBull Markets',
    domain: 'blackbull.com',
    region: 'global',
    color: '#000000',
    servers: s('BlackBullMarkets-Demo', 'BlackBullMarkets-Live'),
  },
  {
    name: 'Fusion Markets',
    domain: 'fusionmarkets.com',
    region: 'global',
    color: '#FF6A00',
    servers: s('FusionMarkets-Demo', 'FusionMarkets-Live'),
  },
  {
    name: 'Admiral Markets',
    domain: 'admiralmarkets.com',
    region: 'global',
    color: '#003366',
    servers: s('AdmiralsGroup-Demo', 'AdmiralsGroup-Live'),
  },
  {
    name: 'Admirals',
    domain: 'admirals.com',
    region: 'global',
    color: '#003366',
    servers: s('AdmiralsGroup-Demo', 'AdmiralsGroup-Live'),
  },
  {
    name: 'FBS',
    domain: 'fbs.com',
    region: 'global',
    color: '#E30613',
    servers: s('FBS-Demo', 'FBS-Real'),
  },
  {
    name: 'JustMarkets',
    domain: 'justmarkets.com',
    region: 'global',
    color: '#1E90FF',
    servers: s('JustMarkets-Demo', 'JustMarkets-Live'),
  },
  {
    name: 'Deriv',
    domain: 'deriv.com',
    region: 'global',
    color: '#FF444F',
    servers: s('Deriv-Demo', 'Deriv-Server'),
  },
  {
    name: 'MetaQuotes Demo',
    domain: 'metaquotes.net',
    region: 'global',
    color: '#4A90D9',
    servers: s('MetaQuotes-Demo', 'MetaQuotes-Demo2'),
  },
  {
    name: 'MetaTrader 5 Demo',
    domain: 'metatrader5.com',
    region: 'global',
    color: '#4A90D9',
    servers: s('MetaQuotes-Demo', 'AccessServer'),
  },
  {
    name: 'MetaTrader 4 Demo',
    domain: 'metatrader4.com',
    region: 'global',
    color: '#4A90D9',
    servers: s('MetaQuotes-Demo'),
  },
  {
    name: 'PrimeXBT',
    domain: 'primexbt.com',
    region: 'global',
    color: '#F0B90B',
    servers: s('PrimeXBT-Demo', 'PrimeXBT-Live'),
  },
  {
    name: 'Axi',
    domain: 'axi.com',
    region: 'global',
    color: '#E30613',
    servers: s('Axi-Demo', 'Axi-Live'),
  },
  {
    name: 'AxiTrader',
    domain: 'axi.com',
    region: 'global',
    color: '#E30613',
    servers: s('AxiTrader-Demo', 'AxiTrader-Live'),
  },
  {
    name: 'CMC Markets',
    domain: 'cmcmarkets.com',
    region: 'global',
    color: '#0033A0',
    servers: s('CMCMarkets-Demo', 'CMCMarkets-Live'),
  },
  {
    name: 'Forex.com',
    domain: 'forex.com',
    region: 'global',
    color: '#003366',
    servers: s('ForexCom-Demo', 'ForexCom-Live'),
  },
  {
    name: 'Interactive Brokers',
    domain: 'interactivebrokers.com',
    region: 'global',
    color: '#D9782D',
    servers: s('IBKR-Demo', 'IBKR-Live'),
  },
  {
    name: 'Saxo Bank',
    domain: 'home.saxo',
    region: 'global',
    color: '#00205B',
    servers: s('Saxo-Demo', 'Saxo-Live'),
  },
  {
    name: 'Capital.com',
    domain: 'capital.com',
    region: 'global',
    color: '#00C853',
    servers: s('CapitalCom-Demo', 'CapitalCom-Live'),
  },
  {
    name: 'eToro',
    domain: 'etoro.com',
    region: 'global',
    color: '#1DB954',
    servers: s('eToro-Demo', 'eToro-Live'),
  },
  {
    name: 'Trading 212',
    domain: 'trading212.com',
    region: 'global',
    color: '#00A3E0',
    servers: s('Trading212-Demo', 'Trading212-Live'),
  },
  {
    name: 'Dukascopy',
    domain: 'dukascopy.com',
    region: 'global',
    color: '#003366',
    servers: s('Dukascopy-Demo', 'Dukascopy-Live'),
  },
  {
    name: 'FXCM',
    domain: 'fxcm.com',
    region: 'global',
    color: '#0033A0',
    servers: s('FXCM-Demo', 'FXCM-Live'),
  },
  {
    name: 'FXPro',
    domain: 'fxpro.com',
    region: 'global',
    color: '#E30613',
    servers: s('FxPro-Demo', 'FxPro-Live'),
  },
  {
    name: 'FXOpen',
    domain: 'fxopen.com',
    region: 'global',
    color: '#FF6600',
    servers: s('FXOpen-Demo', 'FXOpen-Live'),
  },
  {
    name: 'InstaForex',
    domain: 'instaforex.com',
    region: 'global',
    color: '#E30613',
    servers: s('InstaForex-Demo', 'InstaForex-Live'),
  },
  {
    name: 'Octa',
    domain: 'octafx.com',
    region: 'global',
    color: '#00A651',
    servers: s('OctaFX-Demo', 'OctaFX-Live'),
  },
  {
    name: 'OctaFX',
    domain: 'octafx.com',
    region: 'global',
    color: '#00A651',
    servers: s('OctaFX-Demo', 'OctaFX-Live'),
  },
  {
    name: 'LiteFinance',
    domain: 'litefinance.org',
    region: 'global',
    color: '#1E88E5',
    servers: s('LiteFinance-Demo', 'LiteFinance-Live'),
  },
  {
    name: 'Alpari',
    domain: 'alpari.com',
    region: 'global',
    color: '#E30613',
    servers: s('Alpari-Demo', 'Alpari-Live'),
  },
  {
    name: 'HotForex',
    domain: 'hfm.com',
    region: 'global',
    color: '#E30613',
    servers: s('HotForex-Demo', 'HotForex-Live'),
  },
  {
    name: 'FXTM',
    domain: 'forextime.com',
    region: 'global',
    color: '#0033A0',
    servers: s('FXTM-Demo', 'FXTM-Live'),
  },
  {
    name: 'GO Markets',
    domain: 'gomarkets.com',
    region: 'global',
    color: '#00A651',
    servers: s('GOMarkets-Demo', 'GOMarkets-Live'),
  },
  {
    name: 'Global Prime',
    domain: 'globalprime.com.au',
    region: 'global',
    color: '#111111',
    servers: s('GlobalPrime-Demo', 'GlobalPrime-Live'),
  },
  {
    name: 'Blueberry Markets',
    domain: 'blueberrymarkets.com',
    region: 'global',
    color: '#4B0082',
    servers: s('Blueberry-Demo', 'Blueberry-Live'),
  },
  {
    name: 'TMGM',
    domain: 'tmgm.com',
    region: 'global',
    color: '#0033A0',
    servers: s('TMGM-Demo', 'TMGM-Live'),
  },
  {
    name: 'VT Markets',
    domain: 'vtmarkets.com',
    region: 'global',
    color: '#E31C23',
    servers: s('VTMarkets-Demo', 'VTMarkets-Live'),
  },
  {
    name: 'PuPrime',
    domain: 'puprime.com',
    region: 'global',
    color: '#1A73E8',
    servers: s('PuPrime-Demo', 'PuPrime-Live'),
  },
  {
    name: 'MultiBank Group',
    domain: 'multibankfx.com',
    region: 'global',
    color: '#003087',
    servers: s('MultiBank-Demo', 'MultiBank-Live'),
  },
  {
    name: 'StarTrader',
    domain: 'startrader.com',
    region: 'global',
    color: '#FFD700',
    servers: s('StarTrader-Demo', 'StarTrader-Live'),
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
