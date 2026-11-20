/**
 * Optional upstream broker host from env secret BROKER_API_URL only.
 * Never log credentials. No hardcoded host/password in this module.
 */

function brokerApiBase() {
  const raw = (process.env.BROKER_API_URL || '').trim().replace(/\/+$/, '');
  return raw || null;
}

async function upstreamSearch(query, limit) {
  const base = brokerApiBase();
  if (!base) return null;
  const url = new URL('/brokers', `${base}/`);
  if (query) url.searchParams.set('q', query);
  if (limit) url.searchParams.set('limit', String(limit));
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const list = Array.isArray(data)
      ? data
      : Array.isArray(data?.brokers)
        ? data.brokers
        : Array.isArray(data?.results)
          ? data.results
          : null;
    if (!list) return null;
    return list
      .map((b) => (typeof b === 'string' ? b : b?.name || b?.broker))
      .filter(Boolean);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Forward connect payload to upstream. Password is sent only over the
 * request body — never written to logs.
 */
async function upstreamConnect(payload) {
  const base = brokerApiBase();
  if (!base) return null;
  const url = new URL('/brokers/connect', `${base}/`);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        broker: payload.broker,
        server: payload.server,
        login: payload.login,
        password: payload.password,
      }),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text?.slice(0, 200) };
    }
    return {
      ok: res.ok,
      status: res.status,
      data,
    };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      data: { error: 'Upstream broker API unreachable' },
    };
  } finally {
    clearTimeout(t);
  }
}

module.exports = {
  brokerApiBase,
  upstreamSearch,
  upstreamConnect,
};
