/**
 * Prove worldwide Generate → Activate for EDGES-0H3A-0998-0AJY-0S2R.
 * 1) Local fingerprint match (same-device / OCR / unicode dashes)
 * 2) Cloud put + lookup (any browser)
 * 3) sessionFromLicense mapping
 */
import put from '../api/licenses/put.js';
import lookup from '../api/licenses/lookup.js';
import { Readable } from 'stream';

function normalizeLicenseKey(raw) {
  const upper = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
    .replace(/\s+/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  const fp = upper.replace(/[^A-Z0-9]/g, '');
  if (fp.startsWith('EDGES') && fp.length >= 21) {
    const body = fp.slice(5, 21);
    return `EDGES-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}-${body.slice(12, 16)}`;
  }
  return upper;
}

function fingerprint(raw) {
  return normalizeLicenseKey(raw).replace(/[^A-Z0-9]/g, '');
}

function findLocalIssuedKey(keys, rawKey) {
  const want = fingerprint(rawKey);
  if (!want.startsWith('EDGES') || want.length < 21) return undefined;
  return keys.find((k) => fingerprint(k.key) === want);
}

function run(handler, method, body) {
  return new Promise((resolve) => {
    const req = new Readable({ read() {} });
    req.method = method;
    req.url = '/';
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    process.nextTick(() => {
      if (payload) req.push(payload);
      req.push(null);
    });
    const res = {
      statusCode: 200,
      setHeader() {},
      end(s) {
        resolve({ status: res.statusCode, body: JSON.parse(String(s)) });
      },
    };
    handler(req, res);
  });
}

const TARGET = 'EDGES-0H3A-0998-0AJY-0S2R';
const variants = [
  TARGET,
  'EDGES‑0H3A‑0998‑0AJY‑0S2R', // unicode dashes
  'EDGES 0H3A 0998 0AJY 0S2R',
  'EDGES-OH3A-O998-OAJY-OS2R',
  'EDGES0H3A09980AJY0S2R',
];

const catalog = [
  {
    id: 'lic_proof',
    eaId: 'ea_unlimited_bull',
    eaName: 'UNLIMITED BULL',
    key: TARGET,
    createdAt: new Date().toISOString(),
    eaPictureUri: null,
    eaSymbols: ['XAUUSD'],
  },
];

console.log('=== 1) Same-device fingerprint match ===');
for (const v of variants) {
  const hit = findLocalIssuedKey(catalog, v);
  const canon = normalizeLicenseKey(v);
  if (!hit || canon !== TARGET) {
    console.error('FAIL local match', { v, canon, hit: hit?.key });
    process.exit(1);
  }
  console.log('OK', JSON.stringify(v), '→', canon);
}

console.log('=== 2) Cloud put + lookup (worldwide) ===');
const ea = {
  id: 'ea_unlimited_bull',
  name: 'UNLIMITED BULL',
  pictureUri: null,
  symbols: ['XAUUSD'],
  createdAt: new Date().toISOString(),
};
const putRes = await run(put, 'POST', { key: catalog[0], ea });
if (!putRes.body.ok) {
  console.error('FAIL put', putRes);
  process.exit(1);
}
console.log('OK put via', putRes.body.via);

const look = await run(lookup, 'POST', { key: 'EDGES-OH3A-O998-OAJY-OS2R' });
if (!look.body.ok || fingerprint(look.body.key.key) !== fingerprint(TARGET)) {
  console.error('FAIL lookup', look);
  process.exit(1);
}
console.log('OK lookup via', look.body.via, '→', look.body.key.key);

console.log('=== 3) Activate session mapping ===');
const issued = look.body.key;
const session = {
  licenseKey: issued.key,
  eaId: issued.eaId,
  name: issued.eaName || 'EA',
  pictureUri: issued.eaPictureUri,
  symbols: issued.eaSymbols || [],
  activatedAt: new Date().toISOString(),
};
if (session.eaId !== 'ea_unlimited_bull' || session.name !== 'UNLIMITED BULL') {
  console.error('FAIL session', session);
  process.exit(1);
}
console.log('OK session', session.name, session.licenseKey);
console.log('PROVE_LICENSE_ACTIVATE_OK');
