import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN_EMAIL, Agent, call, createActiveEmployee, createTestDb, employeeInput, nextIp, setupAdmin, tokenFromUrl } from './helpers.js';

/** @type {Awaited<ReturnType<typeof createTestDb>>} */
let db;
/** @type {Agent} */
let admin;

before(async () => {
  db = await createTestDb();
  admin = await setupAdmin(db);
});
after(() => db.end());

const setPassword = (token, password) => call({ method: 'POST', path: '/auth/set-password', body: { token, password }, ip: nextIp() });

describe('creating employees', () => {
  test('creates a pending account, profile, one-time activation link and audit entry', async () => {
    const input = employeeInput({ email: 'New.Hire@Example.test', employeeCode: 'p360-100' });
    const r = await admin.post('/admin/employees', input);
    assert.equal(r.status, 201);
    const { employee, accessLink } = r.body;
    assert.equal(employee.email, 'new.hire@example.test', 'email normalized');
    assert.equal(employee.employeeCode, 'P360-100', 'employee id normalized');
    assert.equal(employee.accountStatus, 'pending');
    assert.equal(employee.hasPassword, false);
    assert.equal(accessLink.emailed, false);
    assert.equal(accessLink.purpose, 'activation');
    assert.match(accessLink.url, /\/auth\/set-password#token=[A-Za-z0-9_-]{43}$/);

    const token = tokenFromUrl(accessLink.url);
    const stored = await db.query('select token_hash from app.password_reset_tokens where user_id = $1', [employee.id]);
    assert.equal(stored.rows.length, 1);
    assert.notEqual(stored.rows[0].token_hash, token, 'only the hash is stored');

    const logs = await db.query("select metadata from app.audit_logs where action = 'employee.created' and target_id = $1", [employee.id]);
    assert.equal(logs.rows.length, 1);
    assert.ok(!JSON.stringify(logs.rows[0].metadata).includes(token));
  });

  test('a pending employee cannot sign in before activation', async () => {
    const r = await new Agent().login('new.hire@example.test', 'anything-at-all-123');
    assert.equal(r.status, 401);
  });

  test('validates required fields', async () => {
    const r = await admin.post('/admin/employees', { email: 'bad', employeeCode: '!', joiningDate: '2026-02-31', employmentStatus: 'boss' });
    assert.equal(r.status, 422);
    for (const field of ['firstName', 'lastName', 'email', 'employeeCode', 'department', 'designation', 'joiningDate', 'employmentStatus']) {
      assert.ok(r.body.error.fields[field], `${field} error`);
    }
  });

  test('duplicate email or employee id returns 409 and leaves no partial records', async () => {
    const before = await db.query('select (select count(*) from app.users)::int as u, (select count(*) from app.employee_profiles)::int as p');

    const dupEmail = await admin.post('/admin/employees', employeeInput({ email: 'NEW.HIRE@example.test' }));
    assert.equal(dupEmail.status, 409);
    assert.ok(dupEmail.body.error.fields.email);

    const dupCode = await admin.post('/admin/employees', employeeInput({ employeeCode: 'P360-100' }));
    assert.equal(dupCode.status, 409);
    assert.ok(dupCode.body.error.fields.employeeCode);

    const afterCounts = await db.query('select (select count(*) from app.users)::int as u, (select count(*) from app.employee_profiles)::int as p');
    assert.deepEqual(afterCounts.rows[0], before.rows[0]);
  });
});

describe('activation link', () => {
  test('full flow: inspect, set password, single use, then sign in', async () => {
    const input = employeeInput();
    const created = await admin.post('/admin/employees', input);
    const token = tokenFromUrl(created.body.accessLink.url);

    const info = await call({ method: 'POST', path: '/auth/token-info', body: { token }, ip: nextIp() });
    assert.equal(info.status, 200);
    assert.deepEqual(info.body, { purpose: 'activation', email: input.email });

    const weak = await setPassword(token, 'short');
    assert.equal(weak.status, 422);

    const ok = await setPassword(token, 'Activated-Pass-2026!');
    assert.equal(ok.status, 200);

    const reuse = await setPassword(token, 'Another-Pass-2026!!');
    assert.equal(reuse.status, 410, 'tokens are single-use');

    const login = await new Agent().login(input.email, 'Activated-Pass-2026!');
    assert.equal(login.status, 200);
    assert.equal(login.body.redirectTo, '/employee');

    const detail = await admin.get(`/admin/employees/${created.body.employee.id}`);
    assert.equal(detail.body.employee.accountStatus, 'active');
    assert.ok(detail.body.activity.some((a) => a.action === 'auth.account_activated'));
  });

  test('rejects malformed, unknown and expired tokens', async () => {
    assert.equal((await setPassword('nope', 'Whatever-Pass-2026!')).status, 410);
    assert.equal((await setPassword('A'.repeat(43), 'Whatever-Pass-2026!')).status, 410);

    const created = await admin.post('/admin/employees', employeeInput());
    const token = tokenFromUrl(created.body.accessLink.url);
    await db.query("update app.password_reset_tokens set expires_at = now() - interval '1 minute' where user_id = $1", [created.body.employee.id]);
    assert.equal((await setPassword(token, 'Whatever-Pass-2026!')).status, 410);
  });

  test('issuing a new link invalidates the previous one', async () => {
    const created = await admin.post('/admin/employees', employeeInput());
    const first = tokenFromUrl(created.body.accessLink.url);
    const again = await admin.post(`/admin/employees/${created.body.employee.id}/access-link`);
    assert.equal(again.status, 200);
    assert.equal(again.body.accessLink.purpose, 'activation');
    assert.equal((await setPassword(first, 'Whatever-Pass-2026!')).status, 410);
    assert.equal((await setPassword(tokenFromUrl(again.body.accessLink.url), 'Whatever-Pass-2026!')).status, 200);
  });
});

describe('deactivation and reactivation', () => {
  test('deactivating signs the employee out immediately and blocks sign-in', async () => {
    const { employee, input, password, agent } = await createActiveEmployee(admin);
    assert.equal((await agent.get('/employee/profile')).status, 200);

    const r = await admin.post(`/admin/employees/${employee.id}/status`, { status: 'inactive' });
    assert.equal(r.status, 200);
    assert.equal(r.body.employee.accountStatus, 'inactive');

    assert.equal((await agent.get('/employee/profile')).status, 401, 'existing session revoked');
    const login = await new Agent().login(input.email, password);
    assert.equal(login.status, 403);
    assert.equal(login.body.error.code, 'ACCOUNT_INACTIVE');

    const link = await admin.post(`/admin/employees/${employee.id}/access-link`);
    assert.equal(link.status, 409, 'no reset links for inactive accounts');

    const reactivated = await admin.post(`/admin/employees/${employee.id}/status`, { status: 'active' });
    assert.equal(reactivated.body.employee.accountStatus, 'active');
    assert.equal((await new Agent().login(input.email, password)).status, 200);
  });

  test('deactivation revokes outstanding activation links', async () => {
    const created = await admin.post('/admin/employees', employeeInput());
    const token = tokenFromUrl(created.body.accessLink.url);
    await admin.post(`/admin/employees/${created.body.employee.id}/status`, { status: 'inactive' });
    assert.equal((await setPassword(token, 'Whatever-Pass-2026!')).status, 410);

    const back = await admin.post(`/admin/employees/${created.body.employee.id}/status`, { status: 'active' });
    assert.equal(back.body.employee.accountStatus, 'pending', 'never activated, so it returns to pending');
  });

  test('rejects unknown status values', async () => {
    const { employee } = await createActiveEmployee(admin);
    assert.equal((await admin.post(`/admin/employees/${employee.id}/status`, { status: 'deleted' })).status, 422);
  });
});

describe('admin-initiated password reset', () => {
  test('issues a reset link that replaces the password and ends existing sessions', async () => {
    const { employee, input, password, agent } = await createActiveEmployee(admin);
    const r = await admin.post(`/admin/employees/${employee.id}/access-link`);
    assert.equal(r.status, 200);
    assert.equal(r.body.accessLink.purpose, 'reset');

    const token = tokenFromUrl(r.body.accessLink.url);
    assert.equal((await setPassword(token, 'Reset-By-Admin-2026!')).status, 200);
    assert.equal((await agent.get('/employee/profile')).status, 401);
    assert.equal((await new Agent().login(input.email, password)).status, 401);
    assert.equal((await new Agent().login(input.email, 'Reset-By-Admin-2026!')).status, 200);
  });
});

describe('directory, details, edits and audit', () => {
  test('edits are partial, validated and audited', async () => {
    const { employee, agent } = await createActiveEmployee(admin);
    const r = await admin.patch(`/admin/employees/${employee.id}`, { department: 'Operations', employmentStatus: 'probation' });
    assert.equal(r.status, 200);
    assert.equal(r.body.employee.department, 'Operations');
    assert.equal(r.body.employee.employmentStatus, 'probation');
    assert.equal(r.body.employee.firstName, employee.firstName);

    assert.equal((await admin.patch(`/admin/employees/${employee.id}`, {})).status, 422);
    assert.equal((await admin.patch(`/admin/employees/${employee.id}`, { phone: 'abc' })).status, 422);

    const own = await agent.get('/employee/profile');
    assert.equal(own.body.profile.department, 'Operations', 'employee sees the update');

    const detail = await admin.get(`/admin/employees/${employee.id}`);
    const update = detail.body.activity.find((a) => a.action === 'employee.updated');
    assert.deepEqual(update.metadata.fields.sort(), ['department', 'employmentStatus']);
  });

  test('search and status filter', async () => {
    await createActiveEmployee(admin, { firstName: 'Zelda', department: 'Landscape' });
    const byName = await admin.get('/admin/employees?q=zelda');
    assert.equal(byName.body.employees.length, 1);
    assert.equal(byName.body.employees[0].firstName, 'Zelda');

    const byDept = await admin.get('/admin/employees?q=landsc');
    assert.equal(byDept.body.employees.length, 1);

    const wildcard = await admin.get('/admin/employees?q=%25');
    assert.equal(wildcard.body.employees.length, 0, 'LIKE wildcards are escaped');

    const inactive = await admin.get('/admin/employees?status=inactive');
    assert.ok(inactive.body.employees.every((e) => e.accountStatus === 'inactive'));
  });

  test('overview counts match the directory and includes dashboard sections', async () => {
    const overview = await admin.get('/admin/overview');
    const all = await admin.get('/admin/employees');
    const count = (s) => all.body.employees.filter((e) => e.accountStatus === s).length;
    assert.equal(overview.body.total, all.body.employees.length);
    assert.equal(overview.body.active, count('active'));
    assert.equal(overview.body.inactive, count('inactive'));
    assert.equal(overview.body.pending, count('pending'));
    assert.equal(typeof overview.body.recentlyAdded, 'number');
    assert.ok(Array.isArray(overview.body.statusDistribution));
    assert.ok(Array.isArray(overview.body.recentEmployees));
    assert.ok(Array.isArray(overview.body.recentActivity));
    assert.ok(overview.body.recentEmployees.length <= 5);
  });

  test('directory responses never include credentials', async () => {
    const all = await admin.get('/admin/employees');
    assert.ok(!/password_hash|\$argon2|token_hash/.test(JSON.stringify(all.body)));
  });

  test('audit log lists recent actions with actor and target', async () => {
    const r = await admin.get('/admin/audit-logs?limit=200');
    assert.equal(r.status, 200);
    const actions = new Set(r.body.entries.map((e) => e.action));
    for (const a of ['admin.bootstrap', 'auth.login', 'employee.created', 'employee.deactivated', 'employee.activated', 'employee.password_reset_initiated', 'auth.password_reset_completed']) {
      assert.ok(actions.has(a), `audit has ${a}`);
    }
    const created = r.body.entries.find((e) => e.action === 'employee.created');
    assert.ok(created.actor);
    assert.ok(created.targetName);
  });

  test('an admin can invite another admin with the same access', async () => {
    const created = await admin.post('/admin/admins', {
      firstName: 'Second',
      lastName: 'Admin',
      email: 'Second.Admin@Example.test'
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.admin.email, 'second.admin@example.test');
    assert.equal(created.body.admin.displayName, 'Second Admin');
    assert.equal(created.body.admin.accountStatus, 'pending');
    assert.equal(created.body.accessLink.purpose, 'activation');
    assert.match(created.body.accessLink.url, /\/auth\/set-password#token=/);

    const row = await db.query("select role, status, display_name from app.users where id = $1", [created.body.admin.id]);
    assert.equal(row.rows[0].role, 'admin');
    assert.equal(row.rows[0].status, 'pending');

    const listed = await admin.get('/admin/admins');
    assert.equal(listed.status, 200);
    assert.ok(listed.body.admins.some((a) => a.id === created.body.admin.id));
    assert.ok(!/password_hash|\$argon2|token_hash/.test(JSON.stringify(listed.body)));

    const token = tokenFromUrl(created.body.accessLink.url);
    assert.equal((await setPassword(token, 'Second-Admin-2026!')).status, 200);
    const next = new Agent();
    const login = await next.login('second.admin@example.test', 'Second-Admin-2026!');
    assert.equal(login.status, 200);
    assert.equal(login.body.redirectTo, '/admin');
    assert.equal((await next.get('/admin/overview')).status, 200);
    assert.equal((await next.get('/admin/employees')).status, 200);

    const self = await admin.post(`/admin/admins/${(await db.query('select id from app.users where email = $1', [ADMIN_EMAIL])).rows[0].id}/status`, { status: 'inactive' });
    assert.equal(self.status, 409);

    const off = await admin.post(`/admin/admins/${created.body.admin.id}/status`, { status: 'inactive' });
    assert.equal(off.status, 200);
    assert.equal(off.body.admin.accountStatus, 'inactive');
    assert.equal((await next.get('/admin/overview')).status, 401);
  });

  test('admin invite validates name and email and rejects duplicates', async () => {
    const bad = await admin.post('/admin/admins', { email: 'not-an-email' });
    assert.equal(bad.status, 422);
    assert.ok(bad.body.error.fields.firstName);
    assert.ok(bad.body.error.fields.lastName);
    assert.ok(bad.body.error.fields.email);

    const dup = await admin.post('/admin/admins', { firstName: 'Second', lastName: 'Admin', email: 'second.admin@example.test' });
    assert.equal(dup.status, 409);
  });

  test('audit metadata never stores secrets', async () => {
    const { rows } = await db.query('select metadata::text as m from app.audit_logs');
    for (const { m } of rows) assert.ok(!/password|token|hash|argon/i.test(m), m);
  });
});
