import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppState } from './AppState';
import { EdgesBottomDock } from './EdgesBottomDock';

const BASE = {
  black: '#000000',
  white: '#FFFFFF',
  muted: '#8B8B8B',
  dim: '#5C5C5C',
  panel: 'rgba(10, 10, 10, 0.94)',
  green: '#00C853',
};

/** Expanded MT4/MT5 / CFD broker catalog for search + auto-suggest. */
export const BROKERS = [
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
  'NordFX',
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
  'Amarkets',
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
] as const;

/** Common misspellings / short names → catalog entry. */
const BROKER_ALIASES: Record<string, string> = {
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
  'robo forex': 'RoboForex',
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

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Lowercase + strip spaces/punctuation for fuzzy compare. */
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

function scoreBroker(query: string, name: string): number {
  const q = query.trim().toLowerCase();
  const qKey = normalizeBrokerKey(query);
  const n = name.toLowerCase();
  const nKey = normalizeBrokerKey(name);
  if (!qKey) return 0;
  if (n === q || nKey === qKey) return 1000;
  if (n.startsWith(q) || nKey.startsWith(qKey)) return 900 - Math.min(qKey.length, 40);
  if (n.includes(q) || nKey.includes(qKey)) return 750 - Math.min(nKey.indexOf(qKey), 40);
  // subsequence / typo tolerance
  const dist = levenshtein(qKey, nKey.slice(0, Math.max(qKey.length + 2, qKey.length)));
  const maxLen = Math.max(qKey.length, 1);
  if (dist <= Math.max(1, Math.floor(maxLen / 3))) {
    return 600 - dist * 40;
  }
  // token overlap
  const qTokens = q.split(/[^a-z0-9]+/).filter(Boolean);
  const nTokens = n.split(/[^a-z0-9]+/).filter(Boolean);
  let hits = 0;
  for (const t of qTokens) {
    if (nTokens.some((nt) => nt.startsWith(t) || t.startsWith(nt))) hits += 1;
  }
  if (hits > 0) return 400 + hits * 50;
  return 0;
}

export function filterBrokers(query: string, limit = 10): string[] {
  const q = query.trim();
  if (!q) return [...BROKERS].slice(0, limit);

  const qKey = normalizeBrokerKey(q);
  const aliasHit = BROKER_ALIASES[qKey] || BROKER_ALIASES[q.toLowerCase()];
  const scored = BROKERS.map((name) => ({
    name,
    score: scoreBroker(q, name),
  }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const out: string[] = [];
  if (aliasHit && !scored.some((s) => s.name === aliasHit && s.score >= 750)) {
    out.push(aliasHit);
  }
  for (const s of scored) {
    if (!out.includes(s.name)) out.push(s.name);
    if (out.length >= limit) break;
  }
  return out;
}

/** True when typed name is not an exact catalog match (offer custom). */
export function canUseCustomBroker(query: string): boolean {
  const q = query.trim();
  if (q.length < 2) return false;
  const exact = BROKERS.some(
    (b) => b.toLowerCase() === q.toLowerCase() || normalizeBrokerKey(b) === normalizeBrokerKey(q),
  );
  return !exact;
}

export function ConnectBrokerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accent } = useAppState();
  const dockPad = Math.max(insets.bottom, 10);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [server, setServer] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);

  const suggestions = useMemo(() => filterBrokers(query, 10), [query]);
  const showCustom = useMemo(() => canUseCustomBroker(query), [query]);
  const showSuggest =
    !selected && (searchFocused || query.trim().length > 0);

  const pickBroker = (name: string) => {
    setSelected(name);
    setQuery(name);
    setSearchFocused(false);
    setConnected(false);
    setError(null);
    setServer('');
    setLogin('');
    setPassword('');
  };

  const clearBroker = () => {
    setSelected(null);
    setQuery('');
    setConnected(false);
    setError(null);
    setServer('');
    setLogin('');
    setPassword('');
    setSearchFocused(true);
  };

  const onConnect = () => {
    if (!selected) {
      setError('Choose a broker from the suggestions.');
      return;
    }
    if (!server.trim() || !login.trim() || !password.trim()) {
      setError('Enter Server, Login, and Password.');
      return;
    }
    setError(null);
    setConnecting(true);
    // Demo link only — credentials are not persisted.
    setTimeout(() => {
      setConnecting(false);
      setConnected(true);
      setPassword('');
    }, 900);
  };

  const goHome = () => {
    router.replace('/');
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient
        colors={['#0A0000', '#050505', '#000000']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={{ paddingTop: Math.max(insets.top, 10) }}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="back"
            accessibilityRole="button"
            onPress={goHome}
            hitSlop={12}
            style={[
              styles.headerIconBtn,
              { borderColor: hexToRgba(accent, 0.4) },
            ]}
          >
            <Ionicons name="chevron-back" size={22} color={BASE.white} />
          </Pressable>
          <View style={styles.headerTitles}>
            <Text style={styles.eyebrow}>edges</Text>
            <Text style={styles.title}>Connect broker</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollBody,
          { paddingBottom: 88 + dockPad },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.lead}>
          Search your broker (fuzzy match), or use a custom name if it is not
          listed. Then enter MT5 Server, Login, and Password. Demo connect only
          — credentials are not stored.
        </Text>

        <Text style={styles.sectionLabel}>Broker</Text>
        <View
          style={[
            styles.searchWrap,
            {
              borderColor: hexToRgba(
                accent,
                searchFocused || selected ? 0.7 : 0.4,
              ),
            },
          ]}
        >
          <Ionicons name="search" size={18} color={accent} />
          <TextInput
            value={query}
            onChangeText={(t) => {
              setQuery(t);
              setSelected(null);
              setConnected(false);
              setError(null);
            }}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => {
              // Delay so suggestion press registers
              setTimeout(() => setSearchFocused(false), 180);
            }}
            placeholder="Search brokers…"
            placeholderTextColor={BASE.dim}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search brokers"
          />
          {query.length > 0 ? (
            <Pressable
              accessibilityLabel="Clear broker search"
              onPress={clearBroker}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={18} color={BASE.muted} />
            </Pressable>
          ) : null}
        </View>

        {showSuggest ? (
          <View
            style={[
              styles.suggestBox,
              { borderColor: hexToRgba(accent, 0.35) },
            ]}
          >
            {suggestions.length === 0 && !showCustom ? (
              <Text style={styles.suggestEmpty}>
                No brokers match — type a name to use custom
              </Text>
            ) : null}
            {suggestions.map((name, i) => (
              <Pressable
                key={name}
                accessibilityRole="button"
                accessibilityLabel={`Select ${name}`}
                onPress={() => pickBroker(name)}
                style={({ pressed }) => [
                  styles.suggestRow,
                  i > 0
                    ? {
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor: hexToRgba(accent, 0.2),
                      }
                    : null,
                  {
                    backgroundColor: pressed
                      ? hexToRgba(accent, 0.12)
                      : 'transparent',
                  },
                ]}
              >
                <Ionicons name="business-outline" size={16} color={accent} />
                <Text style={styles.suggestName}>{name}</Text>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={BASE.dim}
                />
              </Pressable>
            ))}
            {showCustom ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Use custom broker ${query.trim()}`}
                onPress={() => pickBroker(query.trim())}
                style={({ pressed }) => [
                  styles.suggestRow,
                  suggestions.length > 0
                    ? {
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor: hexToRgba(accent, 0.2),
                      }
                    : null,
                  {
                    backgroundColor: pressed
                      ? hexToRgba(accent, 0.12)
                      : hexToRgba(accent, 0.06),
                  },
                ]}
              >
                <Ionicons name="create-outline" size={16} color={accent} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.suggestName}>
                    Use “{query.trim()}”
                  </Text>
                  <Text style={styles.suggestHint}>Custom broker name</Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={BASE.dim}
                />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {selected ? (
          <View style={styles.formBlock}>
            <View
              style={[
                styles.pickedRow,
                { borderColor: hexToRgba(accent, 0.45) },
              ]}
            >
              <View style={styles.pickedLeft}>
                <Ionicons name="checkmark-circle" size={18} color={accent} />
                <Text style={styles.pickedName}>{selected}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Change broker"
                onPress={clearBroker}
              >
                <Text style={[styles.changeLink, { color: accent }]}>
                  Change
                </Text>
              </Pressable>
            </View>

            <Text style={styles.sectionLabel}>Credentials</Text>

            <Field
              accent={accent}
              label="Server"
              value={server}
              onChangeText={setServer}
              placeholder="e.g. ICMarkets-Demo01"
              autoCapitalize="none"
              accessibilityLabel="Server"
            />
            <Field
              accent={accent}
              label="Login"
              value={login}
              onChangeText={setLogin}
              placeholder="Account number"
              keyboardType="number-pad"
              accessibilityLabel="Login"
            />
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Password</Text>
              <View
                style={[
                  styles.fieldInputWrap,
                  { borderColor: hexToRgba(accent, 0.5) },
                ]}
              >
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Trading password"
                  placeholderTextColor={BASE.dim}
                  secureTextEntry={!showPass}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.fieldInput, { flex: 1 }]}
                  accessibilityLabel="Password"
                />
                <Pressable
                  accessibilityLabel={
                    showPass ? 'Hide password' : 'Show password'
                  }
                  onPress={() => setShowPass((v) => !v)}
                  hitSlop={8}
                >
                  <Ionicons
                    name={showPass ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={BASE.muted}
                  />
                </Pressable>
              </View>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {connected ? (
              <View
                style={[
                  styles.statusCard,
                  {
                    borderColor: hexToRgba(BASE.green, 0.55),
                    backgroundColor: hexToRgba(BASE.green, 0.1),
                  },
                ]}
              >
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={BASE.green}
                />
                <Text style={[styles.statusText, { color: BASE.green }]}>
                  {selected} linked · demo session ready
                </Text>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Connect broker"
                onPress={onConnect}
                disabled={connecting}
                style={({ pressed }) => [
                  styles.connectBtn,
                  {
                    borderColor: accent,
                    opacity: connecting || pressed ? 0.7 : 1,
                  },
                ]}
              >
                <LinearGradient
                  colors={[
                    hexToRgba(accent, 0.55),
                    hexToRgba(accent, 0.18),
                    '#0A0000',
                  ]}
                  start={{ x: 0.15, y: 0 }}
                  end={{ x: 0.85, y: 1 }}
                  style={styles.connectGrad}
                >
                  <Ionicons name="link-outline" size={18} color={BASE.white} />
                  <Text style={styles.connectText}>
                    {connecting ? 'Connecting…' : 'Connect'}
                  </Text>
                </LinearGradient>
              </Pressable>
            )}
          </View>
        ) : null}
      </ScrollView>

      <EdgesBottomDock />
    </View>
  );
}

function Field({
  accent,
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  accessibilityLabel,
}: {
  accent: string;
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'number-pad';
  autoCapitalize?: 'none' | 'sentences';
  accessibilityLabel: string;
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View
        style={[
          styles.fieldInputWrap,
          { borderColor: hexToRgba(accent, 0.5) },
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={BASE.dim}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          style={styles.fieldInput}
          accessibilityLabel={accessibilityLabel}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BASE.black },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 8,
    gap: 10,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BASE.panel,
  },
  headerTitles: { flex: 1 },
  headerSpacer: { width: 38 },
  eyebrow: {
    color: BASE.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    color: BASE.white,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  scroll: { flex: 1 },
  scrollBody: {
    paddingHorizontal: 16,
    paddingTop: 6,
    gap: 12,
  },
  lead: {
    color: BASE.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  sectionLabel: {
    color: BASE.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 14,
    backgroundColor: BASE.panel,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 12 : 10,
  },
  searchInput: {
    flex: 1,
    color: BASE.white,
    fontSize: 16,
    fontWeight: '600',
    ...(Platform.OS === 'web'
      ? ({ outlineStyle: 'none', outlineWidth: 0 } as object)
      : null),
  },
  suggestBox: {
    borderWidth: 1.5,
    borderRadius: 14,
    backgroundColor: BASE.panel,
    overflow: 'hidden',
    marginTop: -4,
  },
  suggestEmpty: {
    color: BASE.muted,
    fontSize: 13,
    padding: 14,
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  suggestName: {
    flex: 1,
    color: BASE.white,
    fontSize: 15,
    fontWeight: '600',
  },
  suggestHint: {
    color: BASE.muted,
    fontSize: 11,
    marginTop: 2,
  },
  formBlock: { gap: 12 },
  pickedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderRadius: 14,
    backgroundColor: BASE.panel,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  pickedLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  pickedName: {
    color: BASE.white,
    fontSize: 15,
    fontWeight: '700',
  },
  changeLink: { fontSize: 13, fontWeight: '700' },
  fieldBlock: { gap: 6 },
  fieldLabel: { color: BASE.muted, fontSize: 12, fontWeight: '600' },
  fieldInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 12,
    backgroundColor: BASE.panel,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 8,
  },
  fieldInput: {
    color: BASE.white,
    fontSize: 16,
    fontWeight: '600',
    ...(Platform.OS === 'web'
      ? ({ outlineStyle: 'none', outlineWidth: 0 } as object)
      : null),
  },
  errorText: {
    color: '#FF5252',
    fontSize: 13,
    fontWeight: '600',
  },
  connectBtn: {
    borderRadius: 14,
    borderWidth: 1.5,
    overflow: 'hidden',
    marginTop: 4,
  },
  connectGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  connectText: {
    color: BASE.white,
    fontWeight: '800',
    fontSize: 15,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
  },
  statusText: { flex: 1, fontSize: 13, fontWeight: '700' },
});
