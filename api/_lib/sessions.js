/**
 * Sessions module retained for import compatibility.
 * Mock/demo balances and seed trades have been removed.
 * Live account data comes from api/_lib/mt5Live.js only.
 */

module.exports = {
  createSession() {
    throw new Error('Live MT5 connect required — mock sessions are disabled');
  },
  getSession() {
    return null;
  },
  publicAccount() {
    return null;
  },
};
