import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { hashToken } from '../server/auth/tokens.js';
import { issueAccessToken } from '../server/auth/access-tokens.js';
import { config } from '../server/config.js';
import { hashPassword } from '../server/auth/passwords.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_TEMP_PASSWORD, Agent, COOKIE, call, createActiveEmployee, createTestDb, nextIp } from './helpers.js';
import { createAdmin } from '../server/bootstrap.js';

/** @type {Awaited<ReturnType<typeof createTestDb>>} */
let db;
/** @type {Agent} */
let admin;

before(async () => {
  db = await createTestDb();
  await createAdmin(db, { email: ADMIN_EMAIL, password: ADMIN_TEMP_PASSWORD });
  await db.query(
    `update app.users set password_hash = $2, must_change_password = false, password_changed_at = now() where email = $1`,
    [ADMIN_EMAIL, await hashPassword(ADMIN_PASSWORD)]
  );
  admin = new Agent();
  assert.equal((await admin.login(ADMIN_EMAIL, ADMIN_PASSWORD)).status, 200);
});
after(() => db.end());
// Each rate-limit test is self-contained; start every test with fresh counters.
beforeEach(() => db.query('delete from app.rate_limits'));

describe('password reset is only by email', () => {
  test('there is no signed-in change-password action', async () => {
    const r = await admin.post('/auth/change-password', { currentPassword: ADMIN_PASSWORD, newPassword: 'Another-Pass-2026!' });
    assert.equal(r.status, 404);
  });

  test('signing in opens the workspace', async () => {
    const login = await new Agent().login(ADMIN_EMAIL, ADMIN_PASSWORD);
    assert.equal(login.status, 200);
    assert.equal(login.body.redirectTo, '/admin');
  });

  test('a reset link expires in 30 minutes', async () => {
    const { rows } = await db.query('select id from app.users where email = $1', [ADMIN_EMAIL]);
    const issued = await issueAccessToken(db, { userId: rows[0].id, purpose: 'reset', ttlMs: config.tokens.selfResetTtlMs });
    const expected = Date.now() + 30 * 60 * 1000;
    assert.equal(config.tokens.selfResetTtlMs, 30 * 60 * 1000);
    assert.equal(config.tokens.adminResetTtlMs, 30 * 60 * 1000);
    assert.ok(Math.abs(issued.expiresAt.getTime() - expected) < 60_000);
    await db.query("delete from app.password_reset_tokens where purpose = 'reset'");
  });
});

describe('login', () => {
  test('sets a hardened HttpOnly session cookie and stores only a hash', async () => {
    const agent = new Agent();
    const r = await agent.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    assert.equal(r.status, 200);
    const cookie = r.setCookies.find((c) => c.startsWith(`${COOKIE}=`));
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /Path=\//);
    assert.ok(!JSON.stringify(r.body).includes(agent.cookie), 'token is not in the response body');

    const raw = await db.query('select count(*)::int as n from app.sessions where token_hash = $1', [agent.cookie]);
    assert.equal(raw.rows[0].n, 0, 'raw token is never stored');
    const hashed = await db.query('select count(*)::int as n from app.sessions where token_hash = $1', [hashToken(agent.cookie)]);
    assert.equal(hashed.rows[0].n, 1);
  });

  test('stores passwords as Argon2id hashes', async () => {
    const { rows } = await db.query('select password_hash from app.users where email = $1', [ADMIN_EMAIL]);
    assert.match(rows[0].password_hash, /^\$argon2id\$/);
  });

  test('accepts the email case-insensitively', async () => {
    assert.equal((await new Agent().login(ADMIN_EMAIL.toUpperCase(), ADMIN_PASSWORD)).status, 200);
  });

  test('uses the same generic error for a wrong password and an unknown email', async () => {
    const wrong = await new Agent().login(ADMIN_EMAIL, 'definitely-wrong-password');
    const unknown = await new Agent().login('nobody@example.test', 'definitely-wrong-password');
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.body.error.message, unknown.body.error.message);
    assert.equal(wrong.sessionToken, undefined);
  });

  test('rejects missing fields', async () => {
    assert.equal((await new Agent().login('', '')).status, 422);
  });

  test('rate-limits repeated attempts for one email', async () => {
    const email = 'ratelimit@example.test';
    const statuses = [];
    for (let i = 0; i < 9; i++) {
      statuses.push((await new Agent().login(email, `wrong-password-${i}`)).status);
    }
    assert.deepEqual(statuses.slice(0, 8), Array(8).fill(401));
    assert.equal(statuses[8], 429);
  });

  test('rate-limits a single IP across many emails', async () => {
    const ip = nextIp();
    let last;
    for (let i = 0; i < 31; i++) {
      last = await call({ method: 'POST', path: '/auth/login', body: { email: `ip${i}@example.test`, password: 'whatever-password' }, ip });
    }
    assert.equal(last.status, 429);
    assert.ok(Number(last.headers['retry-after']) > 0);
  });
});

describe('sessions', () => {
  test('logout revokes the session server-side', async () => {
    const agent = new Agent();
    await agent.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    const token = agent.cookie;
    const out = await agent.post('/auth/logout');
    assert.equal(out.status, 200);
    assert.equal(out.sessionToken, '', 'cookie is cleared');

    const replay = await call({ path: '/auth/session', cookie: token });
    assert.equal(replay.status, 401, 'a copied cookie stops working after logout');
  });

  test('rejects missing, malformed and forged session cookies', async () => {
    assert.equal((await call({ path: '/auth/session' })).status, 401);
    assert.equal((await call({ path: '/auth/session', cookie: 'not-a-token' })).status, 401);
    assert.equal((await call({ path: '/auth/session', cookie: 'A'.repeat(43) })).status, 401);
  });

  test('expired sessions are rejected', async () => {
    const agent = new Agent();
    await agent.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    await db.query("update app.sessions set expires_at = now() - interval '1 second' where token_hash = $1", [hashToken(agent.cookie)]);
    assert.equal((await agent.get('/auth/session')).status, 401);
  });

  test('sessions past the absolute lifetime are rejected even if recently used', async () => {
    const agent = new Agent();
    await agent.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    await db.query("update app.sessions set created_at = now() - interval '8 days' where token_hash = $1", [hashToken(agent.cookie)]);
    assert.equal((await agent.get('/auth/session')).status, 401);
  });

  test('/ redirects according to the session', async () => {
    const anon = await call({ path: '/entry' });
    assert.equal(anon.status, 302);
    assert.equal(anon.headers.location, '/auth/login');

    const signedIn = await admin.get('/entry');
    assert.equal(signedIn.headers.location, '/admin');
  });
});

describe('CSRF and request hardening', () => {
  test('rejects state-changing requests from another origin', async () => {
    const r = await call({ method: 'POST', path: '/auth/login', body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }, headers: { origin: 'https://evil.example' }, ip: nextIp() });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, 'CSRF');
    assert.equal(r.sessionToken, undefined);
  });

  test('rejects state-changing requests without Origin or Sec-Fetch-Site', async () => {
    const r = await call({ method: 'POST', path: '/auth/logout', body: {}, headers: { origin: '' }, cookie: admin.cookie });
    assert.equal(r.status, 403);
  });

  test('accepts Sec-Fetch-Site: same-origin when Origin is absent', async () => {
    const r = await call({ method: 'POST', path: '/auth/login', body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }, headers: { 'sec-fetch-site': 'same-origin' }, ip: nextIp() });
    assert.equal(r.status, 200);
  });

  test('rejects cross-site Sec-Fetch-Site', async () => {
    const r = await call({ method: 'POST', path: '/auth/logout', body: {}, headers: { 'sec-fetch-site': 'cross-site' }, cookie: admin.cookie });
    assert.equal(r.status, 403);
  });

  test('requires JSON bodies (blocks form-encoded CSRF)', async () => {
    const r = await call({ method: 'POST', path: '/auth/login', rawBody: `email=${ADMIN_EMAIL}&password=x`, contentType: 'application/x-www-form-urlencoded', ip: nextIp() });
    assert.equal(r.status, 415);
  });

  test('rejects malformed JSON', async () => {
    const r = await call({ method: 'POST', path: '/auth/login', rawBody: '{nope', ip: nextIp() });
    assert.equal(r.status, 400);
  });

  test('unknown routes and wrong methods', async () => {
    assert.equal((await call({ path: '/nope' })).status, 404);
    const wrong = await call({ method: 'DELETE', path: '/auth/session' });
    assert.equal(wrong.status, 405);
    assert.match(wrong.headers.allow, /GET/);
  });

  test('responses are never cached', async () => {
    const r = await admin.get('/auth/session');
    assert.equal(r.headers['cache-control'], 'no-store');
  });
});

describe('appearance', () => {
  test('the theme is stored on the account and does not follow another user', async () => {
    const session = await admin.get('/auth/session');
    assert.equal(session.body.user.theme, 'light');

    const saved = await admin.patch('/auth/theme', { theme: 'dark' });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.theme, 'dark');
    assert.equal((await admin.get('/auth/session')).body.user.theme, 'dark');

    const invalid = await admin.patch('/auth/theme', { theme: 'blue' });
    assert.equal(invalid.status, 422);

    const employee = await createActiveEmployee(admin);
    assert.equal((await employee.agent.get('/auth/session')).body.user.theme, 'light');
    await admin.patch('/auth/theme', { theme: 'light' });
  });

  test('the clock region is stored on the account and returns after a new sign-in', async () => {
    const session = await admin.get('/auth/session');
    assert.equal(session.body.user.timezone, 'America/New_York');

    const saved = await admin.patch('/auth/timezone', { timezone: 'America/Los_Angeles' });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.timezone, 'America/Los_Angeles');
    const stored = await db.query('select timezone from app.users where email = $1', [ADMIN_EMAIL]);
    assert.equal(stored.rows[0].timezone, 'America/Los_Angeles');

    const invalid = await admin.patch('/auth/timezone', { timezone: 'Not/AZone' });
    assert.equal(invalid.status, 422);
    assert.equal((await db.query('select timezone from app.users where email = $1', [ADMIN_EMAIL])).rows[0].timezone, 'America/Los_Angeles');

    assert.equal((await admin.post('/auth/logout')).status, 200);
    assert.equal((await admin.get('/auth/session')).status, 401);
    assert.equal((await admin.login(ADMIN_EMAIL, ADMIN_PASSWORD)).status, 200);
    assert.equal((await admin.get('/auth/session')).body.user.timezone, 'America/Los_Angeles');

    const employee = await createActiveEmployee(admin);
    assert.equal((await employee.agent.get('/auth/session')).body.user.timezone, 'America/New_York');
    await admin.patch('/auth/timezone', { timezone: 'America/New_York' });
  });
});

describe('forgot password', () => {
  test('returns the same response for known and unknown emails', async () => {
    const known = await call({ method: 'POST', path: '/auth/forgot-password', body: { email: ADMIN_EMAIL }, ip: nextIp() });
    const unknown = await call({ method: 'POST', path: '/auth/forgot-password', body: { email: 'ghost@example.test' }, ip: nextIp() });
    assert.equal(known.status, 200);
    assert.deepEqual(known.body, unknown.body);
  });

  test('without email configured, no reset token is created', async () => {
    const { rows } = await db.query("select count(*)::int as n from app.password_reset_tokens where purpose = 'reset'");
    assert.equal(rows[0].n, 0);
  });

  test('is rate limited per email', async () => {
    const email = 'forgot-limit@example.test';
    let last;
    for (let i = 0; i < 4; i++) last = await call({ method: 'POST', path: '/auth/forgot-password', body: { email }, ip: nextIp() });
    assert.equal(last.status, 429);
  });
});

