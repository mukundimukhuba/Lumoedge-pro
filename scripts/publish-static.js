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
  fs.writeFileSync(file, html);
}

ensureDarkEdgeHtml(path.join(dest, 'index.html'));

for (const p of ['portal', 'portal/dashboard', 'portal/pending']) {
  fs.mkdirSync(path.join(dest, p), { recursive: true });
  fs.copyFileSync(path.join(dest, 'index.html'), path.join(dest, p, 'index.html'));
}
fs.copyFileSync(path.join(dest, 'index.html'), path.join(dest, '404.html'));

// Optional local convenience copy to repo root (does not overwrite api/)
const root = path.join(__dirname, '..');
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
if (fs.existsSync(path.join(dest, 'favicon.ico'))) {
  fs.copyFileSync(path.join(dest, 'favicon.ico'), path.join(root, 'favicon.ico'));
}
for (const p of ['portal', 'portal/dashboard', 'portal/pending']) {
  fs.mkdirSync(path.join(root, p), { recursive: true });
  fs.copyFileSync(path.join(dest, 'index.html'), path.join(root, p, 'index.html'));
}
fs.copyFileSync(path.join(dest, 'index.html'), path.join(root, '404.html'));

console.log('Published static Expo web to dist-web (+ root mirror; api/ untouched)');
