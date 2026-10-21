import { clientIp, readJson, sendJson } from '../http.js';
import { avatarVersion, parseAvatarInput, setUserAvatar } from '../auth/avatar.js';
import { audit, requireSession } from '../security.js';
import { validateSelfProfileInput } from '../validation.js';

/**
 * Employee endpoints never accept a user id: the record is always the one
 * belonging to the authenticated session.
 * @param {import('../db.js').Queryable} db
 * @param {string} userId
 */
async function loadOwnProfile(db, userId) {
  const { rows } = await db.query(
    `select u.email, u.display_name, u.avatar_mime is not null as has_avatar, u.avatar_updated_at, u.last_login_at,
            p.employee_code, p.first_name, p.last_name, p.phone, p.department, p.designation,
            to_char(p.joining_date, 'YYYY-MM-DD') as joining_date, p.employment_status
       from app.users u join app.employee_profiles p on p.user_id = u.id
      where u.id = $1 and u.role = 'employee'`,
    [userId]
  );
  if (!rows[0]) {
    const { HttpError } = await import('../http.js');
    throw new HttpError(404, 'Profile not found.', { code: 'NOT_FOUND' });
  }
  const row = rows[0];
  return {
    email: row.email,
    displayName: row.display_name,
    employeeCode: row.employee_code,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    department: row.department,
    designation: row.designation,
    joiningDate: row.joining_date,
    employmentStatus: row.employment_status,
    hasAvatar: row.has_avatar,
    avatarUrl: row.has_avatar ? `/api/auth/avatar?v=${avatarVersion(row.avatar_updated_at)}` : null,
    lastLoginAt: row.last_login_at
  };
}

/** @type {import('../router.js').Handler} */
export async function getProfile({ db, req, res }) {
  const session = await requireSession(db, req, { roles: ['employee'] });
  sendJson(res, 200, { profile: await loadOwnProfile(db, session.user.id) });
}

/** @type {import('../router.js').Handler} */
export async function updateProfile({ db, req, res }) {
  const session = await requireSession(db, req, { roles: ['employee'] });
  const data = validateSelfProfileInput(await readJson(req));
  const fields = [];
  await db.tx(async (tx) => {
    const sets = [];
    const values = [session.user.id];
    if (data.firstName !== undefined) {
      values.push(data.firstName);
      sets.push(`first_name = $${values.length}`);
      fields.push('firstName');
    }
    if (data.lastName !== undefined) {
      values.push(data.lastName);
      sets.push(`last_name = $${values.length}`);
      fields.push('lastName');
    }
    if (data.phone !== undefined) {
      values.push(data.phone);
      sets.push(`phone = $${values.length}`);
      fields.push('phone');
    }
    if (sets.length) {
      await tx.query(`update app.employee_profiles set ${sets.join(', ')} where user_id = $1`, values);
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
  sendJson(res, 200, { profile: await loadOwnProfile(db, session.user.id) });
}
