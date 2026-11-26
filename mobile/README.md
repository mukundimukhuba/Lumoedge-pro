# Lumo Edge Pro (mobile)

Expo (React Native) app for EA control, chart scanner, broker connect, and Mentors Portal.
Uses production APIs at [https://lumoedgepro.vercel.app](https://lumoedgepro.vercel.app) (Supabase + MT5 bridge) — no parallel backend.

## Run (dev)

```bash
cd mobile
npm install
npx expo start
```

Press `w` for web, or scan the QR with Expo Go / a development build.

## Android packaging

- **Package:** `com.lumoedgepro.app`
- **Splash:** bouncing robot mascot + “Welcome to Lumo Edge Pro” (`WelcomeSplash` + native splash asset)
- **Permissions:** camera, photos (`READ_MEDIA_IMAGES` / `READ_EXTERNAL_STORAGE`), internet / network state
- **Production config:** native loads Supabase anon URL/key from `https://lumoedgepro.vercel.app/api/public-config` when build-time env is empty (`hydrateSupabaseConfig` + `src/apiRoot.ts`)

### EAS Build (recommended)

```bash
cd mobile
npm install
npx eas-cli@latest login
npx eas-cli@latest init   # once — links Expo projectId into app.json
# Preview APK (sideload):
npx eas-cli@latest build -p android --profile preview
# Play Store AAB:
npx eas-cli@latest build -p android --profile production
```

Optional build-time secrets (otherwise runtime `/api/public-config`):

- `SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_URL`
- `SUPABASE_ANON_KEY` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`

### Local prebuild + Gradle

```bash
cd mobile
npx expo prebuild --platform android --no-install
cd android && ./gradlew assembleRelease   # APK (arm64-v8a only)
# or: ./gradlew bundleRelease            # AAB
```

Release size knobs (via `expo-build-properties` → `gradle.properties`):

- R8 minify + `shrinkResources`
- `reactNativeArchitectures=arm64-v8a` only (no x86 / armeabi-v7a)
- `expo.useLegacyPackaging=true` (compress `.so` inside the APK)
- Hermes on; GIF/WebP RN image decoders off (app uses JPG/PNG)

APK path: `android/app/build/outputs/apk/release/app-release.apk`  
AAB path: `android/app/build/outputs/bundle/release/app-release.aab`

> `android/` is gitignored (Continuous Native Generation). Regenerate with `npx expo prebuild`.  
> Sideload APK is **arm64-only** — covers modern phones; emulators needing x86 must use a multi-ABI or EAS build override.

## Screens / flows (full parity)

Access gate → payment pending → license activate → EA home (blur wallpaper) → Quotes → Chart Scanner (camera/gallery upload) → Connect Broker → Mentors Portal (triple-tap) with Manage EAs / License Keys / pending gate.
