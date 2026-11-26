const fs = require('fs');
const path = require('path');

/** Publish Expo web into dist-web only (Vercel outputDirectory). Keep api/ at repo root for serverless + env. */
const dest = path.join(__dirname, '..', 'dist-web');
if (!fs.existsSync(dest)) {
  console.error('Missing dist-web');
  process.exit(1);
}
if (!fs.existsSync(path.join(dest, 'index.html'))) {
  console.error('Missing dist-web/index.html');
  process.exit(1);
}

/** Ensure dark edge-to-edge status bar meta survives export (AN-78). */
function ensureDarkEdgeHtml(file) {
  let html = fs.readFileSync(file, 'utf8');
  const injections = [];
  if (!/name=["']theme-color["']/i.test(html)) {
    injections.push('<meta name="theme-color" content="#000000" />');
  }
  if (!/apple-mobile-web-app-status-bar-style/i.test(html)) {
    injections.push(
      '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
    );
  }
  if (!/apple-mobile-web-app-capable/i.test(html)) {
    injections.push('<meta name="apple-mobile-web-app-capable" content="yes" />');
  }
  if (!/name=["']color-scheme["']/i.test(html)) {
    injections.push('<meta name="color-scheme" content="dark" />');
  }
  if (!/rel=["']apple-touch-icon["']/i.test(html)) {
    injections.push('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
  }
  if (!/rel=["']manifest["']/i.test(html)) {
    injections.push('<link rel="manifest" href="/site.webmanifest" />');
  }
  if (!/id=["']lumo-boot-splash-css["']/i.test(html) && !/lumoBootBounce/i.test(html)) {
    injections.push(
      '<style id="lumo-boot-splash-css">#lumo-boot-splash{position:fixed;inset:0;z-index:2147483646;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#000;color:#F3F4F6;font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;pointer-events:none}#lumo-boot-splash img{width:168px;height:168px;object-fit:contain;margin-bottom:22px;animation:lumoBootBounce 1.04s ease-in-out infinite}#lumo-boot-splash p{margin:0;font-size:20px;font-weight:600;text-align:center;padding:0 28px;opacity:0;animation:lumoBootFade 480ms ease-out 180ms forwards}@keyframes lumoBootBounce{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-18px) scale(1.06)}}@keyframes lumoBootFade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}</style>',
    );
  }
  if (/name=["']viewport["'][^>]*>/i.test(html)) {
    html = html.replace(/name=["']viewport["']([^>]*)content=["']([^"']*)["']/i, (m, attrs, content) => {
      let next = content;
      if (!/viewport-fit\s*=\s*cover/i.test(next)) {
        next = `${next.replace(/,?\s*$/, '')}, viewport-fit=cover`;
      }
      return `name="viewport"${attrs}content="${next}"`;
    });
  }
  if (!/background:\s*#000000|background-color:\s*#000000/i.test(html)) {
    injections.push(
      '<style id="edges-dark-edge">html,body,#root{background:#000000!important;background-color:#000000!important;color-scheme:dark}</style>',
    );
  }
  if (injections.length) {
    html = html.replace(/<\/head>/i, `${injections.join('\n')}\n</head>`);
  }
  html = html.replace(
    /<html([^>]*)>/i,
    (m, attrs) =>
      /style=/i.test(attrs)
        ? m
        : `<html${attrs} style="background-color:#000000">`,
  );
  // Pre-JS bounce splash in <body> if export did not emit +html.tsx markup.
  if (!/id=["']lumo-boot-splash["']/i.test(html) || !/<div[^>]+id=["']lumo-boot-splash["']/i.test(html)) {
    const bootDiv =
      '<div id="lumo-boot-splash" aria-hidden="true"><img src="/splash-mascot.png" alt="" width="168" height="168"/><p>Welcome to Lumo Edge Pro</p></div>';
    if (/<body[^>]*>/i.test(html)) {
      html = html.replace(/<body([^>]*)>/i, `<body$1>${bootDiv}`);
    }
  }
  fs.writeFileSync(file, html);
}

ensureDarkEdgeHtml(path.join(dest, 'index.html'));

/** Branding / PWA assets from mobile/public (icons + boot mascot + manifest). */
const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'mobile', 'public');
const brandFiles = [
  'apple-touch-icon.png',
  'favicon.ico',
  'favicon-16x16.png',
  'favicon-32x32.png',
  'icon-192.png',
  'icon-512.png',
  'site.webmanifest',
  'splash-mascot.png',
];
for (const name of brandFiles) {
  const from = path.join(publicDir, name);
  if (!fs.existsSync(from)) continue;
  fs.copyFileSync(from, path.join(dest, name));
}

for (const p of ['portal', 'portal/dashboard', 'portal/pending']) {
  fs.mkdirSync(path.join(dest, p), { recursive: true });
  fs.copyFileSync(path.join(dest, 'index.html'), path.join(dest, p, 'index.html'));
}
fs.copyFileSync(path.join(dest, 'index.html'), path.join(dest, '404.html'));

// Optional local convenience copy to repo root (does not overwrite api/)
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, ent.name);
    const b = path.join(to, ent.name);
    if (ent.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}
for (const name of ['_expo', 'assets']) {
  const from = path.join(dest, name);
  if (fs.existsSync(from)) copyDir(from, path.join(root, name));
}
fs.copyFileSync(path.join(dest, 'index.html'), path.join(root, 'index.html'));
for (const name of brandFiles) {
  const from = path.join(dest, name);
  if (fs.existsSync(from)) fs.copyFileSync(from, path.join(root, name));
}
for (const p of ['portal', 'portal/dashboard', 'portal/pending']) {
  fs.mkdirSync(path.join(root, p), { recursive: true });
  fs.copyFileSync(path.join(dest, 'index.html'), path.join(root, p, 'index.html'));
}
fs.copyFileSync(path.join(dest, 'index.html'), path.join(root, '404.html'));

console.log('Published static Expo web to dist-web (+ root mirror; api/ untouched)');
