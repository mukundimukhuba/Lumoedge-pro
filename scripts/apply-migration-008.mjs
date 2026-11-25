#!/usr/bin/env node
/**
 * Apply only 008_license_subscription_approval.sql via Supabase Management API.
 * Needs SUPABASE_URL + SUPABASE_ACCESS_TOKEN (personal access token).
 * Service role alone cannot run DDL on hosted Supabase.
 * Never logs secret values.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  normalizeSupabaseUrl,
  readSupabaseUrl,
  secretStatus,
} from './supabase-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const sqlPath = path.join(
  root,
  'supabase/migrations/008_license_subscription_approval.sql',
);

const url = readSupabaseUrl();
const accessToken = (process.env.SUPABASE_ACCESS_TOKEN || '').trim();
const status = secretStatus();

console.log('Secret status:', JSON.stringify(status));
console.log(
  'SUPABASE_ACCESS_TOKEN:',
  accessToken ? 'SET' : 'MISSING',
);

if (!url) {
  console.error('Missing SUPABASE_URL');
  process.exit(2);
}
if (!accessToken) {
  console.error(
    'Missing SUPABASE_ACCESS_TOKEN — required for Management API SQL (service role cannot DDL).',
  );
  process.exit(2);
}
if (!fs.existsSync(sqlPath)) {
  console.error('Missing migration file 008');
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, 'utf8');
const ref = (() => {
  try {
    return new URL(normalizeSupabaseUrl(url)).hostname.split('.')[0] || null;
  } catch {
    return null;
  }
})();
if (!ref) {
  console.error('Could not parse project ref from SUPABASE_URL');
  process.exit(1);
}

async function runQuery(query) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    },
  );
  const text = await res.text();
  return { ok: res.ok, status: res.status, text: text.slice(0, 400) };
}

async function main() {
  // Prefer database/query (known to return 201 on this project historically).
  const q = await runQuery(sql);
  if (q.ok) {
    console.log(`008 applied via Management API database/query (HTTP ${q.status}).`);
    return;
  }
  console.warn(`database/query HTTP ${q.status}: ${q.text}`);

  const mig = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/migrations`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: '008_license_subscription_approval',
        query: sql,
      }),
    },
  );
  const migText = await mig.text();
  if (mig.ok) {
    console.log('008 applied via Management API migrations.');
    return;
  }
  console.error(`migrations HTTP ${mig.status}: ${migText.slice(0, 400)}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(String(err?.message || err));
  process.exit(1);
});
