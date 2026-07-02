/**
 * ===========================================
 * AUTH CONFIGURATION - JWT + Multi-user
 * ===========================================
 *
 * Supports multiple users with roles.
 * All users share the same password (hashed with bcrypt).
 */

const bcrypt = require('bcryptjs');

// ===========================================
// VALID USERS (username -> role)
// ===========================================
const USERS = {
  admin:   { role: 'admin' },
  asesor1: { role: 'agent' },
  asesor2: { role: 'agent' },
  asesor3: { role: 'agent' },
};

// ===========================================
// SHARED PASSWORD (all users)
// ===========================================
const PASSWORD_HASH = '$2a$10$U90MuLTS9I5/vasHFhulEuqHD/RUI.7VtRpzoYcyqps/0XoYFz156'; // constructora2026
const RAW_PASSWORD = 'constructora2026'; // Reference only — do NOT use in production

// Ensure the hash is valid (fallback to re-hash if placeholder)
const DEFAULT_PASSWORD_HASH = '$2a$10$YourHashedPasswordHere';
const passwordHash = PASSWORD_HASH === DEFAULT_PASSWORD_HASH
  ? bcrypt.hashSync(RAW_PASSWORD, 10)
  : PASSWORD_HASH;

// ===========================================
// JWT CONFIGURATION
// ===========================================
const JWT_CONFIG = {
  secret: process.env.JWT_SECRET || 'CHANGE-THIS-SECRET-IN-PRODUCTION',
  expiresIn: process.env.JWT_EXPIRES_IN || '24h'
};

// ===========================================
// HELPERS
// ===========================================

/**
 * Look up a user by username.
 * @param {string} username
 * @returns {{ username: string, role: string } | null}
 */
function getUser(username) {
  if (!username) return null;
  const entry = USERS[username];
  if (!entry) return null;
  return { username, role: entry.role };
}

/**
 * Validate a plain-text password against the shared hash.
 * @param {string} plainPassword
 * @returns {boolean}
 */
function validatePassword(plainPassword) {
  return bcrypt.compareSync(plainPassword, passwordHash);
}

// ===========================================
// EXPORTS
// ===========================================
module.exports = {
  // Legacy single-user field (kept for any code that reads it)
  username: 'admin',
  passwordHash,

  // Multi-user helpers
  getUser,
  validatePassword,

  // JWT
  jwtSecret: JWT_CONFIG.secret,
  jwtExpiresIn: JWT_CONFIG.expiresIn,
};
