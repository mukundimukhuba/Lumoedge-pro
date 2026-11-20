#!/usr/bin/env node
/**
 * Apply supabase/migrations/*.sql using the service role.
 * Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (never logged).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const url = (process.env.SUPABASE_URL || '').trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

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

const endpoint = `${url.replace(/\/$/, '')}/rest/v1/rpc/`;
// Prefer PostgREST isn't ideal for raw SQL — use the SQL API via pg meta if available.
// Supabase Management SQL: /pg/query on the project (service role via fetch to db).
// Use the standard approach: POST to https://api.supabase.com is account-level.
// For project, execute via postgres REST isn't exposed. Use supabase-js rpc or
// the database URL. Fallback: print instructions if fetch to pg fails.

async function applyViaPgMeta() {
  // Hosted Supabase SQL endpoint used by dashboard (pg-meta):
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/`, {
    method: 'GET',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Supabase REST unreachable (${res.status})`);
  }

  // Execute migration statements one-by-one through rpc if a helper exists —
  // otherwise tell the operator to paste SQL in the SQL editor.
  console.log(
    'REST reachable. Applying via supabase SQL editor is required if /pg/query is unavailable.',
  );
  console.log(`Migrations ready (${files.join(', ')}).`);
  console.log(
    'Open Supabase → SQL → New query, paste supabase/migrations/001_managed_eas_license_keys.sql, Run.',
  );
  // Attempt pg-meta query endpoint (present on some projects):
  const pg = await fetch(`${url.replace(/\/$/, '')}/pg/query`, {
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
  console.warn(
    `Auto-apply skipped (pg/query ${pg.status}). Apply the SQL file manually in the dashboard.`,
  );
  process.exit(0);
}

applyViaPgMeta().catch((err) => {
  console.error(String(err?.message || err));
  process.exit(1);
});
