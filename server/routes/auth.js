import { config, emailConfigured } from '../config.js';
import { HttpError, clientIp, readJson, redirect, sendJson, userAgent } from '../http.js';
import { hashPassword, needsRehash, passwordProblem, verifyPassword } from '../auth/passwords.js';
import {
  clearSessionCookie,
  createSession,
  readSessionCookie,
  revokeSession,
  revokeUserSessions,
  setSessionCookie,
  validateSessionToken
} from '../auth/sessions.js';
import { consumeAccessToken, findValidAccessToken, issueAccessToken } from '../auth/access-tokens.js';
import { sendAccessLinkEmail } from '../email.js';
import { audit, rateLimit, requireSession } from '../security.js';
import { isValidEmail, normalizeEmail } from '../validation.js';

const INVALID_LOGIN = 'The email or password you entered is incorrect.';

/** @param {{ role: string, mustChangePassword: boolean }} user */
export function homeFor(user) {
  if (user.mustChangePassword) return '/change-password';
  return user.role === 'admin' ? '/admin' : '/employee';
}

/** @type {import('../router.js').Handler} */
export async function login({ db, req, res }) {
  const body = await readJson(req);
  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  const ip = clientIp(req);

  await rateLimit(db, `login:ip:${ip}`, { limit: 30, windowSeconds: 15 * 60 });
  if (!isValidEmail(email) || !password) {
    throw new HttpError(422, 'Enter your email address and password.', { code: 'VALIDATION' });
  }
  await rateLimit(db, `login:email:${email}`, { limit: 8, windowSeconds: 15 * 60 });

  const { rows } = await db.query(
    'select id, email, role, status, password_hash, must_change_password from app.users where email = $1',
    [email]
  );
  const user = rows[0];
  const valid = await verifyPassword(user?.password_hash, password.slice(0, 256));

  if (!user || !valid) {
    await audit(db, { action: 'auth.login_failed', targetType: user ? 'user' : undefined, targetId: user?.id, ip });
    throw new HttpError(401, INVALID_LOGIN, { code: 'INVALID_CREDENTIALS' });
  }
  if (user.status !== 'active') {
    await audit(db, { actorId: user.id, action: 'auth.login_blocked', targetType: 'user', targetId: user.id, metadata: { status: user.status }, ip });
    throw new HttpError(403, 'This account is not active. Please contact your administrator.', { code: 'ACCOUNT_INACTIVE' });
  }

  const token = await db.tx(async (tx) => {
    if (needsRehash(user.password_hash)) {
      await tx.query('update app.users set password_hash = $2 where id = $1', [user.id, await hashPassword(password)]);
    }
    await tx.query('update app.users set last_login_at = now() where id = $1', [user.id]);
    await audit(tx, { actorId: user.id, action: 'auth.login', targetType: 'user', targetId: user.id, ip });
    return createSession(tx, user.id, { ip, userAgent: userAgent(req) });
  });

  setSessionCookie(res, token);
  const sessionUser = { role: user.role, mustChangePassword: user.must_change_password };
  sendJson(res, 200, {
    user: { email: user.email, role: user.role, mustChangePassword: user.must_change_password },
    redirectTo: homeFor(sessionUser)
  });
}

/** @type {import('../router.js').Handler} */
export async function logout({ db, req, res }) {
  const session = await validateSessionToken(db, readSessionCookie(req)).catch(() => null);
  if (session) {
    await revokeSession(db, session.id, 'logout');
    await audit(db, { actorId: session.user.id, action: 'auth.logout', targetType: 'user', targetId: session.user.id, ip: clientIp(req) });
  }
  clearSessionCookie(res);
  sendJson(res, 200, { ok: true });
}

/** @type {import('../router.js').Handler} */
export async function currentSession({ db, req, res }) {
  const session = await requireSession(db, req, { allowPasswordChangeRequired: true });
  const { user } = session;
  const { rows } = await db.query(
    `select display_name, avatar_mime is not null as has_avatar, avatar_updated_at,
            (select first_name from app.employee_profiles where user_id = $1) as first_name
       from app.users where id = $1`,
    [user.id]
  );
  const meta = rows[0] || {};
  const firstName = user.role === 'employee' ? meta.first_name : null;
  const displayName = meta.display_name || firstName || null;
  sendJson(res, 200, {
    user: {
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      firstName,
      displayName,
      hasAvatar: Boolean(meta.has_avatar),
      avatarUrl: meta.has_avatar ? `/api/auth/avatar?v=${new Date(meta.avatar_updated_at).getTime()}` : null
    },
    home: homeFor(user)
  });
}

/** Server-side entry redirect for `/`. @type {import('../router.js').Handler} */
export async function entry({ db, req, res }) {
  const session = await validateSessionToken(db, readSessionCookie(req)).catch(() => null);
  redirect(res, session ? homeFor(session.user) : '/login');
}

/** @type {import('../router.js').Handler} */
export async function changePassword({ db, req, res }) {
  const session = await requireSession(db, req, { allowPasswordChangeRequired: true });
  const body = await readJson(req);
  const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const next = body.newPassword;

  await rateLimit(db, `change-password:${session.user.id}`, { limit: 10, windowSeconds: 15 * 60 });

  const problem = passwordProblem(next, { email: session.user.email });
  if (problem) throw new HttpError(422, problem, { code: 'VALIDATION', fields: { newPassword: problem } });

  const { rows } = await db.query('select password_hash from app.users where id = $1', [session.user.id]);
  if (!(await verifyPassword(rows[0]?.password_hash, current))) {
    throw new HttpError(422, 'Your current password is incorrect.', { code: 'VALIDATION', fields: { currentPassword: 'Your current password is incorrect.' } });
  }
  if (current === next) {
    const msg = 'Choose a password different from your current one.';
    throw new HttpError(422, msg, { code: 'VALIDATION', fields: { newPassword: msg } });
  }

  const hash = await hashPassword(/** @type {string} */ (next));
  await db.tx(async (tx) => {
    await tx.query(
      `update app.users set password_hash = $2, must_change_password = false, password_changed_at = now() where id = $1`,
      [session.user.id, hash]
    );
    await revokeUserSessions(tx, session.user.id, 'password_changed', session.id);
    await audit(tx, { actorId: session.user.id, action: 'auth.password_changed', targetType: 'user', targetId: session.user.id, ip: clientIp(req) });
  });

  sendJson(res, 200, { ok: true, redirectTo: homeFor({ role: session.user.role, mustChangePassword: false }) });
}

const FORGOT_RESPONSE = {
  ok: true,
  message: 'If an active account exists for that email, a password reset link has been sent. If you do not receive it, please contact your administrator.'
};

/** @type {import('../router.js').Handler} */
export async function forgotPassword({ db, req, res }) {
  const body = await readJson(req);
  const email = normalizeEmail(body.email);
  const ip = clientIp(req);
  await rateLimit(db, `forgot:ip:${ip}`, { limit: 10, windowSeconds: 60 * 60 });
  if (!isValidEmail(email)) throw new HttpError(422, 'Enter a valid email address.', { code: 'VALIDATION', fields: { email: 'Enter a valid email address.' } });
  await rateLimit(db, `forgot:email:${email}`, { limit: 3, windowSeconds: 60 * 60 });

  const { rows } = await db.query("select id, email from app.users where email = $1 and status = 'active'", [email]);
  const user = rows[0];
  if (user && emailConfigured()) {
    const { url } = await issueAccessToken(db, { userId: user.id, purpose: 'reset', ttlMs: config.tokens.selfResetTtlMs });
    await audit(db, { actorId: user.id, action: 'auth.password_reset_requested', targetType: 'user', targetId: user.id, ip });
    await sendAccessLinkEmail({ to: user.email, purpose: 'reset', url });
  }
  sendJson(res, 200, FORGOT_RESPONSE);
}

/** @type {import('../router.js').Handler} */
export async function accessTokenInfo({ db, req, res }) {
  const body = await readJson(req);
  await rateLimit(db, `token:ip:${clientIp(req)}`, { limit: 30, windowSeconds: 15 * 60 });
  const row = await findValidAccessToken(db, body.token);
  if (!row) throw new HttpError(410, 'This link is invalid or has expired. Please ask your administrator for a new one.', { code: 'TOKEN_INVALID' });
  sendJson(res, 200, { purpose: row.purpose, email: row.email });
}

/** @type {import('../router.js').Handler} */
export async function setPasswordWithToken({ db, req, res }) {
  const body = await readJson(req);
  const ip = clientIp(req);
  await rateLimit(db, `token:ip:${ip}`, { limit: 30, windowSeconds: 15 * 60 });

  const invalid = new HttpError(410, 'This link is invalid or has expired. Please ask your administrator for a new one.', { code: 'TOKEN_INVALID' });
  const preview = await findValidAccessToken(db, body.token);
  if (!preview) throw invalid;

  const problem = passwordProblem(body.password, { email: preview.email });
  if (problem) throw new HttpError(422, problem, { code: 'VALIDATION', fields: { password: problem } });
  const hash = await hashPassword(/** @type {string} */ (body.password));

  await db.tx(async (tx) => {
    const consumed = await consumeAccessToken(tx, body.token);
    if (!consumed) throw invalid;
    const { rows } = await tx.query('select id, status from app.users where id = $1 for update', [consumed.user_id]);
    const user = rows[0];
    if (!user || user.status === 'inactive') throw invalid;

    await tx.query(
      `update app.users
          set password_hash = $2,
              status = 'active',
              must_change_password = false,
              password_changed_at = now()
        where id = $1`,
      [user.id, hash]
    );
    await revokeUserSessions(tx, user.id, consumed.purpose === 'activation' ? 'account_activated' : 'password_reset');
    await audit(tx, {
      actorId: user.id,
      action: consumed.purpose === 'activation' ? 'auth.account_activated' : 'auth.password_reset_completed',
      targetType: 'user',
      targetId: user.id,
      ip
    });
  });

  sendJson(res, 200, { ok: true, redirectTo: '/login' });
}
