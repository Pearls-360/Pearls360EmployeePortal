import { config } from '../config.js';
import { generateToken, hashToken, looksLikeToken } from './tokens.js';

/** @typedef {'activation' | 'reset'} TokenPurpose */

/**
 * Issues a one-time activation/reset token. Any earlier unused tokens for the
 * user are revoked so only the newest link works.
 * @param {import('../db.js').Queryable} db
 * @param {{ userId: string, purpose: TokenPurpose, ttlMs: number, createdBy?: string | null }} opts
 * @returns {Promise<{ token: string, url: string, expiresAt: Date }>}
 */
export async function issueAccessToken(db, { userId, purpose, ttlMs, createdBy = null }) {
  await db.query(
    `update app.password_reset_tokens set revoked_at = now()
      where user_id = $1 and used_at is null and revoked_at is null`,
    [userId]
  );
  const token = generateToken();
  const { rows } = await db.query(
    `insert into app.password_reset_tokens (user_id, token_hash, purpose, expires_at, created_by)
     values ($1, $2, $3, now() + make_interval(secs => $4), $5)
     returning expires_at`,
    [userId, hashToken(token), purpose, ttlMs / 1000, createdBy]
  );
  return { token, url: accessTokenUrl(token), expiresAt: new Date(rows[0].expires_at) };
}

/** The token goes in the URL fragment so it never reaches server logs or Referer headers. */
export function accessTokenUrl(token) {
  return `${config.appOrigin}/auth/set-password#token=${token}`;
}

/**
 * Looks up a token without consuming it.
 * @param {import('../db.js').Queryable} db
 * @param {unknown} token
 */
export async function findValidAccessToken(db, token) {
  if (!looksLikeToken(token)) return null;
  const { rows } = await db.query(
    `select t.id, t.user_id, t.purpose, u.email, u.status
       from app.password_reset_tokens t
       join app.users u on u.id = t.user_id
      where t.token_hash = $1 and t.used_at is null and t.revoked_at is null and t.expires_at > now()`,
    [hashToken(/** @type {string} */ (token))]
  );
  const row = rows[0];
  if (!row || row.status === 'inactive') return null;
  return row;
}

/**
 * Atomically marks a token as used. Must run inside a transaction together
 * with the password update.
 * @param {import('../db.js').Queryable} tx
 * @param {unknown} token
 * @returns {Promise<{ user_id: string, purpose: TokenPurpose } | null>}
 */
export async function consumeAccessToken(tx, token) {
  if (!looksLikeToken(token)) return null;
  const { rows } = await tx.query(
    `update app.password_reset_tokens set used_at = now()
      where token_hash = $1 and used_at is null and revoked_at is null and expires_at > now()
      returning user_id, purpose`,
    [hashToken(/** @type {string} */ (token))]
  );
  return rows[0] ?? null;
}
