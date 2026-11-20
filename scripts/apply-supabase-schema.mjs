#!/usr/bin/env node
/**
 * Apply supabase/migrations/*.sql using the service role.
 * Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (never logged).
 * Also accepts legacy alias `supabase` for the service role.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  readSupabaseServiceRoleKey,
  readSupabaseUrl,
  secretStatus,
} from './supabase-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const url = readSupabaseUrl();
const serviceKey = readSupabaseServiceRoleKey();
const status = secretStatus();

console.log('Secret names:', JSON.stringify(status));

if (!url || !serviceKey) {
  console.error(
    'Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY — skip apply.',
  );
  process.exit(2);
}

const migrationsDir = path.join(root, 'supabase', 'migrations');
const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

if (!files.length) {
  console.error('No SQL migrations found');
  process.exit(1);
}

const sql = files
  .map((f) => fs.readFileSync(path.join(migrationsDir, f), 'utf8'))
  .join('\n\n');

async function applyViaPgMeta() {
  const base = url.replace(/\/$/, '');
  const res = await fetch(`${base}/rest/v1/`, {
    method: 'GET',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Supabase REST unreachable (${res.status})`);
  }

  console.log(
    `REST reachable. Migrations ready (${files.join(', ')}).`,
  );

  // Attempt pg-meta query endpoint (present on some projects / local stacks):
  const pg = await fetch(`${base}/pg/query`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  if (pg.ok) {
    console.log('Schema applied via /pg/query');
    return;
  }

  // Some projects expose postgres-meta under /pg/meta/default/query
  const pgMeta = await fetch(`${base}/pg/meta/default/query`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  if (pgMeta.ok) {
    console.log('Schema applied via /pg/meta/default/query');
    return;
  }

  console.warn(
    `Auto-apply skipped (pg/query ${pg.status}, pg/meta ${pgMeta.status}).`,
  );
  console.warn(
    'Apply manually: Supabase → SQL → New query → paste supabase/migrations/*.sql → Run.',
  );
  process.exit(0);
}

applyViaPgMeta().catch((err) => {
  console.error(String(err?.message || err));
  process.exit(1);
});
