# Edges EA Control (Expo web)

Lumo Edge Pro EA control UI + Mentors Portal (Manage EAs, License Keys, Activate).

## Supabase (cross-device license + EA pictures)

Required secret **names** (values never committed; never paste into chat):

| Name | Where | Used for |
|------|--------|----------|
| `SUPABASE_URL` | Vercel + Cloud Agent | Project URL only (`https://<ref>.supabase.co`) — strip `/rest/v1` if pasted |
| `SUPABASE_ANON_KEY` | Vercel + Cloud Agent | Expo web client (`app.config.js` → `extra`) + Mentors/Activate |
| `SUPABASE_SERVICE_ROLE_KEY` | **Vercel (required for cloud Generate→Activate)** + Cloud Agent | `/api/licenses/put`, `/api/licenses/lookup`, `/api/licenses/status`; scripts also accept legacy alias `supabase` |
| `SUPABASE_ACCESS_TOKEN` | Cloud Agent only (optional) | Management API so `supabase:apply` can run SQL |

```bash
npm run supabase:status   # names only — never prints values
npm run supabase:apply    # ensures ea-pictures bucket; SQL via Management API or manual paste
npm run supabase:verify   # confirms managed_eas + license_keys reachable
```

If Mentors Portal shows **“Supabase env incomplete on server”**, the Vercel deployment is missing one of `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (and usually `SUPABASE_ANON_KEY` for the client build). Set them in the **Vercel project → Settings → Environment Variables** for Production (and Preview if you use preview deploys), then redeploy.

**Cursor secrets do not auto-bind to Vercel.** There is no Cursor→Vercel secret bridge for this repo:

| System | What it does |
|--------|----------------|
| Cursor Cloud Agent secrets | Injected into agent VMs only (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, legacy alias `supabase` for service role) |
| Cursor `bind-app-secrets` / publish-app | Cursor-hosted apps only — **not** the Vercel `lumoedgepro` deployment |
| **Vercel project env** | Required for production `/api/licenses/*` |

**You must set these in Vercel** on the project that owns Production (open a GitHub **Vercel** check to see the project URL) → **Settings → Environment Variables**, then **Redeploy**:

1. `SUPABASE_URL`
2. `SUPABASE_ANON_KEY`
3. `SUPABASE_SERVICE_ROLE_KEY` (use this exact name on Vercel — do not rely on the Cloud Agent alias `supabase`)

**Shared tab is not enough:** team **Shared** Environment Variables apply only after they are **linked to the project** (and include **Production**). Prefer **Project** env for these three, or use **Link Shared Environment Variables** on the project, then Redeploy. Untargeted Shared vars never reach `/api/licenses/*`.

CLI (with your Vercel login/token; never paste values into chat):

```bash
vercel env add SUPABASE_URL production
vercel env add SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add SUPABASE_URL preview
vercel env add SUPABASE_ANON_KEY preview
vercel env add SUPABASE_SERVICE_ROLE_KEY preview
```

Do not put the service role in Expo `extra` / `EXPO_PUBLIC_*` / client bundles.

If verify fails with `PGRST205`, paste `supabase/migrations/*.sql` into the Supabase SQL editor once (or add `SUPABASE_ACCESS_TOKEN` and re-run apply).

## Brokers API

Serverless routes (never commit credentials):

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/brokers?q=&limit=` | Search / list brokers |
| `POST` | `/api/brokers/connect` | Connect `{ broker, server, login, password }` |

Optional Vercel / Cloud secret **`BROKER_API_URL`** (e.g. your private broker host). When set, search + connect proxy upstream; when unset, local catalog + demo connect (password not stored). Never put passwords in chat, git, or client env.

Local: `npm run brokers:dev` → `http://127.0.0.1:8787` (Expo web on `:8081` calls it automatically).

## Vercel

`vercel.json` builds with `npm run export:web` into **`dist-web`** (static only). Root **`api/`** stays outside that folder so Vercel Serverless Functions receive project env at runtime.

On the Vercel project that owns Production set:

1. `SUPABASE_URL` + `SUPABASE_ANON_KEY` — baked into the static client via `mobile/app.config.js`
2. `SUPABASE_SERVICE_ROLE_KEY` — **server-only** for `/api/licenses/*` (Generate Key cloud sync + Activate worldwide lookup). Never expose this in client env / `EXPO_PUBLIC_*`.

`/api/*` is served by Vercel functions and excluded from the SPA rewrite. After changing env vars, trigger a new deployment.

Local static: `npx serve -s . -l 8099` → `http://127.0.0.1:8099/`

## Rebuild from source

```bash
cd mobile && npm install
npx expo export --platform web --output-dir ../dist-web
cd .. && node scripts/publish-static.js
```

Triple-tap the logo → `/portal` for Mentors Portal.
