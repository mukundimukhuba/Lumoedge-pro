import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MentorSession } from './auth/mentorAuth';
import {
  compressEaPicture,
  findIssuedLicense,
  findLocalIssuedKey,
  licenseKeysMatch,
  loadLicenseCatalog,
  normalizeLicenseKey,
  saveLicenseCatalog,
  sessionFromLicenseKey,
  subscribeCatalogUpdated,
  syncIssuedLicenseRemote,
} from './licenseStorage';
import {
  eaPictureVaultKey,
  vaultGetPicture,
  vaultPutEaPicture,
} from './pictureVault';

const EA_ACCESS_KEY = 'edges-ea-access-v1';
const ACTIVE_EA_KEY = 'edges-active-ea-v1';
const QUOTE_SETUPS_KEY = 'edges-quote-setups-v1';

/** Per Quotes symbol — used by Auto Trade Start */
export type QuoteSetup = {
  symbol: string;
  lotSize: number;
  trades: number;
};

export function normalizeQuoteSetup(input: {
  symbol: string;
  lotSize?: number;
  trades?: number;
}): QuoteSetup | null {
  const symbol = String(input.symbol || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
  if (!symbol) return null;
  let lot = Number(input.lotSize);
  if (!Number.isFinite(lot) || lot <= 0) lot = 0.01;
  lot = Math.min(100, Math.max(0.01, Math.round(lot * 100) / 100));
  let trades = Math.round(Number(input.trades));
  if (!Number.isFinite(trades) || trades < 1) trades = 1;
  trades = Math.min(10, Math.max(1, trades));
  return { symbol, lotSize: lot, trades };
}

export type EaAccess = {
  email: string;
  name: string;
  unlockedAt: string;
  product: 'Lumo Edge Pro';
  priceUsd: 35;
};

export type BotStatus = 'running' | 'stopped' | 'removed';

export type ManagedEa = {
  id: string;
  name: string;
  /** Local image URI / data URL */
  pictureUri: string | null;
  symbols: string[];
  createdAt: string;
};

/** Issued key mapped to an EA (snapshot + live eaId). */
export type LicenseKey = {
  id: string;
  eaId: string;
  eaName: string;
  key: string;
  createdAt: string;
  /** Snapshot used when the user activates on the app */
  eaPictureUri: string | null;
  eaSymbols: string[];
  /** Client the mentor generated this key for */
  assigneeName?: string | null;
  assigneeEmail?: string | null;
  /** Mentor who generated the key */
  issuedByEmail?: string | null;
  /** unused | active | revoked */
  status?: string | null;
  activatedAt?: string | null;
};

/** Activated robot session on the EA control UI (requires a real license key). */
export type ActiveEaSession = {
  licenseKey: string;
  eaId: string;
  name: string;
  pictureUri: string | null;
  symbols: string[];
  activatedAt: string;
};

export const SYMBOLS = [
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'USDCHF',
  'AUDUSD',
  'USDCAD',
  'NZDUSD',
  'EURGBP',
  'EURJPY',
  'GBPJPY',
  'XAUUSD',
  'XAGUSD',
  'BTCUSD',
  'ETHUSD',
  'NAS100',
  'US30',
  'SPX500',
  'UK100',
  'GER40',
  'USOIL',
] as const;

export const ACCENTS = [
  { id: 'ferrari', value: '#FF0000', label: 'ferrari red' },
  { id: 'amber', value: '#FFB020', label: 'amber' },
  { id: 'cyan', value: '#3EE0FF', label: 'cyan' },
  { id: 'lime', value: '#C8F54A', label: 'lime' },
  { id: 'violet', value: '#C084FC', label: 'violet' },
  { id: 'rose', value: '#FF7A90', label: 'rose' },
] as const;

type AppStateValue = {
  status: BotStatus;
  setStatus: (s: BotStatus) => void;
  selected: string[];
  setSelected: (s: string[]) => void;
  quoteSetups: QuoteSetup[];
  upsertQuoteSetup: (setup: QuoteSetup) => void;
  removeQuoteSetup: (symbol: string) => void;
  getQuoteSetup: (symbol: string) => QuoteSetup | undefined;
  accent: string;
  setAccent: (c: string) => void;
  mentor: MentorSession | null;
  setMentor: (m: MentorSession | null) => void;
  eas: ManagedEa[];
  addEa: (
    ea: Omit<ManagedEa, 'id' | 'createdAt'>,
  ) => Promise<ManagedEa>;
  licenseKeys: LicenseKey[];
  generateLicenseKey: (
    eaId: string,
    assignee?: { name: string; email: string },
  ) => Promise<{
    key: LicenseKey;
    remote: { ok: boolean; via?: string; error?: string; hint?: string };
  } | null>;
  eaAccess: EaAccess | null;
  accessReady: boolean;
  /** Paid access only — does NOT open control UI without a license. */
  unlockEaAccess: (input: { email: string; name: string }) => Promise<EaAccess>;
  activeEa: ActiveEaSession | null;
  activateLicenseKey: (rawKey: string) => Promise<
    | { ok: true; session: ActiveEaSession }
    | { ok: false; error: string }
  >;
  clearActiveEa: () => Promise<void>;
  refreshLicenseCatalog: () => Promise<void>;
};

const Ctx = createContext<AppStateValue | null>(null);

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/** Unambiguous alphabet — no 0/O/1/I/L so mentor screenshots type cleanly. */
const LICENSE_KEY_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function makeLicenseKey() {
  const block = () => {
    let s = '';
    while (s.length < 4) {
      const i = Math.floor(Math.random() * LICENSE_KEY_ALPHABET.length);
      s += LICENSE_KEY_ALPHABET[i]!;
    }
    return s;
  };
  return `EDGES-${block()}-${block()}-${block()}-${block()}`;
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<BotStatus>('running');
  const [selected, setSelected] = useState<string[]>([]);
  const [quoteSetups, setQuoteSetups] = useState<QuoteSetup[]>([]);
  const quoteSetupsRef = useRef(quoteSetups);
  quoteSetupsRef.current = quoteSetups;
  const [accent, setAccent] = useState('#FF0000');
  const [mentor, setMentor] = useState<MentorSession | null>(null);
  const [eas, setEas] = useState<ManagedEa[]>([]);
  const [licenseKeys, setLicenseKeys] = useState<LicenseKey[]>([]);
  const [eaAccess, setEaAccess] = useState<EaAccess | null>(null);
  const [activeEa, setActiveEa] = useState<ActiveEaSession | null>(null);
  const [accessReady, setAccessReady] = useState(false);

  const easRef = useRef(eas);
  const keysRef = useRef(licenseKeys);
  easRef.current = eas;
  keysRef.current = licenseKeys;

  const applyCatalog = (nextEas: ManagedEa[], nextKeys: LicenseKey[]) => {
    setEas(nextEas);
    setLicenseKeys(nextKeys);
    easRef.current = nextEas;
    keysRef.current = nextKeys;
  };

  const refreshLicenseCatalog = useCallback(async () => {
    const catalog = await loadLicenseCatalog();
    applyCatalog(catalog.eas, catalog.keys);
    // Only re-persist when there is something to keep — never rewrite empty.
    // Quiet + skipRemote: local disk only (avoid re-push storms on focus).
    if (catalog.eas.length || catalog.keys.length) {
      await saveLicenseCatalog(catalog.eas, catalog.keys, {
        broadcast: false,
        skipRemote: true,
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [accessRaw, activeRaw, setupsRaw] = await Promise.all([
          AsyncStorage.getItem(EA_ACCESS_KEY),
          AsyncStorage.getItem(ACTIVE_EA_KEY),
          AsyncStorage.getItem(QUOTE_SETUPS_KEY),
        ]);
        const catalog = await loadLicenseCatalog();
        if (cancelled) return;
        if (accessRaw) {
          const parsed = JSON.parse(accessRaw) as EaAccess;
          if (parsed?.email && parsed?.name) setEaAccess(parsed);
        }
        applyCatalog(catalog.eas, catalog.keys);
        // Persist merged remote+local only when non-empty (no silent wipe).
        if (catalog.eas.length || catalog.keys.length) {
          await saveLicenseCatalog(catalog.eas, catalog.keys, {
            broadcast: false,
            skipRemote: true,
          });
        }
        let loadedSetups: QuoteSetup[] = [];
        if (setupsRaw) {
          try {
            const parsed = JSON.parse(setupsRaw) as QuoteSetup[];
            if (Array.isArray(parsed)) {
              loadedSetups = parsed
                .map((row) => normalizeQuoteSetup(row))
                .filter((x): x is QuoteSetup => Boolean(x));
            }
          } catch {
            loadedSetups = [];
          }
        }
        if (activeRaw) {
          const parsed = JSON.parse(activeRaw) as ActiveEaSession;
          if (parsed?.licenseKey && parsed?.name) {
            let session = parsed;
            if (!session.pictureUri && session.eaId) {
              const vaultPic = await vaultGetPicture(
                eaPictureVaultKey(session.eaId),
              );
              if (vaultPic) session = { ...session, pictureUri: vaultPic };
            }
            // Prefer live catalog picture if still missing.
            if (!session.pictureUri) {
              const live = catalog.eas.find((e) => e.id === session.eaId);
              if (live?.pictureUri) {
                session = { ...session, pictureUri: live.pictureUri };
              }
            }
            setActiveEa(session);
            const syms = session.symbols ?? [];
            setSelected(syms);
            // Keep setups for selected symbols; seed defaults for missing
            const bySym = new Map(
              loadedSetups.map((s) => [s.symbol, s] as const),
            );
            const synced = syms.map(
              (sym) =>
                bySym.get(sym) ||
                normalizeQuoteSetup({ symbol: sym })!,
            );
            setQuoteSetups(synced);
            loadedSetups = synced;
          } else if (loadedSetups.length) {
            setQuoteSetups(loadedSetups);
            setSelected(loadedSetups.map((s) => s.symbol));
          }
        } else if (loadedSetups.length) {
          setQuoteSetups(loadedSetups);
          setSelected(loadedSetups.map((s) => s.symbol));
        }
      } catch {
        /* ignore corrupt storage */
      } finally {
        if (!cancelled) setAccessReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep portal + Activate in sync (same tab custom event, BroadcastChannel,
  // cross-tab storage, and window focus).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const kick = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void refreshLicenseCatalog();
      }, 50);
    };
    const unsub = subscribeCatalogUpdated(kick);
    const onFocus = () => kick();
    const onVis = () => {
      if (document.visibilityState === 'visible') kick();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [refreshLicenseCatalog]);

  const unlockEaAccess: AppStateValue['unlockEaAccess'] = async ({
    email,
    name,
  }) => {
    const record: EaAccess = {
      email: email.trim().toLowerCase(),
      name: name.trim(),
      unlockedAt: new Date().toISOString(),
      product: 'Lumo Edge Pro',
      priceUsd: 35,
    };
    await AsyncStorage.setItem(EA_ACCESS_KEY, JSON.stringify(record));
    setEaAccess(record);
    return record;
  };

  const addEa: AppStateValue['addEa'] = async (input) => {
    const pictureUri = await compressEaPicture(input.pictureUri);
    const ea: ManagedEa = {
      ...input,
      pictureUri,
      id: uid('ea'),
      createdAt: new Date().toISOString(),
    };
    if (pictureUri) {
      await vaultPutEaPicture(ea.id, pictureUri);
    }
    const nextEas = [ea, ...easRef.current];
    applyCatalog(nextEas, keysRef.current);
    await saveLicenseCatalog(nextEas, keysRef.current);
    return ea;
  };

  const generateLicenseKey: AppStateValue['generateLicenseKey'] = async (
    eaId,
    assignee,
  ) => {
    const ea = easRef.current.find((e) => e.id === eaId);
    if (!ea) return null;
    // Snapshot the mentor-uploaded picture onto the key (compressed).
    const eaPictureUri =
      (await compressEaPicture(ea.pictureUri)) || ea.pictureUri;
    const row: LicenseKey = {
      id: uid('lic'),
      eaId: ea.id,
      eaName: ea.name,
      key: makeLicenseKey(),
      createdAt: new Date().toISOString(),
      eaPictureUri,
      eaSymbols: [...ea.symbols],
      assigneeName: assignee?.name?.trim() || null,
      assigneeEmail: assignee?.email?.trim().toLowerCase() || null,
      issuedByEmail: mentor?.email?.trim().toLowerCase() || null,
      status: 'unused',
      activatedAt: null,
    };
    // Also keep compressed picture on the live EA so Manage EAs + Activate match.
    const nextEas = easRef.current.map((e) =>
      e.id === ea.id && eaPictureUri ? { ...e, pictureUri: eaPictureUri } : e,
    );
    const nextKeys = [row, ...keysRef.current];
    applyCatalog(nextEas, nextKeys);
    // Local first (skip remote bulk) then explicit single-key remote write.
    await saveLicenseCatalog(nextEas, nextKeys, { skipRemote: true });
    const liveEa = nextEas.find((e) => e.id === ea.id) || ea;
    const remote = await syncIssuedLicenseRemote(row, liveEa);
    return { key: row, remote };
  };

  const persistQuoteSetups = useCallback(async (rows: QuoteSetup[]) => {
    try {
      await AsyncStorage.setItem(QUOTE_SETUPS_KEY, JSON.stringify(rows));
    } catch {
      /* ignore */
    }
  }, []);

  const setSelectedAndSyncSetups = useCallback(
    (syms: string[]) => {
      const clean = [
        ...new Set(
          syms
            .map((s) =>
              String(s || '')
                .trim()
                .replace(/\s+/g, '')
                .toUpperCase(),
            )
            .filter(Boolean),
        ),
      ];
      setSelected(clean);
      setQuoteSetups((prev) => {
        const bySym = new Map(prev.map((s) => [s.symbol, s] as const));
        const next = clean.map(
          (sym) => bySym.get(sym) || normalizeQuoteSetup({ symbol: sym })!,
        );
        void persistQuoteSetups(next);
        return next;
      });
    },
    [persistQuoteSetups],
  );

  const upsertQuoteSetup = useCallback(
    (setup: QuoteSetup) => {
      const normalized = normalizeQuoteSetup(setup);
      if (!normalized) return;
      setQuoteSetups((prev) => {
        const next = [
          ...prev.filter((s) => s.symbol !== normalized.symbol),
          normalized,
        ];
        void persistQuoteSetups(next);
        return next;
      });
      setSelected((prev) =>
        prev.includes(normalized.symbol)
          ? prev
          : [...prev, normalized.symbol],
      );
    },
    [persistQuoteSetups],
  );

  const removeQuoteSetup = useCallback(
    (symbol: string) => {
      const sym = String(symbol || '')
        .trim()
        .replace(/\s+/g, '')
        .toUpperCase();
      setQuoteSetups((prev) => {
        const next = prev.filter((s) => s.symbol !== sym);
        void persistQuoteSetups(next);
        return next;
      });
      setSelected((prev) => prev.filter((s) => s !== sym));
    },
    [persistQuoteSetups],
  );

  const getQuoteSetup = useCallback((symbol: string) => {
    const sym = String(symbol || '')
      .trim()
      .replace(/\s+/g, '')
      .toUpperCase();
    return quoteSetupsRef.current.find((s) => s.symbol === sym);
  }, []);

  const activateLicenseKey: AppStateValue['activateLicenseKey'] = async (
    rawKey,
  ) => {
    const key = normalizeLicenseKey(rawKey);
    if (!key.startsWith('EDGES-') || key.length < 20) {
      return { ok: false, error: 'Enter a valid EDGES-XXXX-XXXX-XXXX-XXXX key' };
    }

    const fromLocal = (pool: LicenseKey[]) => {
      const hit = findLocalIssuedKey(pool, key);
      if (!hit) return null;
      return {
        key: hit,
        eas: easRef.current,
        keys: pool.length ? pool : keysRef.current,
      };
    };

    // 1) Same-device React memory first (fingerprint / OCR-safe)
    let found = fromLocal(keysRef.current);

    // 2) Disk + cloud catalog (any browser worldwide via /api/licenses/lookup)
    if (!found) {
      found = await findIssuedLicense(key);
    }

    // 3) Refresh local+remote then retry (race after Generate on another tab)
    if (!found) {
      await refreshLicenseCatalog();
      found = fromLocal(keysRef.current) || (await findIssuedLicense(key));
    }

    if (!found) {
      const n = keysRef.current.length;
      const localHint =
        n === 1
          ? ` 1 key on this device (${keysRef.current[0]!.key}) — tap it below or re-type carefully (O vs 0).`
          : n > 1
            ? ` ${n} keys on this device — pick one from the list below.`
            : ' If your mentor just generated it, wait a moment and try again (cloud sync).';
      return {
        ok: false,
        error: `License key not found.${localHint}`,
      };
    }

    const activatedAt = new Date().toISOString();
    const activatedKey: LicenseKey = {
      ...found.key,
      status: 'active',
      activatedAt,
    };
    const nextKeys = found.keys.map((k) =>
      k.id === activatedKey.id || licenseKeysMatch(k.key, activatedKey.key)
        ? { ...k, status: 'active', activatedAt }
        : k,
    );
    applyCatalog(found.eas, nextKeys);
    await saveLicenseCatalog(found.eas, nextKeys, { skipRemote: true });
    const liveEa =
      found.eas.find((e) => e.id === activatedKey.eaId) || null;
    void syncIssuedLicenseRemote(activatedKey, liveEa);

    // Strict key → EA mapping (snapshot + matching eaId only).
    const session = sessionFromLicenseKey(activatedKey, found.eas);
    if (session.pictureUri) {
      await vaultPutEaPicture(session.eaId, session.pictureUri);
    }
    await AsyncStorage.setItem(ACTIVE_EA_KEY, JSON.stringify(session));
    setActiveEa(session);
    setSelectedAndSyncSetups(session.symbols);
    setStatus('running');
    return { ok: true, session };
  };

  const clearActiveEa = async () => {
    await AsyncStorage.removeItem(ACTIVE_EA_KEY);
    setActiveEa(null);
    setSelected([]);
    setQuoteSetups([]);
    void persistQuoteSetups([]);
    setStatus('stopped');
  };

  const value = useMemo(
    () => ({
      status,
      setStatus,
      selected,
      setSelected: setSelectedAndSyncSetups,
      quoteSetups,
      upsertQuoteSetup,
      removeQuoteSetup,
      getQuoteSetup,
      accent,
      setAccent,
      mentor,
      setMentor,
      eas,
      addEa,
      licenseKeys,
      generateLicenseKey,
      eaAccess,
      accessReady,
      unlockEaAccess,
      activeEa,
      activateLicenseKey,
      clearActiveEa,
      refreshLicenseCatalog,
    }),
    [
      status,
      selected,
      setSelectedAndSyncSetups,
      quoteSetups,
      upsertQuoteSetup,
      removeQuoteSetup,
      getQuoteSetup,
      accent,
      mentor,
      eas,
      licenseKeys,
      eaAccess,
      accessReady,
      activeEa,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppState outside provider');
  return v;
}
