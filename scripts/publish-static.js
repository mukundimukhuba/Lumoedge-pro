const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'dist-web');
const dest = path.join(__dirname, '..');
if (!fs.existsSync(src)) {
  console.error('Missing dist-web');
  process.exit(1);
}
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
  const from = path.join(src, name);
  if (fs.existsSync(from)) copyDir(from, path.join(dest, name));
}
fs.copyFileSync(path.join(src, 'index.html'), path.join(dest, 'index.html'));
if (fs.existsSync(path.join(src, 'favicon.ico'))) {
  fs.copyFileSync(path.join(src, 'favicon.ico'), path.join(dest, 'favicon.ico'));
}
for (const p of ['portal', 'portal/dashboard']) {
  fs.mkdirSync(path.join(dest, p), { recursive: true });
  fs.copyFileSync(path.join(dest, 'index.html'), path.join(dest, p, 'index.html'));
}
fs.copyFileSync(path.join(dest, 'index.html'), path.join(dest, '404.html'));
console.log('Published static Expo web to repo root');
