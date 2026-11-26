/**
 * Central frontend error mapper — never surface Supabase/API/SQL/stack/env/paths/tokens.
 * Always returns a short, user-safe string suitable for auth + portal toasts.
 */

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const SECRETISH_RE =
  /(service[_-]?role|sb_secret|eyJ[a-zA-Z0-9_-]{20,}|supabase\.co\/|postgres:\/\/|\/\/[^\s:]+:[^\s@]+@|SUPABASE_[A-Z0-9_]+|PGRST\d+|stack trace|at\s+\S+\s+\(|\/home\/|\/Users\/|node_modules\/|Error:)/i;

export const SAFE_GENERIC =
  'Something went wrong. Please try again. If it continues, contact support.';

export const SAFE_AUTH_INVALID =
  'Invalid email or password. Please try again.';

export const SAFE_AUTH_NETWORK =
  'Could not reach the server. Check your connection and try again.';

export const SAFE_REGISTER_FAILED =
  'Registration could not be completed. Please try again.';

export const SAFE_RESET_MOCK =
  'Password reset is not available yet. Contact your Super Admin for help.';

export type SafeErrorContext =
  | 'login'
  | 'register'
  | 'reset'
  | 'portal'
  | 'generic';

function stripEmails(text: string): string {
  return text.replace(EMAIL_RE, '[email]');
}

function looksTechnical(raw: string): boolean {
  const s = String(raw || '');
  if (!s.trim()) return true;
  if (SECRETISH_RE.test(s)) return true;
  if (/column\s+\w+\.\w+\s+does not exist/i.test(s)) return true;
  if (/relation\s+".+"\s+does not exist/i.test(s)) return true;
  if (/permission denied|row-level security|RLS/i.test(s)) return true;
  if (/schema cache|does not exist|SQLSTATE|syntax error/i.test(s)) return true;
  if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|fetch failed/i.test(s)) return true;
  if (s.length > 180) return true;
  if (/[{}\[\]]/.test(s) && /error|code|details|hint/i.test(s)) return true;
  return false;
}

/**
 * Map any thrown/API/local error into a safe user-facing string.
 * Never includes personal emails, stack traces, or infra hints.
 */
export function toSafeUserMessage(
  err: unknown,
  context: SafeErrorContext = 'generic',
): string {
  if (err == null || err === '') {
    return context === 'login'
      ? SAFE_AUTH_INVALID
      : context === 'register'
        ? SAFE_REGISTER_FAILED
        : SAFE_GENERIC;
  }

  if (typeof err === 'object' && err !== null) {
    const o = err as Record<string, unknown>;
    // Prefer already-safe server payloads
    if (typeof o.userMessage === 'string' && o.userMessage.trim()) {
      const um = stripEmails(o.userMessage.trim());
      if (!looksTechnical(um)) {
        const ref =
          typeof o.errorRef === 'string' && o.errorRef
            ? ` (Ref: ${o.errorRef})`
            : '';
        return um + ref;
      }
    }
    const candidate =
      (typeof o.error === 'string' && o.error) ||
      (typeof o.message === 'string' && o.message) ||
      (typeof o.hint === 'string' && o.hint) ||
      '';
    return toSafeUserMessage(candidate, context);
  }

  const raw = stripEmails(String(err)).trim();

  // Known safe auth/validation phrases we allow through
  const allowExact = [
    SAFE_AUTH_INVALID,
    SAFE_AUTH_NETWORK,
    SAFE_REGISTER_FAILED,
    SAFE_RESET_MOCK,
    SAFE_GENERIC,
    'Please enter your email.',
    'Please enter your password.',
    'Please enter a valid email.',
    'Mentor display name is required.',
    'Full name is required.',
    'Contact number is required.',
    'Password must be at least 8 characters.',
    'Passwords do not match.',
    'Email is already registered.',
    'This email has a mentor',
    'This email is active on another device',
  ];
  if (allowExact.includes(raw)) return raw;
  if (/this email has a mentor/i.test(raw)) {
    return 'This email has a mentor';
  }
  if (/active on another device/i.test(raw)) {
    return 'This email is active on another device';
  }

  if (/invalid email or password/i.test(raw)) return SAFE_AUTH_INVALID;
  if (/passwords? do not match/i.test(raw)) return 'Passwords do not match.';
  if (/already (registered|exists)/i.test(raw)) {
    return 'Email is already registered.';
  }
  if (/network|unreachable|failed to fetch|offline/i.test(raw)) {
    return SAFE_AUTH_NETWORK;
  }
  if (looksTechnical(raw)) {
    return context === 'login'
      ? SAFE_AUTH_INVALID
      : context === 'register'
        ? SAFE_REGISTER_FAILED
        : SAFE_GENERIC;
  }

  // Short, non-technical → allow (still strip emails)
  if (raw.length <= 120) return raw;
  return SAFE_GENERIC;
}

/** Prefer server `userMessage` + `errorRef` when present on a JSON body. */
export function safeMessageFromApiBody(
  body: unknown,
  context: SafeErrorContext = 'generic',
): string {
  if (!body || typeof body !== 'object') {
    return toSafeUserMessage(body, context);
  }
  const o = body as Record<string, unknown>;
  if (typeof o.userMessage === 'string' && o.userMessage.trim()) {
    return toSafeUserMessage(
      { userMessage: o.userMessage, errorRef: o.errorRef },
      context,
    );
  }
  return toSafeUserMessage(o.error || o.message || o.hint, context);
}
