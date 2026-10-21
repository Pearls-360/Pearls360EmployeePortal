import { config } from './config.js';
import { HttpError, clientIp } from './http.js';
import { readSessionCookie, validateSessionToken } from './auth/sessions.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defense for state-changing requests, layered on top of SameSite=Strict
 * cookies and the JSON-only body requirement: the browser-supplied Origin
 * (or Sec-Fetch-Site) must match this application.
 * @param {import('node:http').IncomingMessage} req
 */
export function assertSameOrigin(req) {
  if (SAFE_METHODS.has(req.method || 'GET')) return;
  const allowed = new Set([config.appOrigin, ...config.extraOrigins]);
  const origin = req.headers.origin;
  if (origin) {
    if (allowed.has(origin)) return;
    throw new HttpError(403, 'Request blocked.', { code: 'CSRF' });
  }
  const fetchSite = req.headers['sec-fetch-site'];
  if (fetchSite === 'same-origin') return;
  throw new HttpError(403, 'Request blocked.', { code: 'CSRF' });
}

/**
 * Fixed-window counter stored in Postgres so limits hold across serverless instances.
 * @param {import('./db.js').Queryable} db
 * @param {string} bucket
 * @param {{ limit: number, windowSeconds: number }} opts
 */
export async function rateLimit(db, bucket, { limit, windowSeconds }) {
  const { rows } = await db.query(
    `insert into app.rate_limits as r (bucket, hits, reset_at)
     values ($1, 1, now() + make_interval(secs => $2))
     on conflict (bucket) do update set
       hits = case when r.reset_at <= now() then 1 else r.hits + 1 end,
       reset_at = case when r.reset_at <= now() then now() + make_interval(secs => $2) else r.reset_at end
     returning hits, reset_at`,
    [bucket, windowSeconds]
  );
  const { hits, reset_at: resetAt } = rows[0];
  if (Math.random() < 0.02) {
    db.query("delete from app.rate_limits where reset_at < now() - interval '1 day'").catch(() => {});
  }
  if (hits > limit) {
    const retryAfter = Math.max(1, Math.ceil((new Date(resetAt).getTime() - Date.now()) / 1000));
    throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.', {
      code: 'RATE_LIMITED',
      headers: { 'Retry-After': String(retryAfter) }
    });
  }
}

/**
 * @param {import('./db.js').Queryable} db
 * @param {{ actorId?: string | null, action: string, targetType?: string, targetId?: string | null, metadata?: Record<string, unknown>, ip?: string }} entry
 */
export async function audit(db, entry) {
  await db.query(
    `insert into app.audit_logs (actor_user_id, action, target_type, target_id, metadata, ip_address)
     values ($1, $2, $3, $4, $5::jsonb, $6)`,
    [
      entry.actorId ?? null,
      entry.action,
      entry.targetType ?? null,
      entry.targetId ?? null,
      JSON.stringify(entry.metadata ?? {}),
      entry.ip ?? null
    ]
  );
}

/**
 * Loads and validates the session; enforces role and the forced password change.
 * Every protected handler goes through this — authorization never relies on the UI.
 * @param {import('./db.js').Queryable} db
 * @param {import('node:http').IncomingMessage} req
 * @param {{ roles?: Array<'admin' | 'employee'>, allowPasswordChangeRequired?: boolean }} [opts]
 * @returns {Promise<import('./auth/sessions.js').SessionContext>}
 */
export async function requireSession(db, req, { roles, allowPasswordChangeRequired = false } = {}) {
  const session = await validateSessionToken(db, readSessionCookie(req));
  if (!session) throw new HttpError(401, 'Your session has ended. Please sign in again.', { code: 'UNAUTHENTICATED' });
  if (session.user.mustChangePassword && !allowPasswordChangeRequired) {
    throw new HttpError(403, 'You must change your password before continuing.', { code: 'PASSWORD_CHANGE_REQUIRED' });
  }
  if (roles && !roles.includes(session.user.role)) {
    throw new HttpError(403, 'You do not have permission to do that.', { code: 'FORBIDDEN' });
  }
  return session;
}

export { clientIp };
