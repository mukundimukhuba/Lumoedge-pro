#!/usr/bin/env node
/**
 * Apply supabase/migrations/*.sql using the service role when possible.
 * Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (never logged).
 * Also accepts legacy alias `supabase` for the service role.
 * Optional: SUPABASE_ACCESS_TOKEN for Management API migrations.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  normalizeSupabaseUrl,
  readSupabaseServiceRoleKey,
  readSupabaseUrl,
  secretStatus,
} from './supabase-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const url = readSupabaseUrl();
const serviceKey = readSupabaseServiceRoleKey();
const accessToken = (process.env.SUPABASE_ACCESS_TOKEN || '').trim();
const status = secretStatus();

console.log('Secret names:', JSON.stringify(status));
if (status.urlHadRestPath) {
  console.log('Note: SUPABASE_URL had /rest/v1 — normalized to project root.');
}

if (!url || !serviceKey) {
  console.error(
    'Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY — skip apply.',
  );
  process.exit(2);
}

const migrationsDir = path.join(root, 'supabase', 'migrations');
const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql') && !f.startsWith('_'))
  .sort();

if (!files.length) {
  console.error('No SQL migrations found');
  process.exit(1);
}

const sql = files
  .map((f) => fs.readFileSync(path.join(migrationsDir, f), 'utf8'))
  .join('\n\n');

function projectRefFromUrl(projectUrl) {
  try {
    const host = new URL(projectUrl).hostname;
    const ref = host.split('.')[0];
    return ref || null;
  } catch {
    return null;
  }
}

async function ensureEaPicturesBucket(base) {
  const res = await fetch(`${base}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: 'ea-pictures',
      name: 'ea-pictures',
      public: true,
    }),
  });
  if (res.ok || res.status === 409) {
    console.log(
      res.ok
        ? 'Storage bucket ea-pictures created (or ensured).'
        : 'Storage bucket ea-pictures already exists.',
    );
    return true;
  }
  const text = await res.text();
  // "already exists" shapes vary
  if (/already|exists|duplicate/i.test(text)) {
    console.log('Storage bucket ea-pictures already exists.');
    return true;
  }
  console.warn(`Bucket ensure skipped (HTTP ${res.status}).`);
  return false;
}

async function applyViaManagementApi(ref) {
  if (!accessToken) return false;
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/migrations`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: files.join('+'),
        query: sql,
      }),
    },
  );
  if (res.ok) {
    console.log('Schema applied via Management API migrations.');
    return true;
  }
  console.warn(`Management API migrations HTTP ${res.status}.`);
  return false;
}

async function applyViaPgMeta(base) {
  const rest = await fetch(`${base}/rest/v1/`, {
    method: 'GET',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  // Empty schema still returns OpenAPI at /rest/v1/ (200) or PGRST paths
  if (!(rest.ok || rest.status === 404)) {
    throw new Error(`Supabase REST unreachable (${rest.status})`);
  }

  console.log(
    `REST reachable. Migrations ready (${files.join(', ')}).`,
  );

  for (const endpoint of ['/pg/query', '/pg/meta/default/query']) {
    const pg = await fetch(`${base}${endpoint}`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    });
    if (pg.ok) {
      console.log(`Schema applied via ${endpoint}`);
      return true;
    }
  }
  return false;
}

async function main() {
  const base = normalizeSupabaseUrl(url);
  const ref = projectRefFromUrl(base);

  await ensureEaPicturesBucket(base);

  if (ref && (await applyViaManagementApi(ref))) {
    return;
  }

  if (await applyViaPgMeta(base)) {
    return;
  }

  // Write a single paste-ready file (no secrets) for SQL editor.
  const combinedPath = path.join(migrationsDir, '_combined_for_sql_editor.sql');
  fs.writeFileSync(
    combinedPath,
    `-- Combined ${files.join(' + ')}\n-- Paste into Supabase → SQL → New query → Run\n\n${sql}\n`,
    'utf8',
  );
  console.warn(
    'Auto-apply of SQL skipped (hosted Supabase has no /pg/query; no SUPABASE_ACCESS_TOKEN).',
  );
  console.warn(
    `Apply manually: Supabase → SQL → New query → paste ${path.relative(root, combinedPath)} → Run.`,
  );
  console.warn(
    'Or add Cloud Agent secret SUPABASE_ACCESS_TOKEN (Management API) and re-run supabase:apply.',
  );
  // Soft exit: bucket may already be done; tables still need manual SQL.
  process.exit(0);
}

main().catch((err) => {
  console.error(String(err?.message || err));
  process.exit(1);
});
