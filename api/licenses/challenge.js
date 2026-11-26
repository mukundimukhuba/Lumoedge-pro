const { applyCors, json, readJsonBody } = require('../_lib/cors');
const {
  publicCaptchaConfig,
  issueCheckboxToken,
  PROVIDER_CHECKBOX,
} = require('../_lib/humanChallenge');

/**
 * GET/POST /api/licenses/challenge
 * - GET: public captcha provider + site key (never secrets)
 * - POST { checked: true, actorEmail? }: issue short-lived checkbox token
 *   when no Turnstile/reCAPTCHA keys are configured.
 */
module.exports = async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const captcha = publicCaptchaConfig();

  if (req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      captcha,
    });
  }

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { ok: false, error: 'Invalid JSON body' });
  }

  // Third-party providers: client verifies via widget; we only advertise config.
  if (captcha.provider !== PROVIDER_CHECKBOX) {
    return json(res, 200, {
      ok: true,
      captcha,
      token: null,
      hint: `Complete the ${captcha.provider} widget; pass its response as challengeToken on generate.`,
    });
  }

  if (!body.checked) {
    return json(res, 400, {
      ok: false,
      error: 'Check “I’m not a robot” to continue',
      captcha,
    });
  }

  const token = issueCheckboxToken(body.actorEmail || '');
  return json(res, 200, {
    ok: true,
    captcha,
    provider: PROVIDER_CHECKBOX,
    token,
    expiresInSec: 600,
  });
};
