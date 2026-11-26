/**
 * Local brokers API for Expo web proofs (port 8787).
 * Uses the same handlers as Vercel /api/brokers*.
 * Optional: BROKER_API_URL env (never put passwords on argv).
 */
import http from 'http';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const listHandler = require(path.join(__dirname, 'brokers', 'index.js'));
const connectHandler = require(path.join(__dirname, 'brokers', 'connect.js'));
const healthHandler = require(path.join(__dirname, 'brokers', 'health.js'));
const accountHandler = require(path.join(__dirname, 'brokers', 'account.js'));
const orderHandler = require(path.join(__dirname, 'brokers', 'order.js'));
const symbolsHandler = require(path.join(__dirname, 'brokers', 'symbols.js'));
const scanHandler = require(path.join(__dirname, 'scan', 'index.js'));
const scanStatusHandler = require(path.join(__dirname, 'scan', 'status.js'));
const scanAutoHandler = require(path.join(__dirname, 'scan', 'auto.js'));

const PORT = Number(process.env.BROKERS_DEV_PORT || 8787);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  const fakeRes = {
    statusCode: 200,
    setHeader: (k, v) => res.setHeader(k, v),
    end: (body) => {
      res.statusCode = fakeRes.statusCode;
      res.end(body);
    },
  };

  try {
    if (url.pathname === '/api/brokers' || url.pathname === '/brokers') {
      req.url = `/api/brokers${url.search}`;
      await listHandler(req, fakeRes);
      return;
    }
    if (
      url.pathname === '/api/brokers/connect' ||
      url.pathname === '/brokers/connect'
    ) {
      req.url = '/api/brokers/connect';
      await connectHandler(req, fakeRes);
      return;
    }
    if (
      url.pathname === '/api/brokers/health' ||
      url.pathname === '/brokers/health'
    ) {
      req.url = '/api/brokers/health';
      await healthHandler(req, fakeRes);
      return;
    }
    if (
      url.pathname === '/api/brokers/account' ||
      url.pathname === '/brokers/account'
    ) {
      req.url = `/api/brokers/account${url.search}`;
      await accountHandler(req, fakeRes);
      return;
    }
    if (
      url.pathname === '/api/brokers/order' ||
      url.pathname === '/brokers/order'
    ) {
      req.url = '/api/brokers/order';
      await orderHandler(req, fakeRes);
      return;
    }
    if (
      url.pathname === '/api/brokers/symbols' ||
      url.pathname === '/brokers/symbols'
    ) {
      req.url = `/api/brokers/symbols${url.search}`;
      await symbolsHandler(req, fakeRes);
      return;
    }
    if (url.pathname === '/api/scan' || url.pathname === '/scan') {
      req.url = '/api/scan';
      await scanHandler(req, fakeRes);
      return;
    }
    if (
      url.pathname === '/api/scan/status' ||
      url.pathname === '/scan/status'
    ) {
      req.url = '/api/scan/status';
      await scanStatusHandler(req, fakeRes);
      return;
    }
    if (url.pathname === '/api/scan/auto' || url.pathname === '/scan/auto') {
      req.url = '/api/scan/auto';
      await scanAutoHandler(req, fakeRes);
      return;
    }
    if (url.pathname === '/health') {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          ok: true,
          upstreamConfigured: Boolean(process.env.BROKER_API_URL),
        }),
      );
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Server error' }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[brokers-api] listening on http://127.0.0.1:${PORT}`);
  console.log(
    `[brokers-api] BROKER_API_URL ${process.env.BROKER_API_URL ? 'set' : 'unset (local catalog)'}`,
  );
});
