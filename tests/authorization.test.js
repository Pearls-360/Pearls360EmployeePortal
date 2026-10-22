import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Agent, call, createActiveEmployee, createTestDb, setupAdmin } from './helpers.js';

/** @type {Awaited<ReturnType<typeof createTestDb>>} */
let db;
/** @type {Agent} */
let admin;
/** @type {Awaited<ReturnType<typeof createActiveEmployee>>} */
let alice;
/** @type {Awaited<ReturnType<typeof createActiveEmployee>>} */
let bob;

before(async () => {
  db = await createTestDb();
  admin = await setupAdmin(db);
  alice = await createActiveEmployee(admin, { firstName: 'Alice', phone: '+1 555 111 1111' });
  bob = await createActiveEmployee(admin, { firstName: 'Bob', phone: '+1 555 222 2222' });
});
after(() => db.end());

/** @param {string} id @returns {Array<[string, string, any?]>} */
const ADMIN_ENDPOINTS = (id) => [
  ['GET', '/admin/overview'],
  ['GET', '/admin/employees'],
  ['POST', '/admin/employees', {}],
  ['GET', `/admin/employees/${id}`],
  ['PATCH', `/admin/employees/${id}`, { department: 'Hacked' }],
  ['POST', `/admin/employees/${id}/status`, { status: 'inactive' }],
  ['DELETE', `/admin/employees/${id}`],
  ['POST', `/admin/employees/${id}/access-link`, {}],
  ['GET', '/admin/admins'],
  ['POST', '/admin/admins', {}],
  ['POST', `/admin/admins/${id}/status`, { status: 'inactive' }],
  ['POST', `/admin/admins/${id}/access-link`, {}],
  ['GET', '/admin/audit-logs'],
  ['GET', '/admin/documents?kind=library'],
  ['POST', '/admin/documents', {}],
  ['GET', '/admin/invoices'],
  ['POST', '/admin/invoices', {}],
  ['GET', '/admin/access'],
  ['POST', '/admin/access', {}],
  ['GET', '/admin/deleted'],
  ['POST', `/admin/deleted/${id}/restore`, {}],
  ['GET', '/admin/quizzes'],
  ['POST', '/admin/quizzes', {}],
  ['GET', `/admin/quiz-assignments/${id}`],
  ['POST', `/admin/quiz-assignments/${id}/score`, { score: 1 }]
];

describe('unauthenticated access', () => {
  test('every protected endpoint returns 401', async () => {
    /** @type {Array<[string, string, any?]>} */
    const endpoints = [
      ...ADMIN_ENDPOINTS(alice.employee.id),
      ['GET', '/employee/profile'],
      ['PATCH', '/employee/profile', { phone: '' }],
      ['GET', '/employee/documents'],
      ['GET', '/employee/invoices'],
      ['GET', '/employee/quizzes'],
      ['GET', `/employee/quizzes/${alice.employee.id}`],
      ['POST', `/employee/quizzes/${alice.employee.id}/submit`, {}],
      ['GET', '/documents/00000000-0000-4000-8000-000000000001/file'],
      ['GET', '/auth/session'],
      ['PATCH', '/auth/timezone', { timezone: 'UTC' }]
    ];
    for (const [method, path, body] of endpoints) {
      const r = await call({ method, path, body });
      assert.equal(r.status, 401, `${method} ${path}`);
      assert.equal(r.body.error.code, 'UNAUTHENTICATED');
    }
  });
});

describe('employee → admin isolation', () => {
  test('an employee session is forbidden from every admin endpoint', async () => {
    for (const [method, path, body] of ADMIN_ENDPOINTS(bob.employee.id)) {
      const r = await alice.agent.request(method, path, body);
      assert.equal(r.status, 403, `${method} ${path}`);
      assert.equal(r.body.error.code, 'FORBIDDEN');
    }
  });

  test('the forbidden attempts changed nothing', async () => {
    const { rows } = await db.query('select u.status, p.department from app.users u join app.employee_profiles p on p.user_id = u.id where u.id = $1', [bob.employee.id]);
    assert.equal(rows[0].status, 'active');
    assert.equal(rows[0].department, 'Design');
    assert.equal((await bob.agent.get('/employee/profile')).status, 200, "Bob's session is still valid");
  });

  test('admin cannot use the employee self-service endpoints (no profile)', async () => {
    assert.equal((await admin.get('/employee/profile')).status, 403);
  });
});

describe('employee data isolation (IDOR)', () => {
  test('profile endpoint returns only the signed-in employee', async () => {
    const a = await alice.agent.get('/employee/profile');
    const b = await bob.agent.get('/employee/profile');
    assert.equal(a.body.profile.email, alice.input.email);
    assert.equal(b.body.profile.email, bob.input.email);
    assert.ok(!JSON.stringify(a.body).includes(bob.input.email));
  });

  test('query-string ids are ignored', async () => {
    const r = await alice.agent.get(`/employee/profile?id=${bob.employee.id}&userId=${bob.employee.id}`);
    assert.equal(r.body.profile.email, alice.input.email);
  });

  test('profile response does not leak internal ids or credentials', async () => {
    const r = await alice.agent.get('/employee/profile');
    const json = JSON.stringify(r.body);
    assert.ok(!json.includes(alice.employee.id));
    assert.ok(!/password|hash|token/i.test(json));
  });

  test('employees can update only their own phone', async () => {
    const r = await alice.agent.patch('/employee/profile', {
      phone: '+1 555 999 0000',
      userId: bob.employee.id,
      id: bob.employee.id,
      email: 'takeover@example.test',
      department: 'Executive',
      designation: 'CEO',
      employmentStatus: 'terminated',
      role: 'admin'
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.profile.phone, '+1 555 999 0000');
    assert.equal(r.body.profile.email, alice.input.email);
    assert.equal(r.body.profile.department, 'Design');
    assert.equal(r.body.profile.designation, 'Planner');
    assert.equal(r.body.profile.employmentStatus, 'active');

    const { rows } = await db.query('select u.role, p.phone from app.users u join app.employee_profiles p on p.user_id = u.id where u.id = $1', [bob.employee.id]);
    assert.equal(rows[0].phone, '+1 555 222 2222', "Bob's record is untouched");
    const role = await db.query('select role from app.users where email = $1', [alice.input.email]);
    assert.equal(role.rows[0].role, 'employee');
  });

  test('phone updates are validated', async () => {
    const r = await alice.agent.patch('/employee/profile', { phone: '<script>' });
    assert.equal(r.status, 422);
    assert.ok(r.body.error.fields.phone);
  });

  test('session reports the employee role and name for the UI guard', async () => {
    const r = await alice.agent.get('/auth/session');
    assert.equal(r.body.user.role, 'employee');
    assert.equal(r.body.user.firstName, 'Alice');
    assert.equal(r.body.home, '/employee');
  });
});

describe('admin endpoints reject non-employee targets', () => {
  test('admin cannot load or modify another admin through employee endpoints', async () => {
    const { rows } = await db.query("select id from app.users where role = 'admin' limit 1");
    const adminId = rows[0].id;
    assert.equal((await admin.get(`/admin/employees/${adminId}`)).status, 404);
    assert.equal((await admin.post(`/admin/employees/${adminId}/status`, { status: 'inactive' })).status, 404);
  });

  test('malformed ids return 404, not a database error', async () => {
    assert.equal((await admin.get("/admin/employees/1' or '1'='1")).status, 404);
    assert.equal((await admin.get('/admin/employees/not-a-uuid')).status, 404);
  });

  test('a fresh agent with no cookie cannot piggy-back on another session', async () => {
    assert.equal((await new Agent().get('/admin/overview')).status, 401);
  });
});
