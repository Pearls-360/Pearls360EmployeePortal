import { createHash, randomBytes } from 'node:crypto';

/** 256-bit random token, URL-safe. */
export function generateToken() {
  return randomBytes(32).toString('base64url');
}

/** Tokens are stored only as SHA-256 hashes; a database leak doesn't yield usable tokens. */
export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/** Cheap shape check before touching the database. */
export function looksLikeToken(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}
