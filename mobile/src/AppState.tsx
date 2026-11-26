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
  activateLicenseRemote,
  deleteLicenseRemote,
  fetchEaRemote,
  putEaBrandingRemote,
  validateLicenseRemote,
} from './licenses/remoteApi';
import { getOrCreateDeviceId } from './deviceId';
import {
  canManageEa,
  isSuperAdminEmail,
  normalizeMentorEmail,
} from './portal/mentorScope';
import {
  dedupeBrokerSymbols,
  healKnownBrokerSuffix,
  preserveBrokerSymbol,
  symbolsMatch,
} from './brokers/symbolMeta';
import {
  listScopedLicenseKeys,
  listSubscriptions,
  submitSubscription,
} from './subscriptions/remoteApi';
import {
  isSubscriptionUsable,
  pickPreferredClientSubscription,
  type SubscriptionRow,
} from './subscriptions/types';

/** External Cape Pulse checkout used by Access (not mentor portal). */
export const LUMO_EDGE_PRO_CHECKOUT_URL =
  'https://capepaulse.lovable.app/contact';

/** True only for a real submitted/listed subscription — never invent pending. */
export function isGenuineClientSubscription(
  row: SubscriptionRow | null | undefined,
): boolean {
  if (!row?.id) return false;
  const st = String(row.status || '').toLowerCase();
  if (!['pending', 'approved', 'declined', 'active', 'expired'].includes(st)) {
    return false;
  }
  // Cape Pulse checkout-started rows may omit email until the user links one.
  if (isCapePulseCheckoutPending(row)) return true;
  return Boolean(String(row.clientEmail || '').trim());
}

/** Local pending created when Access opens Cape Pulse (survives Back). */
export function isCapePulseCheckoutPending(
  row: SubscriptionRow | null | undefined,
): boolean {
  if (!row?.id) return false;
  const method = String(row.paymentMethod || '').toLowerCase();
  const ref = String(row.paymentReference || '');
  return (
    String(row.status || '').toLowerCase() === 'pending' &&
    method.includes('cape pulse') &&
    ref.startsWith('cape-pulse-')
  );
}

const EA_ACCESS_KEY = 'edges-ea-access-v1';
const ACTIVE_EA_KEY = 'edges-active-ea-v1';
const QUOTE_SETUPS_KEY = 'edges-quote-setups-v1';
const CLIENT_SUB_KEY = 'edges-client-subscription-v1';
const CLIENT_CHECKOUT_KEY = 'edges-client-checkout-v1';

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
  // Preserve exact broker SymbolList spelling; heal OCR .CENT → .cent.
  const symbol = healKnownBrokerSuffix(input.symbol);
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
  mentorId?: string | null;
  subscriptionId?: string | null;
  licenseDuration?: string | null;
  licenseStatus?: string | null;
  expiresAt?: string | null;
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
  /** False until local mentor session restore finishes (portal gate must wait). */
  mentorReady: boolean;
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
    assignee: {
      name: string;
      email: string;
      duration: string;
      subscriptionId?: string | null;
      regenerate?: boolean;
      challengeToken?: string | null;
    },
  ) => Promise<{
    key: LicenseKey;
    remote: {
      ok: boolean;
      via?: string;
      error?: string;
      hint?: string;
      code?: string;
    };
  } | null>;
  /** Mentor deletes one issued key — client loses access and must re-subscribe. */
  deleteLicenseKey: (keyId: string) => Promise<
    | { ok: true }
    | { ok: false; error: string }
  >;
  eaAccess: EaAccess | null;
  accessReady: boolean;
  /** True after we resolved whether this client has a real subscription. */
  subscriptionReady: boolean;
  clientSubscription: SubscriptionRow | null;
  /** Genuine pending/declined/expired payment wait (not mentor portal pending). */
  isClientPaymentPending: boolean;
  canAccessLicenseSection: boolean;
  /** Submit payment → pending subscription; stores client identity. */
  unlockEaAccess: (input: {
    email: string;
    name: string;
    paymentMethod: string;
    paymentReference: string;
    paymentProof?: string;
  }) => Promise<
    | { ok: true; access: EaAccess; subscription: SubscriptionRow }
    | { ok: false; error: string }
  >;
  /**
   * Access register: create a real pending subscription (Supabase 008), then
   * optionally open an external pay link. No payment-site callbacks — Super
   * Admin verifies manually. Persists session so waiting UI shows this email.
   */
  beginClientCheckout: (input: {
    name: string;
    email: string;
  }) => Promise<
    | { ok: true; checkoutUrl: string; subscription: SubscriptionRow }
    | { ok: false; error: string }
  >;
  refreshClientSubscription: () => Promise<SubscriptionRow | null>;
  /**
   * Leave client session to re-register. Does not delete server subscription
   * rows; optionally keeps local subscription cache for the old email.
   */
  clearClientAccessSession: (opts?: {
    keepSubscriptionRecord?: boolean;
  }) => Promise<void>;
  refreshScopedLicenseKeys: (opts: {
    role: 'mentor' | 'client';
    email: string;
  }) => Promise<LicenseKey[]>;
  activeEa: ActiveEaSession | null;
  activateLicenseKey: (rawKey: string) => Promise<
    | { ok: true; session: ActiveEaSession }
    | { ok: false; error: string }
  >;
  clearActiveEa: (opts?: { requireResubscribe?: boolean }) => Promise<void>;
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
  const [mentorReady, setMentorReady] = useState(false);
  const setMentor = useCallback((m: MentorSession | null) => {
    setMentorState(m);
    void persistActiveMentorSession(m);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const restored = await loadActiveMentorSession();
        if (!cancelled && restored) setMentorState(restored);
      } finally {
        if (!cancelled) setMentorReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [eas, setEas] = useState<ManagedEa[]>([]);
  const [licenseKeys, setLicenseKeys] = useState<LicenseKey[]>([]);
  const [eaAccess, setEaAccess] = useState<EaAccess | null>(null);
  const [clientSubscription, setClientSubscription] =
    useState<SubscriptionRow | null>(null);
  const [subscriptionReady, setSubscriptionReady] = useState(false);
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
    // Always pass scopeOwnerEmail so EAs stay owner-scoped (SA included).
    // isSuperAdmin only expands license-key oversight, never EA catalogs.
    return {
      scopeOwnerEmail: email,
      isSuperAdmin: admin,
    };
  }, [mentor?.email]);

  /** Bumps on each catalog refresh so stale unscoped fetches cannot overwrite. */
  const catalogEpochRef = useRef(0);

  const refreshLicenseCatalog = useCallback(async () => {
    const epoch = ++catalogEpochRef.current;
    const opts = catalogLoadOpts();
    const catalog = await loadLicenseCatalog(opts);
    if (epoch !== catalogEpochRef.current) return;
    applyCatalog(catalog.eas, catalog.keys);
    // Portal-scoped: always persist (allow empty) so other mentors' disk rows
    // from a prior unscoped hydrate are purged.
    const scopedPortal = Boolean(opts?.scopeOwnerEmail);
    if (catalog.eas.length || catalog.keys.length || scopedPortal) {
      await saveLicenseCatalog(catalog.eas, catalog.keys, {
        broadcast: false,
        skipRemote: true,
        allowEmpty: scopedPortal,
      });
    }
  }, [catalogLoadOpts]);

  // Wait for mentor session restore so the first catalog load is already scoped
  // (avoids flashing / persisting every mentor's EAs into Manage EAs).
  useEffect(() => {
    if (!mentorReady) return;
    let cancelled = false;
    (async () => {
      try {
        const [accessRaw, activeRaw, setupsRaw, subRaw] = await Promise.all([
          AsyncStorage.getItem(EA_ACCESS_KEY),
          AsyncStorage.getItem(ACTIVE_EA_KEY),
          AsyncStorage.getItem(QUOTE_SETUPS_KEY),
          AsyncStorage.getItem(CLIENT_SUB_KEY),
        ]);
        const epoch = ++catalogEpochRef.current;
        const catalog = await loadLicenseCatalog(catalogLoadOpts());
        if (cancelled || epoch !== catalogEpochRef.current) return;
        if (accessRaw) {
          const parsed = JSON.parse(accessRaw) as EaAccess;
          // Checkout-started sessions may have empty email until linked.
          if (parsed?.name) setEaAccess(parsed);
        }
        if (subRaw) {
          try {
            const parsed = JSON.parse(subRaw) as SubscriptionRow;
            if (isGenuineClientSubscription(parsed)) {
              setClientSubscription(parsed);
            } else {
              await AsyncStorage.removeItem(CLIENT_SUB_KEY);
            }
          } catch {
            /* ignore */
          }
        }
        applyCatalog(catalog.eas, catalog.keys);
        const scopedPortal = Boolean(catalogLoadOpts()?.scopeOwnerEmail);
        if (catalog.eas.length || catalog.keys.length || scopedPortal) {
          await saveLicenseCatalog(catalog.eas, catalog.keys, {
            broadcast: false,
            skipRemote: true,
            allowEmpty: scopedPortal,
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
  }, [mentorReady, catalogLoadOpts]);

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

  const clearClientAccessSession = useCallback(
    async (opts?: { keepSubscriptionRecord?: boolean }) => {
      try {
        await AsyncStorage.removeItem(EA_ACCESS_KEY);
        await AsyncStorage.removeItem(CLIENT_CHECKOUT_KEY);
        if (!opts?.keepSubscriptionRecord) {
          await AsyncStorage.removeItem(CLIENT_SUB_KEY);
        }
      } catch {
        /* ignore */
      }
      setEaAccess(null);
      if (!opts?.keepSubscriptionRecord) {
        setClientSubscription(null);
      }
      setSubscriptionReady(true);
    },
    [],
  );

  const refreshClientSubscription = useCallback(async () => {
    const email = eaAccess?.email?.trim().toLowerCase();

    const readLocal = async (): Promise<SubscriptionRow | null> => {
      try {
        const raw = await AsyncStorage.getItem(CLIENT_SUB_KEY);
        if (!raw) return null;
        const local = JSON.parse(raw) as SubscriptionRow;
        if (!isGenuineClientSubscription(local)) return null;
        // Cape Pulse checkout rows survive without a linked email.
        if (isCapePulseCheckoutPending(local)) return local;
        if (
          email &&
          String(local.clientEmail || '')
            .toLowerCase()
            .trim() === email
        ) {
          return local;
        }
      } catch {
        /* ignore */
      }
      return null;
    };

    const dropStaleClientSession = async () => {
      // Keep an active EA session — don't kick a trading user to onboarding
      // just because subscription lookup returned empty.
      if (activeEaRef.current) return;
      try {
        await AsyncStorage.removeItem(CLIENT_SUB_KEY);
        await AsyncStorage.removeItem(EA_ACCESS_KEY);
        await AsyncStorage.removeItem(CLIENT_CHECKOUT_KEY);
      } catch {
        /* ignore */
      }
      setClientSubscription(null);
      setEaAccess(null);
    };

    // No email yet — keep a local Cape Pulse checkout pending (Back → waiting).
    if (!email) {
      const local = await readLocal();
      if (local) {
        setClientSubscription(local);
        setSubscriptionReady(true);
        return local;
      }
      setClientSubscription(null);
      setSubscriptionReady(true);
      return null;
    }

    const res = await listSubscriptions({
      role: 'client',
      actorEmail: email,
      clientEmail: email,
    });

    if (res.ok) {
      const genuine = res.subscriptions.filter((s) =>
        isGenuineClientSubscription(s),
      );
      // Prefer active/approved over a newer pending re-checkout row.
      const latest = pickPreferredClientSubscription(genuine);
      if (latest) {
        setClientSubscription(latest);
        try {
          await AsyncStorage.setItem(CLIENT_SUB_KEY, JSON.stringify(latest));
          await AsyncStorage.removeItem(CLIENT_CHECKOUT_KEY);
        } catch {
          /* ignore */
        }
        setSubscriptionReady(true);
        return latest;
      }
      // Empty remote list → no admin-visible pending. Drop local-only fakes
      // (do not keep Cape Pulse local rows that never reached the server).
      await dropStaleClientSession();
      if (!activeEaRef.current) {
        setClientSubscription(null);
      }
      setSubscriptionReady(true);
      return null;
    }

    // Network / API failure — keep a genuine local row only; never invent pending.
    const local = await readLocal();
    if (local) {
      setClientSubscription(local);
      setSubscriptionReady(true);
      return local;
    }
    await dropStaleClientSession();
    if (!activeEaRef.current) {
      setClientSubscription(null);
    }
    setSubscriptionReady(true);
    return null;
  }, [eaAccess?.email]);

  useEffect(() => {
    if (!eaAccess) {
      setSubscriptionReady(true);
      return;
    }
    // Soft refresh only — never flip ready→false (that remounted Home → Loading
    // → Home on every open after AsyncStorage hydrate set eaAccess).
    void refreshClientSubscription();
  }, [eaAccess?.email, eaAccess?.unlockedAt, refreshClientSubscription]);

  const canAccessLicenseSection = isSubscriptionUsable(
    clientSubscription?.status,
  );

  // Active/approved must never route to PaymentPending/Declined screens.
  const isClientPaymentPending = Boolean(
    isGenuineClientSubscription(clientSubscription) &&
      !isSubscriptionUsable(clientSubscription?.status),
  );

  const beginClientCheckout: AppStateValue['beginClientCheckout'] = async ({
    name,
    email,
  }) => {
    const clientName = name.trim();
    const clientEmail = email.trim().toLowerCase();
    if (!clientName) return { ok: false, error: 'Enter your name' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
      return { ok: false, error: 'Enter a valid email' };
    }

    // Already approved/active → reuse that subscription. Do not create a new
    // pending row that would kick the client back to "Approval pending".
    const existing = await listSubscriptions({
      role: 'client',
      actorEmail: clientEmail,
      clientEmail,
    });
    if (existing.ok) {
      const preferred = pickPreferredClientSubscription(
        existing.subscriptions.filter((s) => isGenuineClientSubscription(s)),
      );
      if (preferred && isSubscriptionUsable(preferred.status)) {
        const now = new Date().toISOString();
        const access: EaAccess = {
          email: clientEmail,
          name: clientName || preferred.clientName || '',
          unlockedAt: now,
          product: 'Lumo Edge Pro',
          priceUsd: preferred.amountUsd || 35,
        };
        try {
          await AsyncStorage.setItem(
            CLIENT_SUB_KEY,
            JSON.stringify(preferred),
          );
          await AsyncStorage.setItem(EA_ACCESS_KEY, JSON.stringify(access));
          await AsyncStorage.removeItem(CLIENT_CHECKOUT_KEY);
        } catch {
          return { ok: false, error: 'Could not save access state' };
        }
        setClientSubscription(preferred);
        setEaAccess(access);
        setSubscriptionReady(true);
        return {
          ok: true,
          checkoutUrl: '',
          subscription: preferred,
        };
      }
    }

    const ref = `cape-pulse-${Date.now()}`;

    // Register pending in Supabase first. External pay is optional and never
    // auto-linked — Super Admin Approves/Declines manually in the portal.
    const submitted = await submitSubscription({
      clientName,
      clientEmail,
      paymentMethod: 'Cape Pulse',
      paymentReference: ref,
      paymentProof: ref,
      amountUsd: 35,
    });
    if (!submitted.ok) {
      return { ok: false, error: submitted.error };
    }
    // Storage-only fallback is not visible/approvable in Super Admin list
    // until migration 008 (subscriptions table + RPCs) is applied.
    if (submitted.via === 'storage') {
      return {
        ok: false,
        error:
          'Payment registration is not fully set up yet. Please try again later or contact support.',
      };
    }

    const serverSub: SubscriptionRow = {
      ...submitted.subscription,
      clientName: submitted.subscription.clientName || clientName,
      clientEmail: submitted.subscription.clientEmail || clientEmail,
      paymentMethod: submitted.subscription.paymentMethod || 'Cape Pulse',
      paymentReference: submitted.subscription.paymentReference || ref,
      status: (submitted.subscription.status || 'pending') as SubscriptionRow['status'],
    };
    const alreadyUsable = isSubscriptionUsable(serverSub.status);
    const now = new Date().toISOString();
    const access: EaAccess = {
      email: clientEmail,
      name: clientName,
      unlockedAt: now,
      product: 'Lumo Edge Pro',
      priceUsd: 35,
    };
    try {
      await AsyncStorage.setItem(CLIENT_SUB_KEY, JSON.stringify(serverSub));
      await AsyncStorage.setItem(EA_ACCESS_KEY, JSON.stringify(access));
      if (alreadyUsable) {
        await AsyncStorage.removeItem(CLIENT_CHECKOUT_KEY);
      } else {
        await AsyncStorage.setItem(
          CLIENT_CHECKOUT_KEY,
          JSON.stringify({
            id: serverSub.id,
            startedAt: now,
            checkoutUrl: LUMO_EDGE_PRO_CHECKOUT_URL,
            clientEmail,
            clientName,
          }),
        );
      }
    } catch {
      return { ok: false, error: 'Could not save checkout state' };
    }
    setClientSubscription(serverSub);
    setEaAccess(access);
    setSubscriptionReady(true);

    return {
      ok: true,
      checkoutUrl: alreadyUsable ? '' : LUMO_EDGE_PRO_CHECKOUT_URL,
      subscription: serverSub,
    };
  };

  const unlockEaAccess: AppStateValue['unlockEaAccess'] = async ({
    email,
    name,
    paymentMethod,
    paymentReference,
    paymentProof,
  }) => {
    const submitted = await submitSubscription({
      clientName: name.trim(),
      clientEmail: email.trim().toLowerCase(),
      paymentMethod: paymentMethod.trim(),
      paymentReference: paymentReference.trim(),
      paymentProof: paymentProof?.trim() || paymentReference.trim(),
      amountUsd: 35,
    });
    if (!submitted.ok) {
      return { ok: false, error: submitted.error };
    }
    const record: EaAccess = {
      email: email.trim().toLowerCase(),
      name: name.trim(),
      unlockedAt: new Date().toISOString(),
      product: 'Lumo Edge Pro',
      priceUsd: 35,
    };
    await AsyncStorage.setItem(EA_ACCESS_KEY, JSON.stringify(record));
    await AsyncStorage.setItem(
      CLIENT_SUB_KEY,
      JSON.stringify(submitted.subscription),
    );
    try {
      await AsyncStorage.removeItem(CLIENT_CHECKOUT_KEY);
    } catch {
      /* ignore */
    }
    setEaAccess(record);
    setClientSubscription(submitted.subscription);
    return {
      ok: true,
      access: record,
      subscription: submitted.subscription,
    };
  };

  // Must be stable — LicenseActivateScreen effect depends on this; a new
  // identity each render re-triggers "Preparing license…" forever.
  const refreshScopedLicenseKeys: AppStateValue['refreshScopedLicenseKeys'] =
    useCallback(async ({ role, email }) => {
      const normalized = email.trim().toLowerCase();
      if (!normalized) return [];
      const res = await listScopedLicenseKeys({
        role,
        actorEmail: normalized,
        clientEmail: role === 'client' ? normalized : undefined,
      });
      if (!res.ok) return keysRef.current;
      const mapped: LicenseKey[] = res.keys.map((raw) => ({
        id: String(raw.id || ''),
        eaId: String(raw.eaId || raw.ea_id || ''),
        eaName: String(raw.eaName || raw.ea_name || ''),
        key: String(raw.key || ''),
        createdAt: String(raw.createdAt || raw.created_at || ''),
        eaPictureUri: (raw.eaPictureUri || raw.ea_picture_uri || null) as
          | string
          | null,
        eaSymbols: Array.isArray(raw.eaSymbols)
          ? (raw.eaSymbols as string[])
          : Array.isArray(raw.ea_symbols)
            ? (raw.ea_symbols as string[])
            : [],
        assigneeName: (raw.assigneeName || raw.assignee_name || null) as
          | string
          | null,
        assigneeEmail: (raw.assigneeEmail || raw.assignee_email || null) as
          | string
          | null,
        issuedByEmail: (raw.issuedByEmail || raw.issued_by_email || null) as
          | string
          | null,
        mentorId: (raw.mentorId || raw.mentor_id || null) as string | null,
        subscriptionId: (raw.subscriptionId ||
          raw.subscription_id ||
          null) as string | null,
        licenseDuration: (raw.licenseDuration ||
          raw.license_duration ||
          null) as string | null,
        licenseStatus: (raw.licenseStatus ||
          raw.license_status ||
          raw.status ||
          null) as string | null,
        expiresAt: (raw.expiresAt || raw.expires_at || null) as string | null,
        status: (raw.status || null) as string | null,
        activatedAt: (raw.activatedAt || raw.activated_at || null) as
          | string
          | null,
      }));
      // Mentor view: reload scoped EAs + replace keys (never keep foreign EAs).
      // Client view: only merge keys for this email — never other mentors' keys.
      if (role === 'mentor') {
        const admin = isSuperAdminEmail(normalized);
        const catalog = await loadLicenseCatalog({
          scopeOwnerEmail: normalized,
          isSuperAdmin: admin,
        });
        const nextEas = catalog.eas;
        const nextKeys = mapped.length ? mapped : catalog.keys;
        applyCatalog(nextEas, nextKeys);
        await saveLicenseCatalog(nextEas, nextKeys, {
          skipRemote: true,
          broadcast: false,
          allowEmpty: true,
        });
      } else {
        const mine = mapped.filter(
          (k) =>
            (k.assigneeEmail || '').toLowerCase() === normalized,
        );
        applyCatalog(easRef.current, mine);
        await saveLicenseCatalog(easRef.current, mine, {
          skipRemote: true,
          broadcast: false,
          allowEmpty: true,
        });
      }
      return mapped;
    }, []);

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

      // Keep mentor isolation — never pull the full catalog while scoped.
      const catalog = await loadLicenseCatalog(catalogLoadOpts());
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
          ownerEmail:
            (remote.ea as { ownerEmail?: string | null }).ownerEmail ??
            live?.ownerEmail ??
            null,
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
    }, [persistActiveSession, catalogLoadOpts]);

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
    if (!assignee?.email?.trim() || !assignee?.duration?.trim()) {
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
      assigneeName: assignee.name?.trim() || null,
      assigneeEmail: assignee.email.trim().toLowerCase(),
      issuedByEmail: issuer,
      mentorId: issuer,
      subscriptionId: assignee.subscriptionId || null,
      licenseDuration: assignee.duration.trim(),
      licenseStatus: 'unused',
      expiresAt: null,
      status: 'unused',
      activatedAt: null,
    };
    const rowForRemote: LicenseKey & { regenerate?: boolean } = {
      ...row,
      regenerate: Boolean(assignee.regenerate),
    };
    const liveEa = {
      ...ea,
      pictureUri: eaPictureUri || ea.pictureUri,
      ownerEmail: ea.ownerEmail || issuer,
    };
    // Remote-first so exclusivity failures never leave a local orphan key.
    const remote = await syncIssuedLicenseRemote(rowForRemote, liveEa, {
      generate: true,
      challengeToken: assignee.challengeToken || null,
      actorEmail: issuer,
    });
    if (!remote.ok) {
      return {
        key: row,
        remote: {
          ok: false,
          error: remote.error,
          hint: remote.hint,
          code: remote.code || remote.tableError,
        },
      };
    }
    if (eaPictureUri) {
      await vaultPutEaPicture(ea.id, eaPictureUri);
      await vaultPutKeyPicture(row.id, eaPictureUri);
    }
    const durable =
      remote.keyPictureUri || remote.eaPictureUri || eaPictureUri;
    if (durable) row.eaPictureUri = durable;
    let nextEas = easRef.current.map((e) =>
      e.id === ea.id && durable ? { ...e, pictureUri: durable } : e,
    );
    if (!nextEas.some((e) => e.id === ea.id)) {
      nextEas = [...nextEas, { ...liveEa, pictureUri: durable || liveEa.pictureUri }];
    }
    const nextKeys = [row, ...keysRef.current.filter((k) => k.id !== row.id)];
    applyCatalog(nextEas, nextKeys);
    await saveLicenseCatalog(nextEas, nextKeys, { skipRemote: true });
    return {
      key: row,
      remote: {
        ok: true,
        via: remote.via,
        hint: remote.hint,
      },
    };
  };

  const deleteLicenseKey: AppStateValue['deleteLicenseKey'] = async (
    keyId,
  ) => {
    const actor = normalizeMentorEmail(mentor?.email);
    if (!actor) {
      return { ok: false, error: 'Sign in to the Mentors Portal first.' };
    }
    const id = String(keyId || '').trim();
    if (!id) return { ok: false, error: 'Missing license key id.' };
    const local = keysRef.current.find((k) => k.id === id);
    if (local) {
      const issuer = normalizeMentorEmail(
        local.issuedByEmail || local.mentorId,
      );
      if (issuer && issuer !== actor && !isSuperAdminEmail(actor)) {
        return {
          ok: false,
          error: 'Not allowed to delete another mentor’s license key',
        };
      }
    }
    const remote = await deleteLicenseRemote({ keyId: id, actorEmail: actor });
    if (!remote.ok) {
      return { ok: false, error: remote.error || 'Could not delete license key' };
    }
    const nextKeys = keysRef.current.filter((k) => k.id !== id);
    applyCatalog(easRef.current, nextKeys);
    await saveLicenseCatalog(easRef.current, nextKeys, { skipRemote: true });
    return { ok: true };
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
      const clean = dedupeBrokerSymbols(syms);
      setSelected(clean);
      setQuoteSetups((prev) => {
        const next = clean.map((sym) => {
          const existing = prev.find((s) => symbolsMatch(s.symbol, sym));
          if (existing) {
            // Keep lot/trades; adopt exact broker spelling.
            return existing.symbol === sym
              ? existing
              : { ...existing, symbol: sym };
          }
          return normalizeQuoteSetup({ symbol: sym })!;
        });
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
          ...prev.filter((s) => !symbolsMatch(s.symbol, normalized.symbol)),
          normalized,
        ];
        void persistQuoteSetups(next);
        return next;
      });
      setSelected((prev) => {
        const without = prev.filter(
          (s) => !symbolsMatch(s, normalized.symbol),
        );
        return [...without, normalized.symbol];
      });
    },
    [persistQuoteSetups],
  );

  const removeQuoteSetup = useCallback(
    (symbol: string) => {
      const sym = preserveBrokerSymbol(symbol);
      setQuoteSetups((prev) => {
        const next = prev.filter((s) => !symbolsMatch(s.symbol, sym));
        void persistQuoteSetups(next);
        return next;
      });
      setSelected((prev) => prev.filter((s) => !symbolsMatch(s, sym)));
    },
    [persistQuoteSetups],
  );

  const getQuoteSetup = useCallback((symbol: string) => {
    const sym = preserveBrokerSymbol(symbol);
    return quoteSetupsRef.current.find((s) => symbolsMatch(s.symbol, sym));
  }, []);

  const activateLicenseKey: AppStateValue['activateLicenseKey'] = async (
    rawKey,
  ) => {
    const key = normalizeLicenseKey(rawKey);
    if (!key.startsWith('EDGES-') || key.length < 20) {
      return { ok: false, error: 'Enter a valid EDGES-XXXX-XXXX-XXXX-XXXX key' };
    }

    const clientEmail = eaAccess?.email?.trim().toLowerCase() || '';

    const fromLocal = (pool: LicenseKey[]) => {
      // When client identity is known, ignore cached keys for other emails
      // (and legacy rows with no assignee — those were the device-dump leak).
      const scoped = clientEmail
        ? pool.filter((k) => {
            const a = (k.assigneeEmail || '').trim().toLowerCase();
            return a === clientEmail;
          })
        : pool;
      const hit = findLocalIssuedKey(scoped, key);
      if (!hit) return null;
      return {
        key: hit,
        eas: easRef.current,
        keys: pool.length ? pool : keysRef.current,
      };
    };

    // 1) Same-device React memory first (fingerprint / OCR-safe, email-scoped)
    let found = fromLocal(keysRef.current);

    // 2) Server lookup by typed key (cross-device) — then enforce email ownership
    if (!found) {
      found = await findIssuedLicense(key);
    }

    // 3) Refresh local then retry (race after Generate on another tab)
    if (!found) {
      await refreshLicenseCatalog();
      found = fromLocal(keysRef.current) || (await findIssuedLicense(key));
    }

    if (!found) {
      return {
        ok: false,
        error:
          'License key not found. Enter the key your mentor generated for your email (check O vs 0). If it was just created, wait a moment and try again.',
      };
    }

    // Strict ownership: key must belong to this client's registered email when known.
    const assignee = (found.key.assigneeEmail || '').trim().toLowerCase();
    if (clientEmail) {
      if (!assignee) {
        return {
          ok: false,
          error:
            'This license key is not linked to a client email. Ask your mentor to regenerate it for your registered email.',
        };
      }
      if (assignee !== clientEmail) {
        return {
          ok: false,
          error:
            'This license key belongs to a different client email. Sign in with the email your mentor used.',
        };
      }
    }

    // Server device bind — one email = one active device.
    if (clientEmail) {
      const deviceId = await getOrCreateDeviceId();
      const bound = await activateLicenseRemote({
        key,
        email: clientEmail,
        deviceId,
      });
      if (!bound.ok) {
        return {
          ok: false,
          error:
            bound.error ||
            (bound.code === 'active_other_device'
              ? 'This email is active on another device'
              : 'Could not activate license on this device'),
        };
      }
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

  const clearActiveEa = async (opts?: { requireResubscribe?: boolean }) => {
    await AsyncStorage.removeItem(ACTIVE_EA_KEY);
    setActiveEa(null);
    // Keep Quotes selections until the user explicitly removes them.
    setStatus('stopped');
    if (opts?.requireResubscribe) {
      await clearClientAccessSession({ keepSubscriptionRecord: false });
    }
  };

  // When mentor deletes/revokes a key, kick the client off the EA immediately
  // and force subscription again.
  useEffect(() => {
    if (!activeEa?.licenseKey) return;
    const email = eaAccess?.email?.trim().toLowerCase() || '';
    if (!email) return;
    let cancelled = false;
    const kick = async () => {
      try {
        const deviceId = await getOrCreateDeviceId();
        const res = await validateLicenseRemote({
          key: activeEa.licenseKey,
          email,
          deviceId,
        });
        if (cancelled) return;
        if (res.access) return;
        await AsyncStorage.removeItem(ACTIVE_EA_KEY);
        setActiveEa(null);
        setStatus('stopped');
        await clearClientAccessSession({ keepSubscriptionRecord: false });
      } catch {
        /* network — keep session */
      }
    };
    void kick();
    const timer = setInterval(() => {
      void kick();
    }, 12_000);
    const onFocus = () => {
      void kick();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onFocus);
    }
    return () => {
      cancelled = true;
      clearInterval(timer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onFocus);
      }
    };
  }, [activeEa?.licenseKey, eaAccess?.email, clearClientAccessSession]);

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
      mentorReady,
      setMentor,
      eas,
      addEa,
      updateEaBranding,
      licenseKeys,
      generateLicenseKey,
      deleteLicenseKey,
      eaAccess,
      accessReady,
      subscriptionReady,
      clientSubscription,
      isClientPaymentPending,
      canAccessLicenseSection,
      unlockEaAccess,
      beginClientCheckout,
      refreshClientSubscription,
      clearClientAccessSession,
      refreshScopedLicenseKeys,
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
      mentorReady,
      eas,
      licenseKeys,
      eaAccess,
      accessReady,
      subscriptionReady,
      clientSubscription,
      isClientPaymentPending,
      canAccessLicenseSection,
      refreshClientSubscription,
      clearClientAccessSession,
      refreshScopedLicenseKeys,
      activeEa,
      refreshLicenseCatalog,
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
