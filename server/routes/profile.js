import { clientIp, readJson, sendJson } from '../http.js';
import { avatarVersion, loadUserAvatar, parseAvatarInput, setUserAvatar } from '../auth/avatar.js';
import { audit, requireSession } from '../security.js';
import { validateAdminSelfProfileInput } from '../validation.js';

/** @param {import('../db.js').Queryable} db @param {string} userId */
async function loadSelfProfile(db, userId) {
  const { rows } = await db.query(
    `select email, display_name, avatar_mime is not null as has_avatar, avatar_updated_at, last_login_at
       from app.users where id = $1 and role = 'admin'`,
    [userId]
  );
  const row = rows[0];
  return {
    role: 'admin',
    email: row.email,
    displayName: row.display_name,
    hasAvatar: row.has_avatar,
    avatarUrl: row.has_avatar ? `/api/auth/avatar?v=${avatarVersion(row.avatar_updated_at)}` : null,
    lastLoginAt: row.last_login_at
  };
}

/** Admin self-profile. Employees use `/employee/profile`. @type {import('../router.js').Handler} */
export async function getSelfProfile({ db, req, res }) {
  const session = await requireSession(db, req, { roles: ['admin'] });
  sendJson(res, 200, { profile: await loadSelfProfile(db, session.user.id) });
}

/** @type {import('../router.js').Handler} */
export async function updateSelfProfile({ db, req, res }) {
  const session = await requireSession(db, req, { roles: ['admin'] });
  const data = validateAdminSelfProfileInput(await readJson(req));
  const fields = [];
  await db.tx(async (tx) => {
    if (data.displayName !== undefined) {
      await tx.query('update app.users set display_name = $2 where id = $1', [session.user.id, data.displayName]);
      fields.push('displayName');
    }
    if (data.clearAvatar) {
      await setUserAvatar(tx, session.user.id, null);
      fields.push('avatar');
    } else if (data.avatar !== undefined) {
      await setUserAvatar(tx, session.user.id, parseAvatarInput(data.avatar));
      fields.push('avatar');
    }
    await audit(tx, {
      actorId: session.user.id,
      action: 'profile.updated',
      targetType: 'user',
      targetId: session.user.id,
      metadata: { fields },
      ip: clientIp(req)
    });
  });
  sendJson(res, 200, { profile: await loadSelfProfile(db, session.user.id) });
}

/** Serves the signed-in user's avatar image. @type {import('../router.js').Handler} */
export async function getOwnAvatar({ db, req, res }) {
  const session = await requireSession(db, req);
  const avatar = await loadUserAvatar(db, session.user.id);
  if (!avatar) {
    res.statusCode = 404;
    res.setHeader('Cache-Control', 'no-store');
    res.end();
    return;
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', avatar.mime);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('Content-Length', String(avatar.bytes.length));
  res.end(avatar.bytes);
}
