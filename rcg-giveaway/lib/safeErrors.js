/**
 * Server-side safe errors: unique ref ID, log tech details only, return safe JSON.
 * Never include stack traces, SQL, env names, paths, or tokens in the response body.
 */
const crypto = require('crypto');

const SAFE_GENERIC =
  'Something went wrong. Please try again. If it continues, contact support.';
const SAFE_CONFIG =
  'The service is temporarily unavailable. Please try again later.';
const SAFE_BAD_REQUEST = 'Invalid request. Please check your input and try again.';
const SAFE_FORBIDDEN = 'You do not have permission to perform this action.';
const SAFE_NOT_FOUND = 'The requested item could not be found.';

function newErrorRef() {
  const ts = Date.now().toString(36);
  const rnd = crypto.randomBytes(4).toString('hex');
  return `LE-${ts}-${rnd}`.toUpperCase();
}

/**
 * Log technical details server-side only (never the response).
 * @param {string} errorRef
 * @param {unknown} err
 * @param {Record<string, unknown>} [meta]
 */
function logTechError(errorRef, err, meta) {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : err && typeof err === 'object' && err.message
          ? String(err.message)
          : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  // eslint-disable-next-line no-console
  console.error('[safeErrors]', errorRef, {
    message: String(message).slice(0, 500),
    stack: stack ? String(stack).slice(0, 1500) : undefined,
    ...(meta || {}),
  });
}

/**
 * @param {number} status
 * @param {unknown} err
 * @param {{ userMessage?: string, code?: string, meta?: Record<string, unknown> }} [opts]
 */
function safeFailPayload(status, err, opts = {}) {
  const errorRef = newErrorRef();
  logTechError(errorRef, err, { status, code: opts.code, ...(opts.meta || {}) });

  let userMessage = opts.userMessage;
  if (!userMessage) {
    if (status === 400) userMessage = SAFE_BAD_REQUEST;
    else if (status === 401 || status === 403) userMessage = SAFE_FORBIDDEN;
    else if (status === 404) userMessage = SAFE_NOT_FOUND;
    else if (status === 503) userMessage = SAFE_CONFIG;
    else userMessage = SAFE_GENERIC;
  }

  return {
    ok: false,
    error: userMessage,
    userMessage,
    errorRef,
  };
}

/** Strip technical / secret-looking fields from an outbound body (shallow). */
function sanitizePublicBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const out = { ...body };
  delete out.stack;
  delete out.tableError;
  delete out.serviceKeyKind;
  delete out.anonKeyKind;
  delete out.sql;
  delete out.details;
  delete out.hint;
  delete out.envPresence;
  if (Array.isArray(out.missingEnvNames)) {
    delete out.missingEnvNames;
  }
  const scrub = (val) => {
    if (typeof val !== 'string') return val;
    if (/SERVICE_ROLE|SUPABASE_|PGRST|sb_secret|postgres|schema cache|\/home\/|\/Users\/|eyJ[a-zA-Z0-9_-]{20,}/i.test(val)) {
      return SAFE_GENERIC;
    }
    return val;
  };
  if (typeof out.error === 'string') {
    out.error = scrub(out.error);
    if (out.error === SAFE_GENERIC) {
      out.userMessage = out.userMessage || SAFE_GENERIC;
    }
  }
  if (typeof out.userMessage === 'string') {
    out.userMessage = scrub(out.userMessage);
  }
  if (out.tables && typeof out.tables === 'object') {
    const tables = {};
    for (const [k, v] of Object.entries(out.tables)) {
      const sv = String(v || '');
      tables[k] = sv.startsWith('error:') ? 'error' : sv;
    }
    out.tables = tables;
  }
  return out;
}

module.exports = {
  SAFE_GENERIC,
  SAFE_CONFIG,
  SAFE_BAD_REQUEST,
  SAFE_FORBIDDEN,
  SAFE_NOT_FOUND,
  newErrorRef,
  logTechError,
  safeFailPayload,
  sanitizePublicBody,
};
