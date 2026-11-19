# Edges EA Control (Expo web)

Lumo Edge Pro EA control UI + Mentors Portal (Manage EAs, License Keys, Activate).

## Vercel

Static Expo web export at the repository root. Connect this GitHub repo to **your** Vercel account and deploy (Framework Preset: Other, Output Directory `.`).

Local: `npx serve -s . -l 8099` → `http://127.0.0.1:8099/`

## Rebuild from source

```bash
cd mobile && npm install
npx expo export --platform web --output-dir ../dist-web
cd .. && node scripts/publish-static.js
```

Triple-tap the logo → `/portal` for Mentors Portal.
