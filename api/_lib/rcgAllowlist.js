/**
 * RCG Markets MT5 server / company allowlist for the giveaway.
 * Mukundi can extend via env RCG_SERVER_ALLOWLIST (comma-separated)
 * and/or RCG_COMPANY_PATTERNS (comma-separated substrings).
 *
 * Exact MetaQuotes /Search names (droplet): RCGMarkets-Real, RCGMarkets-Demo.
 * Company: RCG Markets (Pty) Ltd.
 */

const DEFAULT_SERVERS = [
  'RCGMarkets-Real',
  'RCGMarkets-Demo',
];

const DEFAULT_COMPANY_PATTERNS = [
  'rcg markets',
  'rcgmarkets',
  'rcg markets (pty)',
];

function splitCsv(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeServer(raw) {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, '');
}

function serverKey(raw) {
  return normalizeServer(raw).toLowerCase();
}

/** Built-in + env allowlist (exact match, case-insensitive). */
function rcgServerAllowlist() {
  const fromEnv = splitCsv(process.env.RCG_SERVER_ALLOWLIST);
  const merged = [...DEFAULT_SERVERS, ...fromEnv];
  const seen = new Set();
  const out = [];
  for (const s of merged) {
    const n = normalizeServer(s);
    const k = serverKey(n);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out;
}

function companyPatterns() {
  const fromEnv = splitCsv(process.env.RCG_COMPANY_PATTERNS);
  return [...DEFAULT_COMPANY_PATTERNS, ...fromEnv].map((p) =>
    p.toLowerCase().trim(),
  );
}

/**
 * True when the MT5 server name is on the RCG allowlist.
 */
function isRcgServer(server) {
  const k = serverKey(server);
  if (!k) return false;
  return rcgServerAllowlist().some((s) => serverKey(s) === k);
}

/**
 * Soft company/company-name check when AccountSummary exposes it.
 * Returns true / false / null (unknown — no company field).
 */
function isRcgCompany(companyRaw) {
  const c = String(companyRaw || '')
    .trim()
    .toLowerCase();
  if (!c) return null;
  return companyPatterns().some((p) => p && c.includes(p));
}

/**
 * Decide whether a verified MT5 session belongs to RCG.
 * Prefer exact server allowlist; company is a secondary signal.
 *
 * @returns {{ ok: true, reason: string } | { ok: false, reason: string, code: string }}
 */
function assertRcgAccount({ server, company } = {}) {
  const srv = normalizeServer(server);
  if (!srv) {
    return {
      ok: false,
      code: 'server_required',
      reason: 'MT5 server name is required.',
    };
  }

  if (isRcgServer(srv)) {
    // Exact allowlisted MetaQuotes server names are authoritative.
    // Company is only a soft positive signal for unknown/renamed servers
    // (AccountSummary company strings are inconsistent across bridges).
    const companyHit = isRcgCompany(company);
    return {
      ok: true,
      reason: companyHit === true ? 'server+company' : 'server_allowlist',
    };
  }

  // Server not on allowlist — still accept if company clearly says RCG
  // (covers renamed MetaQuotes servers Mukundi has not listed yet).
  if (isRcgCompany(company) === true) {
    return { ok: true, reason: 'company_match' };
  }

  return {
    ok: false,
    code: 'not_rcg',
    reason:
      'This trading account is not an RCG Markets account. Use an RCG MT5 server (e.g. RCGMarkets-Real) or open an RCG account first.',
  };
}

module.exports = {
  DEFAULT_SERVERS,
  DEFAULT_COMPANY_PATTERNS,
  rcgServerAllowlist,
  companyPatterns,
  normalizeServer,
  isRcgServer,
  isRcgCompany,
  assertRcgAccount,
};
