import { HttpError, clientIp, readJson, sendJson } from '../http.js';
import { audit, requireSession } from '../security.js';
import { assertUuid } from '../validation.js';

/** @type {import('../router.js').Handler} */
export async function listAccess({ db, req, res }) {
  await requireSession(db, req, { roles: ['admin'] });
  const { rows } = await db.query(
    `select u.id, u.email, p.first_name, p.last_name,
            (a.user_id is not null) as leadership
       from app.users u
       join app.employee_profiles p on p.user_id = u.id
       left join app.leadership_access a on a.user_id = u.id
      where u.role = 'employee'
      order by lower(p.last_name), lower(p.first_name)`
  );
  sendJson(res, 200, {
    people: rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: `${row.first_name} ${row.last_name}`,
      leadership: row.leadership
    }))
  });
}

/** @type {import('../router.js').Handler} */
export async function setAccess({ db, req, res }) {
  const session = await requireSession(db, req, { roles: ['admin'] });
  const body = await readJson(req);
  const userId = assertUuid(String(body.userId || ''), 'Employee not found.');
  if (typeof body.leadership !== 'boolean') {
    throw new HttpError(422, 'Choose whether this person can open leadership documents.', { code: 'VALIDATION' });
  }
  const { rows } = await db.query("select id from app.users where id = $1 and role = 'employee'", [userId]);
  if (!rows[0]) throw new HttpError(404, 'Employee not found.', { code: 'NOT_FOUND' });

  if (body.leadership) {
    await db.query(
      `insert into app.leadership_access (user_id, granted_by) values ($1, $2)
       on conflict (user_id) do nothing`,
      [userId, session.user.id]
    );
  } else {
    await db.query('delete from app.leadership_access where user_id = $1', [userId]);
  }
  await audit(db, {
    actorId: session.user.id,
    action: body.leadership ? 'access.granted' : 'access.revoked',
    targetType: 'user',
    targetId: userId,
    metadata: { scope: 'leadership' },
    ip: clientIp(req)
  });
  sendJson(res, 200, { ok: true, leadership: body.leadership });
}
