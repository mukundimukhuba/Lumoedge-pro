# Edges EA Control (Expo web)

Lumo Edge Pro EA control UI + Mentors Portal (Manage EAs, License Keys, Activate).

## Supabase (cross-device license + EA pictures)

Required **Cloud Agent / Vercel** secret names (values never committed):

| Name | Used for |
|------|----------|
| `SUPABASE_URL` | Project URL (`https://<ref>.supabase.co`) |
| `SUPABASE_ANON_KEY` | Portal + Activate client sync |
| `SUPABASE_SERVICE_ROLE_KEY` | `npm run supabase:apply` only (not shipped to browsers) |

```bash
npm run supabase:status   # names only
npm run supabase:apply    # runs supabase/migrations/*.sql when URL + service role set
npm run supabase:verify   # confirms managed_eas + license_keys reachable
```

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
