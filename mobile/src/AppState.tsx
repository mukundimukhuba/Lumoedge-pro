import {
  loadActiveMentorSession,
  persistActiveMentorSession,
} from './auth/mentorAuth';
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
  syncKeysFromManagedEa,
} from './licenseStorage';
import {
  eaPictureVaultKey,
  licensePictureVaultKey,
  vaultGetPicture,
  vaultPutEaPicture,
  vaultPutKeyPicture,
} from './pictureVault';
import { persistPictureRemote } from './supabase/eaPictureUpload';
import {
  fetchEaRemote,
  putEaBrandingRemote,
} from './licenses/remoteApi';
import {
  canManageEa,
  isSuperAdminEmail,
  normalizeMentorEmail,
} from './portal/mentorScope';

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
  /** Mentors Portal owner — isolates Manage EA / Generate Key catalogs. */
  ownerEmail?: string | null;
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
  /** Update managed EA name/picture and cascade to all keys + active Home. */
  updateEaBranding: (
    eaId: string,
    input: { name?: string; pictureUri?: string | null },
  ) => Promise<ManagedEa | null>;
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
  /** Pull latest managed-EA name/picture into the active Home session. */
  refreshActiveEaBranding: () => Promise<void>;
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
  const [mentor, setMentorState] = useState<MentorSession | null>(null);
  const setMentor = useCallback((m: MentorSession | null) => {
    setMentorState(m);
    void persistActiveMentorSession(m);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const restored = await loadActiveMentorSession();
      if (cancelled || !restored) return;
      setMentorState(restored);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [eas, setEas] = useState<ManagedEa[]>([]);
  const [licenseKeys, setLicenseKeys] = useState<LicenseKey[]>([]);
  const [eaAccess, setEaAccess] = useState<EaAccess | null>(null);
  const [activeEa, setActiveEa] = useState<ActiveEaSession | null>(null);
  const [accessReady, setAccessReady] = useState(false);

  const easRef = useRef(eas);
  const keysRef = useRef(licenseKeys);
  const activeEaRef = useRef(activeEa);
  easRef.current = eas;
  keysRef.current = licenseKeys;
  activeEaRef.current = activeEa;

  const applyCatalog = (nextEas: ManagedEa[], nextKeys: LicenseKey[]) => {
    setEas(nextEas);
    setLicenseKeys(nextKeys);
    easRef.current = nextEas;
    keysRef.current = nextKeys;
  };

  const catalogLoadOpts = useCallback(() => {
    const email = normalizeMentorEmail(mentor?.email);
    if (!email) return undefined;
    const admin = isSuperAdminEmail(email);
    return {
      scopeOwnerEmail: admin ? null : email,
      isSuperAdmin: admin,
    };
  }, [mentor?.email]);

  const refreshLicenseCatalog = useCallback(async () => {
    const catalog = await loadLicenseCatalog(catalogLoadOpts());
    applyCatalog(catalog.eas, catalog.keys);
    // Only re-persist when there is something to keep — never rewrite empty.
    // Quiet + skipRemote: local disk only (avoid re-push storms on focus).
    if (catalog.eas.length || catalog.keys.length) {
      await saveLicenseCatalog(catalog.eas, catalog.keys, {
        broadcast: false,
        skipRemote: true,
      });
    }
  }, [catalogLoadOpts]);

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
            if (!session.pictureUri && session.licenseKey) {
              const keyRow = catalog.keys.find((k) =>
                licenseKeysMatch(k.key, session.licenseKey),
              );
              if (keyRow?.eaPictureUri) {
                session = { ...session, pictureUri: keyRow.eaPictureUri };
              } else if (keyRow?.id) {
                const keyVault = await vaultGetPicture(
                  licensePictureVaultKey(keyRow.id),
                );
                if (keyVault) {
                  session = { ...session, pictureUri: keyVault };
                }
              }
            }
            setActiveEa(session);
            // Quotes selections are user-owned only — never seed from
            // session.symbols / EA defaults (AN-79).
          }
        }
        // Restore Quotes from AsyncStorage only (persist until user removes).
        if (loadedSetups.length) {
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

  // When a mentor signs in/out, reload catalog scoped to that mentor.
  useEffect(() => {
    void refreshLicenseCatalog();
  }, [mentor?.email, refreshLicenseCatalog]);

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

  const persistActiveSession = useCallback(async (session: ActiveEaSession) => {
    const diskSession =
      session.pictureUri && session.pictureUri.startsWith('data:')
        ? { ...session, pictureUri: null }
        : session;
    try {
      await AsyncStorage.setItem(ACTIVE_EA_KEY, JSON.stringify(diskSession));
    } catch {
      try {
        await AsyncStorage.setItem(
          ACTIVE_EA_KEY,
          JSON.stringify({ ...session, pictureUri: null }),
        );
      } catch {
        /* memory still holds branding */
      }
    }
  }, []);

  const applyBrandingToActive = useCallback(
    async (eaId: string, name: string, pictureUri: string | null) => {
      setActiveEa((prev) => {
        if (!prev || prev.eaId !== eaId) return prev;
        if (prev.name === name && prev.pictureUri === pictureUri) return prev;
        const next = { ...prev, name, pictureUri: pictureUri || prev.pictureUri };
        void persistActiveSession(next);
        return next;
      });
    },
    [persistActiveSession],
  );

  const addEa: AppStateValue['addEa'] = async (input) => {
    const ownerEmail =
      normalizeMentorEmail(mentor?.email) ||
      normalizeMentorEmail(input.ownerEmail) ||
      null;
    const pictureUri = await compressEaPicture(input.pictureUri);
    let ea: ManagedEa = {
      ...input,
      pictureUri,
      ownerEmail,
      id: uid('ea'),
      createdAt: new Date().toISOString(),
    };
    if (pictureUri) {
      await vaultPutEaPicture(ea.id, pictureUri);
    }
    const nextEas = [ea, ...easRef.current];
    applyCatalog(nextEas, keysRef.current);
    await saveLicenseCatalog(nextEas, keysRef.current, { skipRemote: true });
    // Push managed EA branding immediately (even before any key is issued).
    const remote = await putEaBrandingRemote(ea, {
      actorEmail: ownerEmail || mentor?.email || null,
    });
    if (remote.ok && (remote.pictureUri || remote.ea)) {
      const durable =
        remote.pictureUri || remote.ea?.pictureUri || ea.pictureUri;
      ea = {
        ...ea,
        name: remote.ea?.name || ea.name,
        pictureUri: durable,
      };
      applyCatalog(
        nextEas.map((e) => (e.id === ea.id ? ea : e)),
        keysRef.current,
      );
      await saveLicenseCatalog(
        easRef.current,
        keysRef.current,
        { skipRemote: true, broadcast: false },
      );
    }
    return ea;
  };

  const updateEaBranding: AppStateValue['updateEaBranding'] = async (
    eaId,
    input,
  ) => {
    const current = easRef.current.find((e) => e.id === eaId);
    if (!current) return null;
    if (!canManageEa(current, mentor?.email)) {
      return null;
    }
    let pictureUri = current.pictureUri;
    if (input.pictureUri !== undefined) {
      pictureUri = input.pictureUri
        ? (await compressEaPicture(input.pictureUri)) || input.pictureUri
        : null;
    }
    const name =
      input.name !== undefined
        ? input.name.trim() || current.name
        : current.name;
    let ea: ManagedEa = { ...current, name, pictureUri };
    if (pictureUri) {
      await vaultPutEaPicture(ea.id, pictureUri);
    }
    // Cascade branding onto every local key under this EA.
    let nextEas = easRef.current.map((e) => (e.id === eaId ? ea : e));
    let nextKeys = syncKeysFromManagedEa(nextEas, keysRef.current, eaId).keys;
    for (const k of nextKeys) {
      if (k.eaId === eaId && k.eaPictureUri) {
        await vaultPutKeyPicture(k.id, k.eaPictureUri);
      }
    }
    applyCatalog(nextEas, nextKeys);
    await saveLicenseCatalog(nextEas, nextKeys, { skipRemote: true });
    const remote = await putEaBrandingRemote(ea, {
      actorEmail: mentor?.email || ea.ownerEmail || null,
    });
    if (remote.ok) {
      const durable =
        remote.pictureUri || remote.ea?.pictureUri || ea.pictureUri;
      const remoteName = remote.ea?.name || ea.name;
      ea = { ...ea, name: remoteName, pictureUri: durable };
      nextEas = nextEas.map((e) => (e.id === eaId ? ea : e));
      nextKeys = syncKeysFromManagedEa(nextEas, nextKeys, eaId).keys;
      applyCatalog(nextEas, nextKeys);
      await saveLicenseCatalog(nextEas, nextKeys, {
        skipRemote: true,
        broadcast: false,
      });
    }
    await applyBrandingToActive(eaId, ea.name, ea.pictureUri);
    return ea;
  };

  const refreshActiveEaBranding: AppStateValue['refreshActiveEaBranding'] =
    useCallback(async () => {
      const session = activeEaRef.current;
      const raw = await AsyncStorage.getItem(ACTIVE_EA_KEY);
      let eaId = session?.eaId;
      let licenseKey = session?.licenseKey;
      if (!eaId && raw) {
        try {
          const parsed = JSON.parse(raw) as ActiveEaSession;
          eaId = parsed?.eaId;
          licenseKey = parsed?.licenseKey || licenseKey;
        } catch {
          /* ignore */
        }
      }
      if (!eaId) return;

      const catalog = await loadLicenseCatalog();
      applyCatalog(catalog.eas, catalog.keys);

      let live = catalog.eas.find((e) => e.id === eaId) || null;
      const remote = await fetchEaRemote(eaId);
      if (remote.ok && remote.ea) {
        live = {
          id: remote.ea.id,
          name: remote.ea.name,
          pictureUri: remote.ea.pictureUri,
          symbols: remote.ea.symbols || live?.symbols || [],
          createdAt:
            remote.ea.createdAt ||
            live?.createdAt ||
            new Date().toISOString(),
        };
        const nextEas = catalog.eas.some((e) => e.id === live!.id)
          ? catalog.eas.map((e) => (e.id === live!.id ? { ...e, ...live! } : e))
          : [live, ...catalog.eas];
        const synced = syncKeysFromManagedEa(nextEas, catalog.keys, eaId);
        applyCatalog(synced.eas, synced.keys);
        await saveLicenseCatalog(synced.eas, synced.keys, {
          skipRemote: true,
          broadcast: false,
        });
      }

      if (!live) return;
      const name = (live.name || '').trim() || session?.name || 'EA';
      let pictureUri = live.pictureUri;
      if (!pictureUri) {
        pictureUri =
          (await vaultGetPicture(eaPictureVaultKey(eaId))) ||
          session?.pictureUri ||
          null;
      }
      const nextSession: ActiveEaSession = {
        licenseKey: licenseKey || session?.licenseKey || '',
        eaId,
        name,
        pictureUri,
        symbols: session?.symbols?.length
          ? session.symbols
          : live.symbols || [],
        activatedAt: session?.activatedAt || new Date().toISOString(),
      };
      setActiveEa(nextSession);
      await persistActiveSession(nextSession);
    }, [persistActiveSession]);

  // Home: pull latest managed-EA branding (no re-activate required).
  useEffect(() => {
    if (!activeEa?.eaId) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const kick = () => {
      void refreshActiveEaBranding();
    };
    kick();
    timer = setInterval(kick, 20_000);
    const onFocus = () => kick();
    const onVis = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        kick();
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onFocus);
      document.addEventListener('visibilitychange', onVis);
    }
    return () => {
      if (timer) clearInterval(timer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onFocus);
        document.removeEventListener('visibilitychange', onVis);
      }
    };
  }, [activeEa?.eaId, refreshActiveEaBranding]);

  const generateLicenseKey: AppStateValue['generateLicenseKey'] = async (
    eaId,
    assignee,
  ) => {
    const ea = easRef.current.find((e) => e.id === eaId);
    if (!ea) return null;
    if (!canManageEa(ea, mentor?.email)) {
      return null;
    }
    // Snapshot the mentor-uploaded picture onto the key (compressed).
    const eaPictureUri =
      (await compressEaPicture(ea.pictureUri)) || ea.pictureUri;
    const issuer =
      normalizeMentorEmail(mentor?.email) ||
      normalizeMentorEmail(ea.ownerEmail) ||
      null;
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
      issuedByEmail: issuer,
      status: 'unused',
      activatedAt: null,
    };
    // Also keep compressed picture on the live EA so Manage EAs + Activate match.
    let nextEas = easRef.current.map((e) =>
      e.id === ea.id && eaPictureUri ? { ...e, pictureUri: eaPictureUri } : e,
    );
    let nextKeys = [row, ...keysRef.current];
    if (eaPictureUri) {
      await vaultPutEaPicture(ea.id, eaPictureUri);
      await vaultPutKeyPicture(row.id, eaPictureUri);
    }
    applyCatalog(nextEas, nextKeys);
    // Local first (skip remote bulk) then explicit single-key remote write.
    await saveLicenseCatalog(nextEas, nextKeys, { skipRemote: true });
    const liveEa = nextEas.find((e) => e.id === ea.id) || {
      ...ea,
      ownerEmail: ea.ownerEmail || issuer,
    };
    if (!liveEa.ownerEmail && issuer) {
      liveEa.ownerEmail = issuer;
    }
    const remote = await syncIssuedLicenseRemote(row, liveEa);
    // Prefer durable http URLs returned from sync so Activate/Home never lose the logo.
    if (remote.keyPictureUri || remote.eaPictureUri) {
      const durable =
        remote.keyPictureUri || remote.eaPictureUri || eaPictureUri;
      nextKeys = nextKeys.map((k) =>
        k.id === row.id ? { ...k, eaPictureUri: durable } : k,
      );
      nextEas = nextEas.map((e) =>
        e.id === ea.id ? { ...e, pictureUri: durable } : e,
      );
      applyCatalog(nextEas, nextKeys);
      row.eaPictureUri = durable;
    }
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
    let activatedKey: LicenseKey = {
      ...found.key,
      status: 'active',
      activatedAt,
    };

    // Recover logo from vault when catalog/remote stripped data: URLs.
    if (!activatedKey.eaPictureUri) {
      const fromKeyVault = await vaultGetPicture(
        licensePictureVaultKey(activatedKey.id),
      );
      const fromEaVault = await vaultGetPicture(
        eaPictureVaultKey(activatedKey.eaId),
      );
      const recovered = fromKeyVault || fromEaVault;
      if (recovered) {
        activatedKey = { ...activatedKey, eaPictureUri: recovered };
      }
    }

    const nextKeys = found.keys.map((k) =>
      k.id === activatedKey.id || licenseKeysMatch(k.key, activatedKey.key)
        ? {
            ...k,
            status: 'active',
            activatedAt,
            eaPictureUri: activatedKey.eaPictureUri || k.eaPictureUri,
          }
        : k,
    );
    let nextEas = found.eas.map((e) =>
      e.id === activatedKey.eaId && activatedKey.eaPictureUri && !e.pictureUri
        ? { ...e, pictureUri: activatedKey.eaPictureUri }
        : e,
    );
    applyCatalog(nextEas, nextKeys);
    await saveLicenseCatalog(nextEas, nextKeys, { skipRemote: true });
    const liveEa =
      nextEas.find((e) => e.id === activatedKey.eaId) || null;

    // Strict key → EA mapping (snapshot + matching eaId only).
    let session = sessionFromLicenseKey(activatedKey, nextEas);
    if (!session.pictureUri) {
      const vaultPic =
        (await vaultGetPicture(eaPictureVaultKey(session.eaId))) ||
        (await vaultGetPicture(licensePictureVaultKey(activatedKey.id)));
      if (vaultPic) session = { ...session, pictureUri: vaultPic };
    }
    if (session.pictureUri) {
      await vaultPutEaPicture(session.eaId, session.pictureUri);
      await vaultPutKeyPicture(activatedKey.id, session.pictureUri);
      // Prefer a durable http URL for ACTIVE_EA (localStorage quota + cross-device).
      if (session.pictureUri.startsWith('data:')) {
        const remoteUrl = await persistPictureRemote(
          `eas/${session.eaId}`,
          session.pictureUri,
        );
        if (remoteUrl && remoteUrl.startsWith('http')) {
          session = { ...session, pictureUri: remoteUrl };
          activatedKey = { ...activatedKey, eaPictureUri: remoteUrl };
          nextEas = nextEas.map((e) =>
            e.id === session.eaId ? { ...e, pictureUri: remoteUrl } : e,
          );
          applyCatalog(
            nextEas,
            nextKeys.map((k) =>
              k.id === activatedKey.id
                ? { ...k, eaPictureUri: remoteUrl }
                : k,
            ),
          );
        }
      }
    }
    void syncIssuedLicenseRemote(activatedKey, liveEa || nextEas.find((e) => e.id === session.eaId) || null);

    await persistActiveSession(session);
    setActiveEa(session);
    // Do not auto-select EA/license symbols into Quotes — user adds only.
    setStatus('running');
    return { ok: true, session };
  };

  const clearActiveEa = async () => {
    await AsyncStorage.removeItem(ACTIVE_EA_KEY);
    setActiveEa(null);
    // Keep Quotes selections until the user explicitly removes them.
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
      updateEaBranding,
      licenseKeys,
      generateLicenseKey,
      eaAccess,
      accessReady,
      unlockEaAccess,
      activeEa,
      activateLicenseKey,
      clearActiveEa,
      refreshLicenseCatalog,
      refreshActiveEaBranding,
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
      refreshActiveEaBranding,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppState outside provider');
  return v;
}
