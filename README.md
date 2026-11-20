# Edges EA Control (Expo web)

Lumo Edge Pro EA control UI + Mentors Portal (Manage EAs, License Keys, Activate).

## Supabase (cross-device license + EA pictures)

Required **Cloud Agent / Vercel** secret names (values never committed):

| Name | Used for |
|------|----------|
| `SUPABASE_URL` | Project URL only (`https://<ref>.supabase.co`) — not `/rest/v1` |
| `SUPABASE_ANON_KEY` | Portal + Activate client sync |
| `SUPABASE_SERVICE_ROLE_KEY` | Apply/verify scripts (alias `supabase` also accepted) |
| `SUPABASE_ACCESS_TOKEN` | Optional Management API token so `supabase:apply` can run SQL |

```bash
npm run supabase:status   # names only
npm run supabase:apply    # ensures ea-pictures bucket; SQL via Management API or manual paste
npm run supabase:verify   # confirms managed_eas + license_keys reachable
```

If verify fails with `PGRST205`, paste `supabase/migrations/*.sql` into the Supabase SQL editor once (or add `SUPABASE_ACCESS_TOKEN` and re-run apply).

## Vercel

`vercel.json` builds with `npm run export:web` so `SUPABASE_URL` + `SUPABASE_ANON_KEY` bake into the static client. Set those two on the Vercel project (never the service role).

Local static: `npx serve -s . -l 8099` → `http://127.0.0.1:8099/`

## Rebuild from source

```bash
cd mobile && npm install
npx expo export --platform web --output-dir ../dist-web
cd .. && node scripts/publish-static.js
```

Triple-tap the logo → `/portal` for Mentors Portal.
