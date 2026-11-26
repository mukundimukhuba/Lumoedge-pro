/**
 * Node smoke checks for Android packaging parity (no emulator required).
 * Verifies API root resolution paths, public-config, and key source modules.
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const require = createRequire(import.meta.url);

const results = [];
function ok(name, pass, detail = '') {
  results.push({ name, pass: Boolean(pass), detail });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ''}`);
}

// 1) Config / packaging
const appJson = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8'));
const expo = appJson.expo;
ok('app name Lumo Edge Pro', expo.name === 'Lumo Edge Pro', expo.name);
ok(
  'android package com.lumoedgepro.app',
  expo.android?.package === 'com.lumoedgepro.app',
  expo.android?.package,
);
ok(
  'splash mascot asset',
  String(expo.splash?.image || '').includes('splash-mascot'),
  expo.splash?.image,
);
ok(
  'camera permission declared',
  (expo.android?.permissions || []).includes('android.permission.CAMERA'),
);
ok(
  'photos permission declared',
  (expo.android?.permissions || []).some((p) =>
    /READ_MEDIA_IMAGES|READ_EXTERNAL_STORAGE/.test(p),
  ),
);
ok(
  'internet permission declared',
  (expo.android?.permissions || []).includes('android.permission.INTERNET'),
);
ok('eas.json present', existsSync(join(root, 'eas.json')));
ok(
  'apiRoot module present',
  existsSync(join(root, 'src/apiRoot.ts')),
);

// 2) Source wiring — AsyncStorage / ImagePicker / SecureStore / blur / nav
const sources = {
  AsyncStorage: [
    'src/AppState.tsx',
    'src/licenseStorage.ts',
    'src/auth/mentorAuth.ts',
    'src/brokers/mt5Token.ts',
    'src/pictureVault.ts',
    'src/scan/scannerPersist.ts',
  ],
  ImagePicker: ['src/ChartScannerScreen.tsx', 'src/portal/ManageEasPanel.tsx'],
  EaBlurWallpaper: ['src/EaBlurWallpaper.tsx', 'app/_layout.tsx'],
  WelcomeSplash: ['src/WelcomeSplash.tsx', 'app/_layout.tsx'],
  expoRouterScreens: [
    'app/index.tsx',
    'app/quotes.tsx',
    'app/chart-scanner.tsx',
    'app/connect-broker.tsx',
    'app/portal/_layout.tsx',
  ],
};

for (const [label, files] of Object.entries(sources)) {
  const missing = files.filter((f) => !existsSync(join(root, f)));
  ok(`${label} files exist`, missing.length === 0, missing.join(',') || 'ok');
}

const secureStoreHits = [];
for (const dir of ['src', 'app']) {
  // light scan — SecureStore should NOT be required (not used)
}
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
ok(
  'SecureStore not a dependency (AsyncStorage used)',
  !pkg.dependencies?.['expo-secure-store'],
  'uses AsyncStorage',
);
ok(
  'AsyncStorage dependency',
  Boolean(pkg.dependencies?.['@react-native-async-storage/async-storage']),
);
ok(
  'expo-image-picker dependency',
  Boolean(pkg.dependencies?.['expo-image-picker']),
);
ok('expo-blur dependency', Boolean(pkg.dependencies?.['expo-blur']));

const apiRootSrc = readFileSync(join(root, 'src/apiRoot.ts'), 'utf8');
ok(
  'production API root hardcoded to Vercel',
  apiRootSrc.includes('https://lumoedgepro.vercel.app'),
);

const hydrateSrc = readFileSync(join(root, 'src/supabase/client.ts'), 'utf8');
ok(
  'hydrate uses apiUrl(/api/public-config)',
  hydrateSrc.includes("apiUrl('/api/public-config')") ||
    hydrateSrc.includes('apiUrl("/api/public-config")'),
);

// 3) Live public-config
const PRODUCTION = 'https://lumoedgepro.vercel.app';
try {
  const res = await fetch(`${PRODUCTION}/api/public-config`, {
    headers: { Accept: 'application/json' },
  });
  const body = await res.json();
  ok('public-config HTTP 200', res.ok, String(res.status));
  ok('public-config configured', body.configured === true);
  ok('public-config has supabaseUrl', Boolean(body.supabaseUrl));
  ok('public-config has anon key', Boolean(body.supabaseAnonKey));
} catch (err) {
  ok('public-config fetch', false, String(err));
}

// 4) Prebuild artifacts (optional if present)
const manifest = join(root, 'android/app/src/main/AndroidManifest.xml');
if (existsSync(manifest)) {
  const xml = readFileSync(manifest, 'utf8');
  ok('prebuild CAMERA in manifest', xml.includes('android.permission.CAMERA'));
  ok(
    'prebuild INTERNET in manifest',
    xml.includes('android.permission.INTERNET'),
  );
  const buildGradle = readFileSync(join(root, 'android/app/build.gradle'), 'utf8');
  ok(
    'prebuild applicationId',
    buildGradle.includes("applicationId 'com.lumoedgepro.app'"),
  );
} else {
  ok('android/ prebuild (optional)', true, 'not generated in this checkout');
}

const failed = results.filter((r) => !r.pass);
console.log('\n---');
console.log(
  `Smoke: ${results.length - failed.length}/${results.length} passed`,
);
if (failed.length) {
  console.error('Failures:', failed.map((f) => f.name).join(', '));
  process.exit(1);
}
