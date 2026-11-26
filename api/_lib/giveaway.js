/**
 * RCG giveaway helpers: claim tokens, rate limits, durable claim ledger,
 * and free license issuance (service-role, never exposed to client).
 */
const crypto = require('crypto');
const { SUPER_ADMIN_EMAIL, normalizeEmail } = require('./superAdmin');
const {
  normalizeLicenseKey,
  sbFetch,
  storageGetJson,
  storagePutJson,
} = require('./supabaseAdmin');
const { assertEmailCanReceiveNewKey } = require('./licenseExclusivity');

const CLAIM_TTL_MS = 15 * 60 * 1000; // 15 minutes after verify
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX_VERIFY = 8;
const RATE_MAX_CLAIM = 6;

/**
 * Shared access token for the secret giveaway link.
 * Path: /g/rcg-<token>/  — not linked from the main PWA.
 * Override with Vercel env GIVEAWAY_ACCESS_TOKEN if rotated.
 */
const DEFAULT_GIVEAWAY_ACCESS_TOKEN = 'd36f2878e48d3ab9b649572a';

function giveawayAccessToken() {
  return (
    String(process.env.GIVEAWAY_ACCESS_TOKEN || DEFAULT_GIVEAWAY_ACCESS_TOKEN)
      .trim() || DEFAULT_GIVEAWAY_ACCESS_TOKEN
  );
}

function giveawaySecretPath() {
  return `/g/rcg-${giveawayAccessToken()}`;
}

/**
 * Require the invite token on every giveaway API call.
 * Prevents random visitors who only know /api/giveaway/* from claiming.
 */
function assertGiveawayAccess(raw) {
  const got = String(raw || '').trim();
  const exp = giveawayAccessToken();
  if (!got || !exp || got !== exp) {
    return {
      ok: false,
      status: 404,
      error: 'Not found',
      code: 'giveaway_not_found',
    };
  }
  return { ok: true };
}

const GIVEAWAY_EA_ID = () =>
  String(process.env.GIVEAWAY_EA_ID || 'ea-rcg-giveaway').trim() ||
  'ea-rcg-giveaway';
const GIVEAWAY_EA_NAME = () =>
  String(process.env.GIVEAWAY_EA_NAME || 'Lumo Edge Pro').trim() ||
  'Lumo Edge Pro';
const GIVEAWAY_DURATION = () =>
  String(process.env.GIVEAWAY_LICENSE_DURATION || 'lifetime').trim() ||
  'lifetime';
const GIVEAWAY_ISSUER = () =>
  normalizeEmail(
    process.env.GIVEAWAY_ISSUER_EMAIL || SUPER_ADMIN_EMAIL,
  ) || SUPER_ADMIN_EMAIL;

/** In-memory rate buckets (per serverless instance). Best-effort only. */
const rateBuckets = new Map();

function signingSecret() {
  return (
    String(
      process.env.GIVEAWAY_SIGNING_SECRET ||
        process.env.HUMAN_CHALLENGE_SECRET ||
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        '',
    ).trim() || 'lumo-rcg-giveaway-dev'
  );
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromB64url(s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function clientIp(req) {
  const xf = req?.headers?.['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return (
    String(req?.headers?.['x-real-ip'] || '').trim() ||
    String(req?.socket?.remoteAddress || 'unknown')
  );
}

function rateLimit(key, max, windowMs = RATE_WINDOW_MS) {
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.start > windowMs) {
    bucket = { start: now, count: 0 };
    rateBuckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > max) {
    return {
      ok: false,
      status: 429,
      error: 'Too many attempts. Please wait a few minutes and try again.',
      code: 'rate_limited',
    };
  }
  return { ok: true, remaining: max - bucket.count };
}

function rateLimitVerify(req) {
  return rateLimit(`v:${clientIp(req)}`, RATE_MAX_VERIFY);
}

function rateLimitClaim(req) {
  return rateLimit(`c:${clientIp(req)}`, RATE_MAX_CLAIM);
}

function makeClaimToken({ login, server, mt5TokenFingerprint }) {
  const payload = {
    v: 1,
    login: String(login || '').trim(),
    server: String(server || '').trim(),
    fp: String(mt5TokenFingerprint || '').slice(0, 16),
    exp: Date.now() + CLAIM_TTL_MS,
    n: crypto.randomBytes(8).toString('hex'),
  };
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(
    crypto.createHmac('sha256', signingSecret()).update(body).digest(),
  );
  return `${body}.${sig}`;
}

function verifyClaimToken(raw) {
  const parts = String(raw || '').split('.');
  if (parts.length !== 2) {
    return { ok: false, error: 'Verification expired. Please verify again.', code: 'token_invalid' };
  }
  const [body, sig] = parts;
  const expect = b64url(
    crypto.createHmac('sha256', signingSecret()).update(body).digest(),
  );
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: 'Verification expired. Please verify again.', code: 'token_invalid' };
  }
  let payload;
  try {
    payload = JSON.parse(fromB64url(body).toString('utf8'));
  } catch {
    return { ok: false, error: 'Verification expired. Please verify again.', code: 'token_invalid' };
  }
  if (!payload?.login || !payload?.server || !payload?.exp) {
    return { ok: false, error: 'Verification expired. Please verify again.', code: 'token_invalid' };
  }
  if (Date.now() > Number(payload.exp)) {
    return { ok: false, error: 'Verification expired. Please verify again.', code: 'token_expired' };
  }
  return {
    ok: true,
    login: String(payload.login).trim(),
    server: String(payload.server).trim(),
  };
}

function fingerprintToken(token) {
  return crypto
    .createHash('sha256')
    .update(String(token || ''))
    .digest('hex')
    .slice(0, 16);
}

function loginClaimPath(login) {
  const safe = String(login || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 64);
  return `catalog/giveaway-claims/by-login/${safe}.json`;
}

function emailClaimPath(email) {
  const e = normalizeEmail(email);
  const hash = crypto.createHash('sha256').update(e).digest('hex').slice(0, 32);
  return `catalog/giveaway-claims/by-email/${hash}.json`;
}

async function findExistingClaim({ login, email }) {
  const hits = [];
  if (login) {
    try {
      const row = await storageGetJson(loginClaimPath(login));
      if (row && row.key) hits.push({ via: 'login', row });
    } catch {
      /* miss */
    }
  }
  if (email) {
    try {
      const row = await storageGetJson(emailClaimPath(email));
      if (row && row.key) hits.push({ via: 'email', row });
    } catch {
      /* miss */
    }
  }
  return hits[0] || null;
}

function makeLicenseKey() {
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const block = () => {
    let s = '';
    while (s.length < 4) {
      s += alphabet[crypto.randomInt(0, alphabet.length)];
    }
    return s;
  };
  return `EDGES-${block()}-${block()}-${block()}-${block()}`;
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Issue one free giveaway license for a verified RCG account + email.
 * One claim per MT5 login and per email (durable storage ledger).
 */
async function issueGiveawayLicense({ login, server, email, name }) {
  const assigneeEmail = normalizeEmail(email);
  if (!assigneeEmail || !assigneeEmail.includes('@')) {
    return {
      ok: false,
      status: 400,
      error: 'A valid email is required to receive your license key.',
      code: 'email_required',
    };
  }

  const existing = await findExistingClaim({ login, email: assigneeEmail });
  if (existing?.row?.key) {
    return {
      ok: true,
      alreadyClaimed: true,
      key: String(existing.row.key),
      eaName: String(existing.row.ea_name || GIVEAWAY_EA_NAME()),
      login: String(existing.row.mt5_login || login),
      server: String(existing.row.mt5_server || server),
      via: existing.via,
    };
  }

  // Also respect global one-email-one-live-key exclusivity.
  const emailGate = await assertEmailCanReceiveNewKey(assigneeEmail);
  if (!emailGate.ok) {
    // If they already have a live key (paid or prior), surface the key if we
    // can find a giveaway claim; otherwise tell them they already have access.
    return {
      ok: false,
      status: 409,
      error:
        'This email already has a Lumo Edge Pro license. Open the app and activate with your existing key, or contact support.',
      code: emailGate.code || 'email_has_mentor',
    };
  }

  const eaId = GIVEAWAY_EA_ID();
  const eaName = GIVEAWAY_EA_NAME();
  const issuer = GIVEAWAY_ISSUER();
  const key = makeLicenseKey();
  const keyNorm = normalizeLicenseKey(key);
  const keyId = uid('lic');
  const now = new Date().toISOString();
  const symbols = splitSymbols(process.env.GIVEAWAY_EA_SYMBOLS);

  const ea = {
    id: eaId,
    name: eaName,
    picture_uri: null,
    symbols,
    created_at: now,
    updated_at: now,
    owner_email: issuer,
  };

  const keyRow = {
    id: keyId,
    ea_id: eaId,
    ea_name: eaName,
    key,
    key_normalized: keyNorm,
    created_at: now,
    ea_picture_uri: null,
    ea_symbols: symbols,
    assignee_name: String(name || '').trim() || null,
    assignee_email: assigneeEmail,
    issued_by_email: issuer,
    mentor_id: issuer,
    subscription_id: null,
    license_duration: GIVEAWAY_DURATION(),
    license_status: 'unused',
    expires_at: null,
    status: 'unused',
    activated_at: null,
    // Soft markers for ops (ignored by older readers)
    source: 'rcg_giveaway',
    mt5_login: String(login || '').trim(),
    mt5_server: String(server || '').trim(),
  };

  let via = 'storage';
  try {
    const eaUpsert = await sbFetch('/rest/v1/managed_eas?on_conflict=id', {
      method: 'POST',
      body: [ea],
      prefer: 'resolution=merge-duplicates,return=minimal',
    });
    if (eaUpsert.ok) {
      const keyUpsert = await sbFetch('/rest/v1/license_keys?on_conflict=id', {
        method: 'POST',
        body: [keyRow],
        prefer: 'resolution=merge-duplicates,return=minimal',
      });
      if (keyUpsert.ok) via = 'table';
    }
  } catch {
    /* fall through to storage */
  }

  try {
    await storagePutJson(`catalog/eas/${eaId}.json`, ea);
    await storagePutJson(`catalog/keys/${keyNorm}.json`, { ...keyRow, ea });
  } catch (err) {
    if (via !== 'table') {
      return {
        ok: false,
        status: 502,
        error: 'Could not save your license key. Please try again shortly.',
        code: 'storage_failed',
      };
    }
  }

  const claimRecord = {
    key,
    key_id: keyId,
    key_normalized: keyNorm,
    ea_id: eaId,
    ea_name: eaName,
    assignee_email: assigneeEmail,
    assignee_name: keyRow.assignee_name,
    mt5_login: keyRow.mt5_login,
    mt5_server: keyRow.mt5_server,
    claimed_at: now,
    source: 'rcg_giveaway',
  };

  // Durable anti-abuse ledger (login + email). Best-effort after key write.
  try {
    await storagePutJson(loginClaimPath(login), claimRecord);
    await storagePutJson(emailClaimPath(assigneeEmail), claimRecord);
  } catch {
    /* key already issued — ledger miss is ops-visible later */
  }

  return {
    ok: true,
    alreadyClaimed: false,
    key,
    eaName,
    login: keyRow.mt5_login,
    server: keyRow.mt5_server,
    via,
  };
}

function splitSymbols(raw) {
  const list = String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : ['XAUUSD', 'EURUSD', 'GBPUSD'];
}

module.exports = {
  CLAIM_TTL_MS,
  DEFAULT_GIVEAWAY_ACCESS_TOKEN,
  giveawayAccessToken,
  giveawaySecretPath,
  assertGiveawayAccess,
  clientIp,
  rateLimitVerify,
  rateLimitClaim,
  makeClaimToken,
  verifyClaimToken,
  fingerprintToken,
  findExistingClaim,
  issueGiveawayLicense,
  GIVEAWAY_EA_ID,
  GIVEAWAY_EA_NAME,
  rcgPublicServers: () => {
    const { rcgServerAllowlist } = require('./rcgAllowlist');
    return rcgServerAllowlist();
  },
};
