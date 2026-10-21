import { config } from '../config.js';
import { HttpError, clientIp, readJson, sendJson } from '../http.js';
import { issueAccessToken } from '../auth/access-tokens.js';
import { revokeUserSessions } from '../auth/sessions.js';
import { sendAccessLinkEmail } from '../email.js';
import { audit, requireSession } from '../security.js';
import { assertUuid, validateAdminInvite, validateEmployeeInput } from '../validation.js';

const EMPLOYEE_COLUMNS = `
  u.id, u.email, u.status as account_status, u.last_login_at, u.created_at,
  (u.password_hash is not null) as has_password,
  p.employee_code, p.first_name, p.last_name, p.phone, p.department, p.designation,
  to_char(p.joining_date, 'YYYY-MM-DD') as joining_date, p.employment_status`;

/** @param {any} row */
export function toEmployee(row) {
  return {
    id: row.id,
    email: row.email,
    accountStatus: row.account_status,
    hasPassword: row.has_password,
    employeeCode: row.employee_code,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    department: row.department,
    designation: row.designation,
    joiningDate: row.joining_date,
    employmentStatus: row.employment_status,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at
  };
}

/** @param {unknown} err */
function mapUniqueViolation(err) {
  const e = /** @type {{ code?: string, constraint?: string }} */ (err);
  if (e?.code !== '23505') return err;
  if (e.constraint === 'users_email_key') {
    return new HttpError(409, 'An account with this email already exists.', { code: 'CONFLICT', fields: { email: 'This email is already in use.' } });
  }
  if (e.constraint === 'employee_profiles_code_key') {
    return new HttpError(409, 'This employee ID is already in use.', { code: 'CONFLICT', fields: { employeeCode: 'This employee ID is already in use.' } });
  }
  return new HttpError(409, 'This record conflicts with an existing one.', { code: 'CONFLICT' });
}

/** @param {import('../db.js').Queryable} db @param {string} id */
async function loadEmployee(db, id) {
  const { rows } = await db.query(
    `select ${EMPLOYEE_COLUMNS}
       from app.users u join app.employee_profiles p on p.user_id = u.id
      where u.id = $1 and u.role = 'employee'`,
    [id]
  );
  if (!rows[0]) throw new HttpError(404, 'Employee not found.', { code: 'NOT_FOUND' });
  return toEmployee(rows[0]);
}

/**
 * Emails the link when email is configured; otherwise returns it so the admin
 * can share it through a trusted channel. The link is never stored in plaintext.
 */
async function deliverLink({ email, purpose, url, expiresAt }) {
  const emailed = await sendAccessLinkEmail({ to: email, purpose, url });
  return { emailed, purpose, expiresAt, url: emailed ? null : url };
}

/** @type {import('../router.js').Handler} */
export async function overview({ db, req, res }) {
  await requireSession(db, req, { roles: ['admin'] });
  const { rows: counts } = await db.query(
    `select count(*)::int as total,
            count(*) filter (where status = 'active')::int as active,
            count(*) filter (where status = 'inactive')::int as inactive,
            count(*) filter (where status = 'pending')::int as pending,
            count(*) filter (where created_at >= now() - interval '30 days')::int as recently_added
       from app.users where role = 'employee'`
  );
  const { rows: recentEmployees } = await db.query(
    `select ${EMPLOYEE_COLUMNS}
       from app.users u join app.employee_profiles p on p.user_id = u.id
      where u.role = 'employee'
      order by u.created_at desc
      limit 5`
  );
  const { rows: recentActivity } = await db.query(
    `select a.action, a.created_at, actor.email as actor_email,
            p.first_name || ' ' || p.last_name as target_name
       from app.audit_logs a
       left join app.users actor on actor.id = a.actor_user_id
       left join app.employee_profiles p on a.target_type = 'user' and p.user_id::text = a.target_id
      order by a.created_at desc, a.id desc
      limit 8`
  );
  const { rows: extras } = await db.query(
    `select (select count(*)::int from app.documents) as documents,
            (select count(*)::int from app.invoices) as invoices`
  );
  const c = counts[0];
  sendJson(res, 200, {
    total: c.total,
    documents: extras[0].documents,
    invoices: extras[0].invoices,
    active: c.active,
    inactive: c.inactive,
    pending: c.pending,
    recentlyAdded: c.recently_added,
    statusDistribution: [
      { status: 'active', label: 'Active', count: c.active },
      { status: 'pending', label: 'Awaiting activation', count: c.pending },
      { status: 'inactive', label: 'Inactive', count: c.inactive }
    ],
    recentEmployees: recentEmployees.map(toEmployee),
    recentActivity: recentActivity.map((r) => ({
      action: r.action,
      at: r.created_at,
      actor: r.actor_email,
      targetName: r.target_name
    }))
  });
}

/** @type {import('../router.js').Handler} */
export async function listEmployees({ db, req, res, url }) {
  await requireSession(db, req, { roles: ['admin'] });
  const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
  const status = url.searchParams.get('status');
  const statusFilter = ['active', 'inactive', 'pending'].includes(status || '') ? status : null;
  const like = q ? `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;

  const { rows } = await db.query(
    `select ${EMPLOYEE_COLUMNS}
       from app.users u join app.employee_profiles p on p.user_id = u.id
      where u.role = 'employee'
        and ($1::text is null or u.status = $1)
        and ($2::text is null
             or p.first_name ilike $2 or p.last_name ilike $2 or (p.first_name || ' ' || p.last_name) ilike $2
             or u.email ilike $2 or p.employee_code ilike $2 or p.department ilike $2 or p.designation ilike $2)
      order by lower(p.last_name), lower(p.first_name)
      limit 500`,
    [statusFilter, like]
  );
  sendJson(res, 200, { employees: rows.map(toEmployee) });
}

/** @type {import('../router.js').Handler} */
export async function getEmployee({ db, req, res, params }) {
  await requireSession(db, req, { roles: ['admin'] });
  const id = assertUuid(params.id);
  const employee = await loadEmployee(db, id);
  const { rows } = await db.query(
    `select a.action, a.created_at, a.metadata, actor.email as actor_email
       from app.audit_logs a left join app.users actor on actor.id = a.actor_user_id
      where a.target_type = 'user' and a.target_id = $1
      order by a.created_at desc limit 20`,
    [id]
  );
  sendJson(res, 200, { employee, activity: rows.map((r) => ({ action: r.action, at: r.created_at, actor: r.actor_email, metadata: r.metadata })) });
}

/** @type {import('../router.js').Handler} */
export async function createEmployee({ db, req, res }) {
  const session = await requireSession(db, req, { roles: ['admin'] });
  const data = validateEmployeeInput(await readJson(req));
  const ip = clientIp(req);

  let created;
  try {
    created = await db.tx(async (tx) => {
      const { rows } = await tx.query(
        `insert into app.users (email, role, status) values ($1, 'employee', 'pending') returning id`,
        [data.email]
      );
      const id = rows[0].id;
      await tx.query(
        `insert into app.employee_profiles
           (user_id, employee_code, first_name, last_name, phone, department, designation, joining_date, employment_status)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, data.employeeCode, data.firstName, data.lastName, data.phone ?? null, data.department, data.designation, data.joiningDate, data.employmentStatus]
      );
      const link = await issueAccessToken(tx, { userId: id, purpose: 'activation', ttlMs: config.tokens.activationTtlMs, createdBy: session.user.id });
      await audit(tx, {
        actorId: session.user.id,
        action: 'employee.created',
        targetType: 'user',
        targetId: id,
        metadata: { employeeCode: data.employeeCode, department: data.department },
        ip
      });
      return { id, link };
    });
  } catch (err) {
    throw mapUniqueViolation(err);
  }

  const employee = await loadEmployee(db, created.id);
  const delivery = await deliverLink({ email: employee.email, purpose: 'activation', url: created.link.url, expiresAt: created.link.expiresAt });
  sendJson(res, 201, { employee, accessLink: delivery });
}

/** @type {import('../router.js').Handler} */
export async function updateEmployee({ db, req, res, params }) {
  const session = await requireSession(db, req, { roles: ['admin'] });
  const id = assertUuid(params.id);
  const data = validateEmployeeInput(await readJson(req), { partial: true });
  const changed = Object.keys(data);
  if (!changed.length) throw new HttpError(422, 'Nothing to update.', { code: 'VALIDATION' });

  const profileColumns = {
    employeeCode: 'employee_code',
    firstName: 'first_name',
    lastName: 'last_name',
    phone: 'phone',
    department: 'department',
    designation: 'designation',
    joiningDate: 'joining_date',
    employmentStatus: 'employment_status'
  };

  try {
    await db.tx(async (tx) => {
      const { rows } = await tx.query("select id from app.users where id = $1 and role = 'employee' for update", [id]);
      if (!rows[0]) throw new HttpError(404, 'Employee not found.', { code: 'NOT_FOUND' });

      if (data.email !== undefined) {
        await tx.query('update app.users set email = $2 where id = $1', [id, data.email]);
      }
      const sets = [];
      const values = [id];
      for (const [key, column] of Object.entries(profileColumns)) {
        if (data[key] === undefined) continue;
        values.push(data[key]);
        sets.push(`${column} = $${values.length}`);
      }
      if (sets.length) {
        await tx.query(`update app.employee_profiles set ${sets.join(', ')} where user_id = $1`, values);
      }
      await audit(tx, { actorId: session.user.id, action: 'employee.updated', targetType: 'user', targetId: id, metadata: { fields: changed }, ip: clientIp(req) });
    });
  } catch (err) {
    throw mapUniqueViolation(err);
  }
  sendJson(res, 200, { employee: await loadEmployee(db, id) });
}

/** @type {import('../router.js').Handler} */
export async function setEmployeeStatus({ db, req, res, params }) {
  const session = await requireSession(db, req, { roles: ['admin'] });
  const id = assertUuid(params.id);
  const body = await readJson(req);
  if (body.status !== 'active' && body.status !== 'inactive') {
    throw new HttpError(422, 'Status must be active or inactive.', { code: 'VALIDATION' });
  }

  await db.tx(async (tx) => {
    const { rows } = await tx.query(
      "select id, status, password_hash is not null as has_password from app.users where id = $1 and role = 'employee' for update",
      [id]
    );
    const user = rows[0];
    if (!user) throw new HttpError(404, 'Employee not found.', { code: 'NOT_FOUND' });

    if (body.status === 'inactive') {
      await tx.query("update app.users set status = 'inactive' where id = $1", [id]);
      await revokeUserSessions(tx, id, 'account_deactivated');
      await tx.query('update app.password_reset_tokens set revoked_at = now() where user_id = $1 and used_at is null and revoked_at is null', [id]);
      await audit(tx, { actorId: session.user.id, action: 'employee.deactivated', targetType: 'user', targetId: id, ip: clientIp(req) });
    } else {
      const next = user.has_password ? 'active' : 'pending';
      await tx.query('update app.users set status = $2 where id = $1', [id, next]);
      await audit(tx, { actorId: session.user.id, action: 'employee.activated', targetType: 'user', targetId: id, metadata: { status: next }, ip: clientIp(req) });
    }
  });
  sendJson(res, 200, { employee: await loadEmployee(db, id) });
}

/** Removes an employee account. Invoices stay, so an employee with invoices cannot be removed. @type {import('../router.js').Handler} */
export async function deleteEmployee({ db, req, res, params }) {
  const session = await requireSession(db, req, { roles: ['admin'] });
  const id = assertUuid(params.id);
  await db.tx(async (tx) => {
    const { rows } = await tx.query("select id from app.users where id = $1 and role = 'employee' for update", [id]);
    if (!rows[0]) throw new HttpError(404, 'Employee not found.', { code: 'NOT_FOUND' });
    const { rows: invoices } = await tx.query('select count(*)::int as n from app.invoices where employee_id = $1', [id]);
    if (invoices[0].n > 0) {
      throw new HttpError(409, 'This employee has invoices, so the account cannot be deleted.', { code: 'CONFLICT' });
    }
    await audit(tx, { actorId: session.user.id, action: 'employee.deleted', targetType: 'user', targetId: id, ip: clientIp(req) });
    await tx.query('delete from app.users where id = $1', [id]);
  });
  sendJson(res, 200, { ok: true });
}

/** Issues an activation link (never set a password) or a reset link. @type {import('../router.js').Handler} */
export async function issueEmployeeAccessLink({ db, req, res, params }) {
  const session = await requireSession(db, req, { roles: ['admin'] });
  const id = assertUuid(params.id);
  const employee = await loadEmployee(db, id);
  if (employee.accountStatus === 'inactive') {
    throw new HttpError(409, 'Activate this account before sending a password link.', { code: 'ACCOUNT_INACTIVE' });
  }
  const purpose = employee.hasPassword ? 'reset' : 'activation';
  const link = await db.tx(async (tx) => {
    const issued = await issueAccessToken(tx, {
      userId: id,
      purpose,
      ttlMs: purpose === 'activation' ? config.tokens.activationTtlMs : config.tokens.adminResetTtlMs,
      createdBy: session.user.id
    });
    await audit(tx, {
      actorId: session.user.id,
      action: purpose === 'activation' ? 'employee.activation_link_issued' : 'employee.password_reset_initiated',
      targetType: 'user',
      targetId: id,
      ip: clientIp(req)
    });
    return issued;
  });
  sendJson(res, 200, { accessLink: await deliverLink({ email: employee.email, purpose, url: link.url, expiresAt: link.expiresAt }) });
}

const ADMIN_COLUMNS = `
  u.id, u.email, u.display_name, u.status as account_status,
  (u.password_hash is not null) as has_password, u.last_login_at, u.created_at`;

/** @param {any} row */
function toAdminAccount(row) {
  const displayName = row.display_name || row.email;
  return {
    id: row.id,
    email: row.email,
    displayName,
    accountStatus: row.account_status,
    hasPassword: row.has_password,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at
  };
}

/** @param {import('../db.js').Queryable} db @param {string} id */
async function loadAdminAccount(db, id) {
  const { rows } = await db.query(
    `select ${ADMIN_COLUMNS} from app.users u where u.id = $1 and u.role = 'admin'`,
    [id]
  );
  if (!rows[0]) throw new HttpError(404, 'Administrator not found.', { code: 'NOT_FOUND' });
  return toAdminAccount(rows[0]);
}

/** @type {import('../router.js').Handler} */
export async function listAdmins({ db, req, res }) {
  await requireSession(db, req, { roles: ['admin'] });
  const { rows } = await db.query(
    `select ${ADMIN_COLUMNS} from app.users u where u.role = 'admin' order by u.created_at, lower(u.email)`
  );
  sendJson(res, 200, { admins: rows.map(toAdminAccount) });
}

/** Creates another administrator with the same access. They set their own password. @type {import('../router.js').Handler} */
export async function createAdminAccount({ db, req, res }) {
  const session = await requireSession(db, req, { roles: ['admin'] });
  const data = validateAdminInvite(await readJson(req));
  const ip = clientIp(req);

  let created;
  try {
    created = await db.tx(async (tx) => {
      const { rows } = await tx.query(
        `insert into app.users (email, role, status, display_name) values ($1, 'admin', 'pending', $2) returning id`,
        [data.email, data.displayName]
      );
      const id = rows[0].id;
      const link = await issueAccessToken(tx, { userId: id, purpose: 'activation', ttlMs: config.tokens.activationTtlMs, createdBy: session.user.id });
      await audit(tx, {
        actorId: session.user.id,
        action: 'admin.created',
        targetType: 'user',
        targetId: id,
        metadata: { displayName: data.displayName },
        ip
      });
      return { id, link };
    });
  } catch (err) {
    throw mapUniqueViolation(err);
  }

  const account = await loadAdminAccount(db, created.id);
  const delivery = await deliverLink({ email: account.email, purpose: 'activation', url: created.link.url, expiresAt: created.link.expiresAt });
  sendJson(res, 201, { admin: account, accessLink: delivery });
}

/** @type {import('../router.js').Handler} */
export async function setAdminStatus({ db, req, res, params }) {
  const session = await requireSession(db, req, { roles: ['admin'] });
  const id = assertUuid(params.id, 'Administrator not found.');
  const body = await readJson(req);
  if (body.status !== 'active' && body.status !== 'inactive') {
    throw new HttpError(422, 'Status must be active or inactive.', { code: 'VALIDATION' });
  }
  if (id === session.user.id) {
    throw new HttpError(409, 'You can’t change your own account from here.', { code: 'CONFLICT' });
  }

  await db.tx(async (tx) => {
    const { rows } = await tx.query(
      "select id, status, password_hash is not null as has_password from app.users where id = $1 and role = 'admin' for update",
      [id]
    );
    const user = rows[0];
    if (!user) throw new HttpError(404, 'Administrator not found.', { code: 'NOT_FOUND' });

    if (body.status === 'inactive') {
      const { rows: others } = await tx.query(
        "select count(*)::int as n from app.users where role = 'admin' and status <> 'inactive' and id <> $1",
        [id]
      );
      if (others[0].n < 1) {
        throw new HttpError(409, 'At least one administrator must stay active.', { code: 'CONFLICT' });
      }
      await tx.query("update app.users set status = 'inactive' where id = $1", [id]);
      await revokeUserSessions(tx, id, 'account_deactivated');
      await tx.query('update app.password_reset_tokens set revoked_at = now() where user_id = $1 and used_at is null and revoked_at is null', [id]);
      await audit(tx, { actorId: session.user.id, action: 'admin.deactivated', targetType: 'user', targetId: id, ip: clientIp(req) });
    } else {
      const next = user.has_password ? 'active' : 'pending';
      await tx.query('update app.users set status = $2 where id = $1', [id, next]);
      await audit(tx, { actorId: session.user.id, action: 'admin.activated', targetType: 'user', targetId: id, metadata: { status: next }, ip: clientIp(req) });
    }
  });
  sendJson(res, 200, { admin: await loadAdminAccount(db, id) });
}

/** @type {import('../router.js').Handler} */
export async function issueAdminAccessLink({ db, req, res, params }) {
  const session = await requireSession(db, req, { roles: ['admin'] });
  const id = assertUuid(params.id, 'Administrator not found.');
  if (id === session.user.id) {
    throw new HttpError(409, 'Use Change Password for your own account.', { code: 'CONFLICT' });
  }
  const account = await loadAdminAccount(db, id);
  if (account.accountStatus === 'inactive') {
    throw new HttpError(409, 'Activate this account before sending a password link.', { code: 'ACCOUNT_INACTIVE' });
  }
  const purpose = account.hasPassword ? 'reset' : 'activation';
  const link = await db.tx(async (tx) => {
    const issued = await issueAccessToken(tx, {
      userId: id,
      purpose,
      ttlMs: purpose === 'activation' ? config.tokens.activationTtlMs : config.tokens.adminResetTtlMs,
      createdBy: session.user.id
    });
    await audit(tx, {
      actorId: session.user.id,
      action: purpose === 'activation' ? 'admin.activation_link_issued' : 'admin.password_reset_initiated',
      targetType: 'user',
      targetId: id,
      ip: clientIp(req)
    });
    return issued;
  });
  sendJson(res, 200, { accessLink: await deliverLink({ email: account.email, purpose, url: link.url, expiresAt: link.expiresAt }) });
}

/** @type {import('../router.js').Handler} */
export async function auditLogs({ db, req, res, url }) {
  await requireSession(db, req, { roles: ['admin'] });
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 200);
  const { rows } = await db.query(
    `select a.id, a.action, a.created_at, a.target_type, a.target_id, a.metadata,
            actor.email as actor_email,
            p.first_name || ' ' || p.last_name as target_name
       from app.audit_logs a
       left join app.users actor on actor.id = a.actor_user_id
       left join app.employee_profiles p on a.target_type = 'user' and p.user_id::text = a.target_id
      order by a.created_at desc, a.id desc
      limit $1`,
    [limit]
  );
  sendJson(res, 200, {
    entries: rows.map((r) => ({
      id: String(r.id),
      action: r.action,
      at: r.created_at,
      actor: r.actor_email,
      targetName: r.target_name,
      metadata: r.metadata
    }))
  });
}
