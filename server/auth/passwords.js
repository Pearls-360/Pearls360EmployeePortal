import argon2 from 'argon2';

/** OWASP Password Storage Cheat Sheet minimum for Argon2id. */
const HASH_OPTIONS = /** @type {const} */ ({ type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** Verified against when the account doesn't exist, so response timing doesn't reveal valid emails. */
let dummyHash = null;

/** @param {string} password */
export function hashPassword(password) {
  return argon2.hash(password, HASH_OPTIONS);
}

/**
 * @param {string | null | undefined} hash
 * @param {string} password
 */
export async function verifyPassword(hash, password) {
  if (!hash) {
    dummyHash ??= await hashPassword('not-a-real-password-placeholder');
    await argon2.verify(dummyHash, password).catch(() => false);
    return false;
  }
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/** @param {string} hash */
export function needsRehash(hash) {
  try {
    return argon2.needsRehash(hash, HASH_OPTIONS);
  } catch {
    return false;
  }
}

/**
 * @param {unknown} password
 * @param {{ email?: string }} [context]
 * @returns {string | null} error message
 */
export function passwordProblem(password, { email } = {}) {
  if (typeof password !== 'string' || password.length === 0) return 'Please enter a password.';
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  if (/^\s|\s$/.test(password)) return 'The password cannot start or end with a space.';
  if (new Set(password).size < 5) return 'Choose a less repetitive password.';
  if (email && password.toLowerCase().includes(email.split('@')[0].toLowerCase()) && email.split('@')[0].length >= 4) {
    return 'The password cannot contain your email name.';
  }
  return null;
}
