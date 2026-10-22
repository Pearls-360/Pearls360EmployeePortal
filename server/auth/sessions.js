import { config } from '../config.js';
import { parseCookies, setCookie } from '../http.js';
import { generateToken, hashToken, looksLikeToken } from './tokens.js';

/**
 * @typedef {{ id: string, email: string, role: 'admin' | 'employee', status: string, mustChangePassword: boolean }} SessionUser
 * @typedef {{ id: string, user: SessionUser }} SessionContext
 */

/**
 * @param {import('../db.js').Queryable} db
 * @param {string} userId
 * @param {{ ip?: string, userAgent?: string }} meta
 * @returns {Promise<string>} raw token for the cookie
 */
export async function createSession(db, userId, meta = {}) {
  const token = generateToken();
  await db.query(
    `insert into app.sessions (token_hash, user_id, expires_at, ip_address, user_agent)
     values ($1, $2, now() + make_interval(secs => $3), $4, $5)`,
    [hashToken(token), userId, config.session.ttlMs / 1000, meta.ip ?? null, meta.userAgent ?? null]
  );
  return token;
}

/**
 * Validates a session token against the database. Sessions slide forward while
 * in use, up to an absolute maximum lifetime. Inactive users are rejected.
 * @param {import('../db.js').Queryable} db
 * @param {string | undefined} token
 * @returns {Promise<SessionContext | null>}
 */
export async function validateSessionToken(db, token) {
  if (!token || !looksLikeToken(token)) return null;
  const { rows } = await db.query(
    `select s.id, s.expires_at, s.created_at, s.last_seen_at,
            u.id as user_id, u.email, u.role, u.status, u.must_change_password, u.deleted_at
       from app.sessions s
       join app.users u on u.id = s.user_id
      where s.token_hash = $1
        and s.revoked_at is null
        and s.expires_at > now()
        and s.created_at > now() - make_interval(secs => $2)`,
    [hashToken(token), config.session.absoluteMaxMs / 1000]
  );
  const row = rows[0];
  if (!row) return null;
  if (row.deleted_at || row.status !== 'active') {
    await revokeSession(db, row.id, row.deleted_at ? 'account_deleted' : 'account_inactive');
    return null;
  }

  const remaining = new Date(row.expires_at).getTime() - Date.now();
  const sinceSeen = Date.now() - new Date(row.last_seen_at).getTime();
  if (remaining < config.session.ttlMs / 2 || sinceSeen > 5 * 60 * 1000) {
    await db.query(
      `update app.sessions
          set last_seen_at = now(),
              expires_at = least(now() + make_interval(secs => $2), created_at + make_interval(secs => $3))
        where id = $1`,
      [row.id, config.session.ttlMs / 1000, config.session.absoluteMaxMs / 1000]
    );
  }

  return {
    id: row.id,
    user: {
      id: row.user_id,
      email: row.email,
      role: row.role,
      status: row.status,
      mustChangePassword: row.must_change_password
    }
  };
}

/** @param {import('../db.js').Queryable} db @param {string} sessionId @param {string} reason */
export async function revokeSession(db, sessionId, reason) {
  await db.query(
    'update app.sessions set revoked_at = now(), revoked_reason = $2 where id = $1 and revoked_at is null',
    [sessionId, reason]
  );
}

/**
 * @param {import('../db.js').Queryable} db
 * @param {string} userId
 * @param {string} reason
 * @param {string} [exceptSessionId]
 */
export async function revokeUserSessions(db, userId, reason, exceptSessionId) {
  await db.query(
    `update app.sessions set revoked_at = now(), revoked_reason = $2
      where user_id = $1 and revoked_at is null and ($3::uuid is null or id <> $3::uuid)`,
    [userId, reason, exceptSessionId ?? null]
  );
}

/** @param {import('node:http').IncomingMessage} req */
export function readSessionCookie(req) {
  return parseCookies(req)[config.session.cookieName];
}

/** @param {import('node:http').ServerResponse} res @param {string} token */
export function setSessionCookie(res, token) {
  setCookie(res, config.session.cookieName, token, {
    maxAgeSeconds: config.session.absoluteMaxMs / 1000,
    secure: config.isProduction
  });
}

/** @param {import('node:http').ServerResponse} res */
export function clearSessionCookie(res) {
  setCookie(res, config.session.cookieName, '', { maxAgeSeconds: 0, secure: config.isProduction });
}
