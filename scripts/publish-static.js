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

for (const p of ['portal', 'portal/dashboard']) {
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
for (const p of ['portal', 'portal/dashboard']) {
  fs.mkdirSync(path.join(root, p), { recursive: true });
  fs.copyFileSync(path.join(dest, 'index.html'), path.join(root, p, 'index.html'));
}
fs.copyFileSync(path.join(dest, 'index.html'), path.join(root, '404.html'));

console.log('Published static Expo web to dist-web (+ root mirror; api/ untouched)');
