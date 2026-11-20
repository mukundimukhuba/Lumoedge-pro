#!/usr/bin/env node
/**
 * Confirm managed_eas + license_keys are reachable (names/status only; no row dumps).
 * Prefers service role when present; falls back to anon.
 */
import {
  readSupabaseAnonKey,
  readSupabaseServiceRoleKey,
  readSupabaseUrl,
  secretStatus,
} from './supabase-env.mjs';

const url = readSupabaseUrl();
const serviceKey = readSupabaseServiceRoleKey();
const anonKey = readSupabaseAnonKey();
const key = serviceKey || anonKey;
const status = secretStatus();

console.log('Secret names:', JSON.stringify(status));

if (!url || !key) {
  console.error(
    'Missing SUPABASE_URL and a key (ANON or SERVICE_ROLE) — cannot verify.',
  );
  process.exit(2);
}

const base = url.replace(/\/$/, '');
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  Accept: 'application/json',
};

async function probe(table) {
  const res = await fetch(
    `${base}/rest/v1/${table}?select=id&limit=1`,
    { headers },
  );
  const text = await res.text();
  let reachable = res.ok;
  let detail = `HTTP ${res.status}`;
  if (!res.ok) {
    // Prefer PostgREST error code/message shape without dumping data
    try {
      const j = JSON.parse(text);
      detail = `${detail} code=${j.code || '?'} msg=${j.message || j.error || 'n/a'}`;
    } catch {
      detail = `${detail} (non-json body)`;
    }
  } else {
    try {
      const rows = JSON.parse(text);
      detail = `${detail} rows_sample=${Array.isArray(rows) ? rows.length : '?'}`;
    } catch {
      detail = `${detail} (ok)`;
    }
  }
  return { table, reachable, detail };
}

async function probeBucket() {
  // Public bucket list via storage API
  const res = await fetch(`${base}/storage/v1/bucket/ea-pictures`, {
    headers,
  });
  return {
    table: 'storage.bucket:ea-pictures',
    reachable: res.ok,
    detail: `HTTP ${res.status}`,
  };
}

const results = [];
for (const t of ['managed_eas', 'license_keys']) {
  results.push(await probe(t));
}
results.push(await probeBucket());

let allOk = true;
for (const r of results) {
  console.log(`${r.reachable ? 'OK' : 'FAIL'} ${r.table} — ${r.detail}`);
  if (!r.reachable) allOk = false;
}

if (!allOk) {
  process.exit(1);
}
console.log('Tables reachable: managed_eas, license_keys (+ ea-pictures bucket).');
