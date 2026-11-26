const { applyCors } = require('../_lib/cors');

/**
 * Phone-friendly APK download entry.
 * Redirects to the static APK (same origin) with attachment semantics via
 * Vercel headers on `/download/lumo-edge-pro.apk`. Falls back to the GitHub
 * Release asset if the static file is unavailable on this deploy.
 *
 * Not a serverless stream — 18MB exceeds typical function body limits.
 */
const STATIC_PATH = '/download/lumo-edge-pro.apk';
const GITHUB_RELEASE =
  'https://github.com/mukundimukhuba/Lumoedge-pro/releases/download/android-v1.0.0-slim/lumo-edge-pro.apk';

module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  const preferMirror =
    String(req.query?.mirror || req.query?.source || '').toLowerCase() ===
    'github';

  const target = preferMirror ? GITHUB_RELEASE : STATIC_PATH;
  res.statusCode = 302;
  res.setHeader('Location', target);
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.end();
};
