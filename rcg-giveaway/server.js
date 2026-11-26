/**
 * Isolated RCG giveaway host.
 * Serves secret static HTML + /api/giveaway/* only.
 * Not the main Lumo Edge Pro PWA — do not merge into production app routes.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const verify = require('./api/verify');
const claim = require('./api/claim');
const {
  giveawayAccessToken,
  giveawaySecretPath,
} = require('./lib/giveaway');

const PORT = Number(process.env.PORT || 8080);
const PUBLIC_DIR = path.join(__dirname, 'public');
const SECRET_PATH = giveawaySecretPath();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function safeJoin(root, reqPath) {
  const decoded = decodeURIComponent(reqPath.split('?')[0]);
  const cleaned = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(root, cleaned);
  if (!full.startsWith(root)) return null;
  return full;
}

function serveStatic(req, res, pathname) {
  let rel = pathname;
  if (rel === SECRET_PATH || rel === `${SECRET_PATH}/`) {
    rel = `${SECRET_PATH}/index.html`;
  }
  const filePath = safeJoin(PUBLIC_DIR, rel);
  if (!filePath) {
    return send(res, 404, 'Not found');
  }
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      return send(res, 404, 'Not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control':
        ext === '.html' ? 'no-store' : 'public, max-age=3600',
      'X-Robots-Tag': 'noindex, nofollow',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || 'localhost';
    const url = new URL(req.url || '/', `http://${host}`);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';

    if (pathname === '/health' || pathname === '/api/health') {
      return send(
        res,
        200,
        JSON.stringify({
          ok: true,
          service: 'rcg-giveaway-host',
          secretPath: SECRET_PATH,
        }),
        { 'Content-Type': 'application/json; charset=utf-8' },
      );
    }

    if (
      pathname === '/api/giveaway/verify' ||
      pathname === '/api/giveaway/verify/'
    ) {
      // Preserve query string for GET ?t=
      req.url = url.pathname + url.search;
      return verify(req, res);
    }

    if (
      pathname === '/api/giveaway/claim' ||
      pathname === '/api/giveaway/claim/'
    ) {
      req.url = url.pathname + url.search;
      return claim(req, res);
    }

    // Invite page + static assets only. Root is intentionally opaque.
    if (
      pathname === SECRET_PATH ||
      pathname.startsWith(`${SECRET_PATH}/`) ||
      pathname === '/favicon.ico' ||
      pathname === '/apple-touch-icon.png' ||
      pathname === '/splash-mascot.png'
    ) {
      return serveStatic(req, res, pathname === SECRET_PATH ? `${SECRET_PATH}/` : pathname);
    }

    return send(res, 404, 'Not found', {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
    });
  } catch (err) {
    console.error('giveaway-host error', err && err.message);
    if (!res.headersSent) {
      send(res, 500, JSON.stringify({ ok: false, error: 'Server error' }), {
        'Content-Type': 'application/json; charset=utf-8',
      });
    }
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(
    `rcg-giveaway-host listening on :${PORT} path=${SECRET_PATH} tokenLen=${giveawayAccessToken().length}`,
  );
});
