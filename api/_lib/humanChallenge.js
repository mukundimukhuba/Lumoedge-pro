const crypto = require('crypto');

const CHECKBOX_TTL_MS = 10 * 60 * 1000; // 10 minutes
const PROVIDER_CHECKBOX = 'checkbox';
const PROVIDER_TURNSTILE = 'turnstile';
const PROVIDER_RECAPTCHA = 'recaptcha';

function readEnv(...names) {
  for (const name of names) {
    const v = String(process.env[name] || '').trim();
    if (v) return v;
  }
  return '';
}

function signingSecret() {
  return (
    readEnv(
      'HUMAN_CHALLENGE_SECRET',
      'SUPABASE_SERVICE_ROLE_KEY',
      'supabase',
    ) || 'edges-human-challenge-dev'
  );
}

function detectProvider() {
  const turnstileSecret = readEnv(
    'TURNSTILE_SECRET_KEY',
    'CLOUDFLARE_TURNSTILE_SECRET_KEY',
  );
  const turnstileSite = readEnv(
    'TURNSTILE_SITE_KEY',
    'CLOUDFLARE_TURNSTILE_SITE_KEY',
    'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
    'EXPO_PUBLIC_TURNSTILE_SITE_KEY',
  );
  if (turnstileSecret && turnstileSite) {
    return {
      provider: PROVIDER_TURNSTILE,
      siteKey: turnstileSite,
      secretKey: turnstileSecret,
    };
  }

  const recaptchaSecret = readEnv(
    'RECAPTCHA_SECRET_KEY',
    'RECAPTCHA_SECRET',
    'GOOGLE_RECAPTCHA_SECRET_KEY',
  );
  const recaptchaSite = readEnv(
    'RECAPTCHA_SITE_KEY',
    'RECAPTCHA_SITEKEY',
    'NEXT_PUBLIC_RECAPTCHA_SITE_KEY',
    'EXPO_PUBLIC_RECAPTCHA_SITE_KEY',
  );
  if (recaptchaSecret && recaptchaSite) {
    return {
      provider: PROVIDER_RECAPTCHA,
      siteKey: recaptchaSite,
      secretKey: recaptchaSecret,
    };
  }

  return {
    provider: PROVIDER_CHECKBOX,
    siteKey: null,
    secretKey: null,
  };
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
  const b64 = String(s).replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64');
}

function signPayload(payloadObj) {
  const payload = b64url(JSON.stringify(payloadObj));
  const sig = crypto
    .createHmac('sha256', signingSecret())
    .update(payload)
    .digest();
  return `${payload}.${b64url(sig)}`;
}

function verifySignedToken(token) {
  const raw = String(token || '').trim();
  const parts = raw.split('.');
  if (parts.length !== 2) return { ok: false, error: 'Invalid challenge token' };
  const [payload, sig] = parts;
  const expected = crypto
    .createHmac('sha256', signingSecret())
    .update(payload)
    .digest();
  let got;
  try {
    got = fromB64url(sig);
  } catch {
    return { ok: false, error: 'Invalid challenge token' };
  }
  if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) {
    return { ok: false, error: 'Invalid challenge token' };
  }
  let data;
  try {
    data = JSON.parse(fromB64url(payload).toString('utf8'));
  } catch {
    return { ok: false, error: 'Invalid challenge token' };
  }
  const exp = Number(data.exp || 0);
  if (!exp || Date.now() > exp) {
    return { ok: false, error: 'Challenge expired — check “I’m not a robot” again' };
  }
  return { ok: true, data };
}

/** Issue a short-lived checkbox challenge token after the user ticks the box. */
function issueCheckboxToken(actorEmail) {
  const now = Date.now();
  return signPayload({
    v: 1,
    provider: PROVIDER_CHECKBOX,
    actor: String(actorEmail || '').trim().toLowerCase() || null,
    iat: now,
    exp: now + CHECKBOX_TTL_MS,
    nonce: crypto.randomBytes(8).toString('hex'),
  });
}

async function verifyTurnstile(token, remoteip) {
  const { secretKey } = detectProvider();
  if (!secretKey) return { ok: false, error: 'Turnstile not configured' };
  const body = new URLSearchParams();
  body.set('secret', secretKey);
  body.set('response', String(token || ''));
  if (remoteip) body.set('remoteip', String(remoteip));
  const res = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!data.success) {
    return { ok: false, error: 'Robot check failed (Turnstile)' };
  }
  return { ok: true, provider: PROVIDER_TURNSTILE };
}

async function verifyRecaptcha(token, remoteip) {
  const { secretKey } = detectProvider();
  if (!secretKey) return { ok: false, error: 'reCAPTCHA not configured' };
  const body = new URLSearchParams();
  body.set('secret', secretKey);
  body.set('response', String(token || ''));
  if (remoteip) body.set('remoteip', String(remoteip));
  const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!data.success) {
    return { ok: false, error: 'Robot check failed (reCAPTCHA)' };
  }
  return { ok: true, provider: PROVIDER_RECAPTCHA };
}

/**
 * Verify a generate-path challenge token.
 * Accepts signed checkbox tokens or third-party provider responses.
 */
async function verifyChallengeToken(token, opts = {}) {
  const raw = String(token || '').trim();
  if (!raw) {
    return {
      ok: false,
      error: 'Robot check required — confirm you’re not a robot before generating',
    };
  }

  const cfg = detectProvider();

  // Signed checkbox tokens always look like payload.sig (two base64url parts).
  if (raw.includes('.') && raw.split('.').length === 2) {
    const signed = verifySignedToken(raw);
    if (!signed.ok) return signed;
    if (signed.data?.provider && signed.data.provider !== PROVIDER_CHECKBOX) {
      return { ok: false, error: 'Invalid challenge token' };
    }
    return { ok: true, provider: PROVIDER_CHECKBOX };
  }

  if (cfg.provider === PROVIDER_TURNSTILE) {
    return verifyTurnstile(raw, opts.remoteip);
  }
  if (cfg.provider === PROVIDER_RECAPTCHA) {
    return verifyRecaptcha(raw, opts.remoteip);
  }

  return {
    ok: false,
    error: 'Robot check required — confirm you’re not a robot before generating',
  };
}

function publicCaptchaConfig() {
  const cfg = detectProvider();
  return {
    provider: cfg.provider,
    siteKey: cfg.siteKey,
  };
}

module.exports = {
  PROVIDER_CHECKBOX,
  PROVIDER_TURNSTILE,
  PROVIDER_RECAPTCHA,
  detectProvider,
  publicCaptchaConfig,
  issueCheckboxToken,
  verifyChallengeToken,
};
