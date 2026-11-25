/** Hardcoded super-admin identity (also enforced in SQL RPCs). */
const SUPER_ADMIN_EMAIL = 'mukundimukhuba8@gmail.com';

function normalizeEmail(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase();
}

function isSuperAdminEmail(raw) {
  return normalizeEmail(raw) === SUPER_ADMIN_EMAIL;
}

module.exports = {
  SUPER_ADMIN_EMAIL,
  normalizeEmail,
  isSuperAdminEmail,
};
