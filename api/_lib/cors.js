function applyCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization',
  );
}

function json(res, status, body) {
  applyCors(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  let out = body;
  try {
    const { sanitizePublicBody } = require('./safeErrors');
    // Always scrub tech/secret fields from client JSON (2xx diagnostics too).
    if (status >= 400 || (body && body.ok === false)) {
      out = sanitizePublicBody(body);
    } else if (body && typeof body === 'object') {
      // Soft scrub: drop tableError / raw hints / serviceKeyKind on success too
      out = sanitizePublicBody(body);
    }
  } catch {
    out = body;
  }
  res.end(JSON.stringify(out));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

module.exports = { applyCors, json, readJsonBody };
