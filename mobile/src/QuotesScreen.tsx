/**
 * Full-screen Quotes page — horizontal stack push (not a bottom sheet).
 * Shares the blurred EA wallpaper with Home / Scanner / Connect.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useAppState,
  normalizeQuoteSetup,
  type QuoteSetup,
} from './AppState';
import {
  searchBrokerSymbols,
  type BrokerSymbol,
} from './brokers/api';
import { loadMt5Token } from './brokers/mt5Token';
import {
  cardForSymbol,
  filterFallbackSymbols,
  rematchBrokerSpelling,
  symbolsMatch,
} from './brokers/symbolMeta';
import { EaBlurWallpaper } from './EaBlurWallpaper';
import { EdgesBottomDock } from './EdgesBottomDock';
import { popToHome } from './navPush';

const BASE = {
  black: '#000000',
  white: '#FFFFFF',
  muted: '#9A9A9A',
};

type QuotesTab = 'allowed' | 'selected';

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function QuotesScreen() {
  const insets = useSafeAreaInsets();
  const {
    accent,
    selected,
    quoteSetups,
    upsertQuoteSetup,
    removeQuoteSetup,
  } = useAppState();
  const [mt5Token, setMt5Token] = useState<string | null>(null);
  const dockPad = Math.max(insets.bottom, Platform.OS === 'web' ? 12 : 8);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void (async () => {
        const t = await loadMt5Token();
        if (!cancelled) setMt5Token(t);
      })();
    };
    refresh();
    const iv = setInterval(refresh, 4000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  return (
    <View style={styles.root} testID="quotes-screen">
      <EaBlurWallpaper darken={0.18} />

      <View
        style={{
          paddingTop: Math.max(insets.top, 10),
          zIndex: 1,
        }}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="back"
            accessibilityRole="button"
            onPress={popToHome}
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
            <Text style={styles.title}>Quotes</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>
      </View>

      <View
        style={[
          styles.body,
          { paddingBottom: 88 + dockPad, zIndex: 1 },
        ]}
      >
        <QuotesPanel
          accent={accent}
          mt5Token={mt5Token}
          selected={selected}
          quoteSetups={quoteSetups}
          upsertQuoteSetup={upsertQuoteSetup}
          removeQuoteSetup={removeQuoteSetup}
          onDone={popToHome}
        />
      </View>

      <EdgesBottomDock onHomeRetap={popToHome} />
    </View>
  );
}

function QuotesPanel({
  accent,
  mt5Token,
  selected,
  quoteSetups,
  upsertQuoteSetup,
  removeQuoteSetup,
  onDone,
}: {
  accent: string;
  mt5Token: string | null;
  selected: string[];
  quoteSetups: QuoteSetup[];
  upsertQuoteSetup: (setup: QuoteSetup) => void;
  removeQuoteSetup: (symbol: string) => void;
  onDone: () => void;
}) {
  const [tab, setTab] = useState<QuotesTab>('allowed');
  const [query, setQuery] = useState('');
  const [brokerCards, setBrokerCards] = useState<BrokerSymbol[]>([]);
  const [brokerLoading, setBrokerLoading] = useState(false);
  const [brokerError, setBrokerError] = useState<string | null>(null);
  const [brokerTotal, setBrokerTotal] = useState(0);
  const [metaBySym, setMetaBySym] = useState<Record<string, BrokerSymbol>>(
    {},
  );
  const [promptSym, setPromptSym] = useState<string | null>(null);
  const [lotRaw, setLotRaw] = useState('0.01');
  const [tradesRaw, setTradesRaw] = useState('1');
  const searchGen = useRef(0);

  const connected = Boolean(String(mt5Token || '').trim());

  const setupBySym = useMemo(() => {
    const m = new Map<string, QuoteSetup>();
    for (const s of quoteSetups) m.set(s.symbol, s);
    return m;
  }, [quoteSetups]);

  useEffect(() => {
    if (!connected) {
      setBrokerCards([]);
      setBrokerError(null);
      setBrokerTotal(0);
      setBrokerLoading(false);
      return;
    }
    const token = String(mt5Token || '').trim();
    const gen = ++searchGen.current;
    const handle = setTimeout(() => {
      void (async () => {
        setBrokerLoading(true);
        setBrokerError(null);
        const res = await searchBrokerSymbols(token, query, 48);
        if (searchGen.current !== gen) return;
        setBrokerLoading(false);
        if (!res.ok) {
          setBrokerCards([]);
          setBrokerTotal(0);
          setBrokerError(res.error || 'Could not load broker symbols');
          return;
        }
        setBrokerCards(res.symbols);
        setBrokerTotal(res.total ?? res.symbols.length);
        setMetaBySym((prev) => {
          const next = { ...prev };
          for (const s of res.symbols) {
            next[s.symbol.toUpperCase()] = s;
          }
          return next;
        });
      })();
    }, 220);
    return () => clearTimeout(handle);
  }, [connected, mt5Token, query]);

  // Heal Selected spellings to match SymbolList exactly (e.g. .CENT → .cent).
  useEffect(() => {
    if (!brokerCards.length || !quoteSetups.length) return;
    for (const setup of quoteSetups) {
      const exact = rematchBrokerSpelling(setup.symbol, brokerCards);
      if (exact && exact !== setup.symbol) {
        upsertQuoteSetup({ ...setup, symbol: exact });
      }
    }
  }, [brokerCards, quoteSetups, upsertQuoteSetup]);

  const allowedCards = useMemo(() => {
    if (connected) return brokerCards;
    return filterFallbackSymbols(query);
  }, [connected, brokerCards, query]);

  const selectedCards = useMemo(() => {
    const q = query.trim().replace(/\s+/g, '').toUpperCase();
    return selected
      .filter((sym) => !q || sym.toUpperCase().includes(q))
      .map((sym) =>
        cardForSymbol(sym, metaBySym[sym.toUpperCase()] || null),
      );
  }, [selected, query, metaBySym]);

  const gridCards = tab === 'allowed' ? allowedCards : selectedCards;

  const openPrompt = (sym: string) => {
    const s = String(sym || '')
      .trim()
      .replace(/\s+/g, '');
    if (!s) return;
    // Prefer exact broker casing when we have a live match.
    const live =
      brokerCards.find((c) => symbolsMatch(c.symbol, s))?.symbol || s;
    const existing =
      setupBySym.get(live) ||
      [...setupBySym.entries()].find(([k]) => symbolsMatch(k, live))?.[1];
    setLotRaw(String(existing?.lotSize ?? 0.01));
    setTradesRaw(String(existing?.trades ?? 1));
    setPromptSym(live);
  };

  const confirmPrompt = () => {
    if (!promptSym) return;
    const lot = Number(lotRaw);
    const trades = Number(tradesRaw);
    const setup = normalizeQuoteSetup({
      symbol: promptSym,
      lotSize: lot,
      trades,
    });
    if (!setup) return;
    upsertQuoteSetup(setup);
    setPromptSym(null);
    setQuery('');
    setTab('selected');
  };

  const submitTyped = () => {
    const s = query.trim().replace(/\s+/g, '');
    if (!s) return;
    // Link the real broker symbol when autocomplete has an exact/prefix hit.
    const upper = s.toUpperCase();
    const exact = brokerCards.find((c) => symbolsMatch(c.symbol, s));
    const prefix = brokerCards.find((c) =>
      c.symbol.toUpperCase().startsWith(upper),
    );
    openPrompt(exact?.symbol || prefix?.symbol || s);
  };

  const hint = connected
    ? brokerLoading
      ? 'Loading symbols from your connected broker…'
      : brokerError
        ? `${brokerError} — you can still type a symbol.`
        : brokerTotal
          ? `${brokerTotal} symbols from this broker session.`
          : 'Broker connected — type to search its symbols.'
    : 'Connect MetaTrader to load this broker. You can still type a symbol.';

  return (
    <>
      <View style={styles.quotesTabRow}>
        <View style={styles.quotesTabPill}>
          {(
            [
              { id: 'allowed', label: 'Allowed Symbols' },
              { id: 'selected', label: 'Selected Symbols' },
            ] as const
          ).map((t) => {
            const on = tab === t.id;
            return (
              <Pressable
                key={t.id}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={t.label}
                onPress={() => setTab(t.id)}
                style={[
                  styles.quotesTabBtn,
                  on && {
                    backgroundColor: accent,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.quotesTabText,
                    on && styles.quotesTabTextOn,
                  ]}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View
        style={[
          styles.searchBox,
          styles.quotesSearchBox,
          { borderColor: 'rgba(255,255,255,0.18)' },
        ]}
      >
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Type or edit a symbol, e.g. XAUUSD.mic"
          placeholderTextColor={BASE.muted}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          style={styles.searchInput}
          onSubmitEditing={submitTyped}
          returnKeyType="done"
          accessibilityLabel="Type or edit a symbol"
        />
        {query.trim() ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Allow typed symbol"
            onPress={submitTyped}
            hitSlop={8}
          >
            <Ionicons name="add-circle" size={22} color={accent} />
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.quotesHint}>{hint}</Text>

      <FlatList
        data={gridCards}
        keyExtractor={(item) => item.symbol}
        numColumns={2}
        columnWrapperStyle={styles.quotesGridRow}
        style={styles.quotesGrid}
        contentContainerStyle={styles.quotesGridContent}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text style={styles.empty}>
            {tab === 'selected'
              ? query.trim()
                ? 'No selected match'
                : 'None selected — pick from Allowed Symbols or type one.'
              : brokerLoading
                ? 'Loading…'
                : query.trim()
                  ? 'No symbol match — press + to use what you typed'
                  : 'No symbols yet'}
          </Text>
        }
        renderItem={({ item }) => {
          const isSelected = selected.some((s) =>
            symbolsMatch(s, item.symbol),
          );
          const setup =
            setupBySym.get(item.symbol) ||
            [...setupBySym.entries()].find(([k]) =>
              symbolsMatch(k, item.symbol),
            )?.[1];
          return (
            <Pressable
              onPress={() => openPrompt(item.symbol)}
              onLongPress={
                tab === 'selected'
                  ? () => removeQuoteSetup(item.symbol)
                  : undefined
              }
              style={({ pressed }) => [
                styles.quoteCard,
                {
                  borderColor: isSelected
                    ? hexToRgba(accent, 0.65)
                    : 'rgba(120,160,220,0.35)',
                },
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${item.category} ${item.symbol}`}
            >
              <Text style={styles.quoteCardCategory}>{item.category}</Text>
              <Text style={styles.quoteCardTicker} numberOfLines={1}>
                {item.symbol}
              </Text>
              <Text style={styles.quoteCardDesc} numberOfLines={2}>
                {tab === 'selected' && setup
                  ? `${item.description} · ${setup.lotSize} lot · ${setup.trades}t`
                  : item.description}
              </Text>
              {tab === 'selected' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.symbol}`}
                  onPress={() => removeQuoteSetup(item.symbol)}
                  hitSlop={8}
                  style={styles.quoteCardRemove}
                >
                  <Ionicons name="close-circle" size={16} color={accent} />
                </Pressable>
              ) : null}
            </Pressable>
          );
        }}
      />

      <Pressable
        style={[
          styles.doneBtn,
          {
            borderColor: accent,
            backgroundColor: hexToRgba(accent, 0.18),
          },
        ]}
        onPress={onDone}
      >
        <Text style={styles.doneText}>
          done · {selected.length} selected · Auto Trade uses these
        </Text>
      </Pressable>

      <Modal
        visible={Boolean(promptSym)}
        transparent
        animationType="fade"
        onRequestClose={() => setPromptSym(null)}
      >
        <View style={styles.setupBackdrop}>
          <View
            style={[
              styles.setupCard,
              { borderColor: hexToRgba(accent, 0.55) },
            ]}
          >
            <Text style={styles.setupTitle}>{promptSym}</Text>
            <Text style={styles.setupHint}>
              {connected
                ? 'Link this broker symbol for Auto Trade — set lot size and trade count.'
                : 'Set lot size and how many trades for Auto Trade on this symbol.'}
            </Text>
            <Text style={styles.setupLabel}>Lot size</Text>
            <TextInput
              value={lotRaw}
              onChangeText={setLotRaw}
              keyboardType="decimal-pad"
              placeholder="0.01"
              placeholderTextColor={BASE.muted}
              style={[styles.setupInput, { borderColor: accent }]}
              accessibilityLabel="Lot size"
            />
            <Text style={styles.setupLabel}>How many trades</Text>
            <TextInput
              value={tradesRaw}
              onChangeText={setTradesRaw}
              keyboardType="number-pad"
              placeholder="1"
              placeholderTextColor={BASE.muted}
              style={[styles.setupInput, { borderColor: accent }]}
              accessibilityLabel="How many trades"
            />
            <View style={styles.setupActions}>
              <Pressable
                onPress={() => setPromptSym(null)}
                style={styles.setupCancel}
              >
                <Text style={styles.setupCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmPrompt}
                style={[
                  styles.setupConfirm,
                  {
                    borderColor: accent,
                    backgroundColor: hexToRgba(accent, 0.2),
                  },
                ]}
              >
                <Text style={styles.setupConfirmText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 8,
    gap: 10,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  headerTitles: { flex: 1, minWidth: 0 },
  headerSpacer: { width: 40 },
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
  body: {
    flex: 1,
    paddingHorizontal: 14,
    gap: 8,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  searchInput: {
    flex: 1,
    color: BASE.white,
    fontSize: 15,
    paddingVertical: 4,
    minHeight: 28,
    ...(Platform.OS === 'web'
      ? ({ outlineStyle: 'none', outlineWidth: 0 } as object)
      : null),
  },
  quotesTabRow: {
    alignItems: 'center',
    marginBottom: 4,
  },
  quotesTabPill: {
    flexDirection: 'row',
    borderRadius: 999,
    backgroundColor: 'rgba(20,20,20,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 3,
    gap: 2,
  },
  quotesTabBtn: {
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  quotesTabText: {
    color: BASE.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  quotesTabTextOn: {
    color: BASE.black,
  },
  quotesSearchBox: {
    borderRadius: 16,
    paddingVertical: Platform.OS === 'web' ? 12 : 10,
    marginTop: 4,
  },
  quotesHint: {
    color: BASE.muted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
    marginBottom: 4,
  },
  quotesGrid: {
    flex: 1,
  },
  quotesGridContent: {
    paddingBottom: 4,
    gap: 8,
  },
  quotesGridRow: {
    gap: 8,
  },
  quoteCard: {
    flexGrow: 1,
    flexBasis: '47%',
    maxWidth: '48.5%',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(8,10,14,0.82)',
    minHeight: 88,
  },
  quoteCardCategory: {
    color: BASE.muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  quoteCardTicker: {
    color: BASE.white,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  quoteCardDesc: {
    color: BASE.muted,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
    lineHeight: 16,
  },
  quoteCardRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  empty: {
    color: BASE.muted,
    fontSize: 13,
    lineHeight: 18,
    paddingVertical: 16,
    textAlign: 'center',
  },
  doneBtn: {
    marginTop: 8,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneText: {
    color: BASE.white,
    fontSize: 13,
    fontWeight: '700',
  },
  setupBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  setupCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    borderWidth: 1.5,
    backgroundColor: 'rgba(12,12,12,0.98)',
    padding: 16,
    gap: 8,
  },
  setupTitle: {
    color: BASE.white,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  setupHint: {
    color: BASE.muted,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 4,
  },
  setupLabel: {
    color: BASE.muted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  setupInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 8,
    color: BASE.white,
    fontSize: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    ...(Platform.OS === 'web'
      ? ({ outlineStyle: 'none', outlineWidth: 0 } as object)
      : null),
  },
  setupActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  setupCancel: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  setupCancelText: {
    color: BASE.muted,
    fontSize: 14,
    fontWeight: '600',
  },
  setupConfirm: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  setupConfirmText: {
    color: BASE.white,
    fontSize: 14,
    fontWeight: '700',
  },
});
