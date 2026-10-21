import { PGlite } from '@electric-sql/pglite';
import { setDb } from '../server/db.js';
import { migrate } from '../server/migrations.js';
import { handleApi } from '../server/router.js';
import { createAdmin } from '../server/bootstrap.js';
import { config } from '../server/config.js';

export const ORIGIN = config.appOrigin;
export const COOKIE = config.session.cookieName;

/**
 * Wraps PGlite in the same interface as server/db.js. Parameterless calls use
 * `exec` so multi-statement migration files work like they do over `pg`.
 * @param {any} client PGlite instance or transaction
 */
function adapt(client) {
  return {
    async query(text, params) {
      if (params && params.length) {
        const r = await client.query(text, params);
        return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
      }
      const results = await client.exec(text);
      const last = results[results.length - 1] || { rows: [], affectedRows: 0 };
      return { rows: last.rows, rowCount: last.affectedRows ?? last.rows.length };
    }
  };
}

/** Fresh, migrated in-memory Postgres wired into the API. */
export async function createTestDb() {
  const pglite = new PGlite();
  const db = {
    ...adapt(pglite),
    tx: (fn) => pglite.transaction((tx) => fn(adapt(tx))),
    end: () => pglite.close()
  };
  await migrate(db);
  setDb(db);
  return db;
}

let ipCounter = 0;
/** Unique client IP per agent so per-IP rate limits don't leak between tests. */
export function nextIp() {
  ipCounter += 1;
  return `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
}

/**
 * Calls the API router with a mock request/response.
 * @param {{ method?: string, path: string, body?: unknown, cookie?: string, headers?: Record<string, string>, ip?: string, rawBody?: string, contentType?: string }} opts
 */
export async function call({ method = 'GET', path, body, cookie, headers = {}, ip = '10.255.0.1', rawBody, contentType }) {
  /** @type {Record<string, string>} */
  const reqHeaders = { 'x-forwarded-for': ip, ...headers };
  if (method !== 'GET' && !('origin' in headers) && !('sec-fetch-site' in headers)) reqHeaders.origin = ORIGIN;
  if (cookie) reqHeaders.cookie = `${COOKIE}=${cookie}`;
  if (body !== undefined || rawBody !== undefined) reqHeaders['content-type'] = contentType ?? 'application/json';

  const req = {
    method,
    url: `/api${path}`,
    headers: Object.fromEntries(Object.entries(reqHeaders).map(([k, v]) => [k.toLowerCase(), v])),
    body: rawBody !== undefined ? rawBody : body,
    socket: { remoteAddress: ip }
  };

  /** @type {Record<string, any>} */
  const resHeaders = {};
  let resolveDone;
  const done = new Promise((r) => { resolveDone = r; });
  const res = {
    statusCode: 200,
    headersSent: false,
    setHeader(name, value) { resHeaders[name.toLowerCase()] = value; },
    getHeader(name) { return resHeaders[name.toLowerCase()]; },
    end(payload) { this.headersSent = true; resolveDone(payload); }
  };

  await handleApi(/** @type {any} */ (req), /** @type {any} */ (res));
  const payload = await done;
  const setCookies = [].concat(resHeaders['set-cookie'] || []);
  const sessionCookie = setCookies.find((c) => c.startsWith(`${COOKIE}=`));
  const type = String(resHeaders['content-type'] || '');
  const text = payload == null ? '' : Buffer.isBuffer(payload) ? payload.toString() : String(payload);
  return {
    status: res.statusCode,
    headers: resHeaders,
    raw: payload,
    body: payload && type.includes('json') ? JSON.parse(text) : null,
    setCookies,
    /** Token from Set-Cookie: string when set, '' when cleared, undefined when untouched. */
    sessionToken: sessionCookie ? decodeURIComponent(sessionCookie.split(';')[0].slice(COOKIE.length + 1)) : undefined
  };
}

/** A browser-like client that keeps its session cookie. */
export class Agent {
  constructor() {
    this.ip = nextIp();
    /** @type {string | undefined} */
    this.cookie = undefined;
  }

  async request(method, path, body, extra = {}) {
    const r = await call({ method, path, body, cookie: this.cookie, ip: this.ip, ...extra });
    if (r.sessionToken !== undefined) this.cookie = r.sessionToken || undefined;
    return r;
  }

  get(path, extra) { return this.request('GET', path, undefined, extra); }
  post(path, body = {}, extra) { return this.request('POST', path, body, extra); }
  patch(path, body = {}, extra) { return this.request('PATCH', path, body, extra); }

  async login(email, password) {
    return this.post('/auth/login', { email, password });
  }
}

export const ADMIN_EMAIL = 'director@example.test';
export const ADMIN_TEMP_PASSWORD = 'Temp-Admin-Pass-2026!';
export const ADMIN_PASSWORD = 'Real-Admin-Pass-2026!';

/** Bootstraps an admin and completes the forced password change. Returns a signed-in agent. */
export async function setupAdmin(db) {
  await createAdmin(db, { email: ADMIN_EMAIL, password: ADMIN_TEMP_PASSWORD });
  const admin = new Agent();
  await admin.login(ADMIN_EMAIL, ADMIN_TEMP_PASSWORD);
  const r = await admin.post('/auth/change-password', { currentPassword: ADMIN_TEMP_PASSWORD, newPassword: ADMIN_PASSWORD });
  if (r.status !== 200) throw new Error(`admin password change failed: ${JSON.stringify(r.body)}`);
  return admin;
}

let employeeCounter = 0;
/** @param {Record<string, string>} [overrides] */
export function employeeInput(overrides = {}) {
  employeeCounter += 1;
  return {
    firstName: 'Test',
    lastName: `Employee${employeeCounter}`,
    email: `employee${employeeCounter}@example.test`,
    phone: '+1 555 010 0000',
    employeeCode: `EMP-${String(employeeCounter).padStart(3, '0')}`,
    department: 'Design',
    designation: 'Planner',
    joiningDate: '2026-01-15',
    employmentStatus: 'active',
    ...overrides
  };
}

/** Extracts the raw token from a one-time link. @param {string} url */
export function tokenFromUrl(url) {
  return new URL(url).hash.replace('#token=', '');
}

/**
 * Creates an employee via the admin API and activates it through the one-time
 * link. Returns the employee record, credentials and a signed-in agent.
 * @param {Agent} admin
 */
export async function createActiveEmployee(admin, overrides = {}, password = 'Employee-Pass-2026!') {
  const input = employeeInput(overrides);
  const created = await admin.post('/admin/employees', input);
  if (created.status !== 201) throw new Error(`create failed: ${JSON.stringify(created.body)}`);
  const token = tokenFromUrl(created.body.accessLink.url);
  const set = await call({ method: 'POST', path: '/auth/set-password', body: { token, password }, ip: nextIp() });
  if (set.status !== 200) throw new Error(`activation failed: ${JSON.stringify(set.body)}`);
  const agent = new Agent();
  const login = await agent.login(input.email, password);
  if (login.status !== 200) throw new Error(`login failed: ${JSON.stringify(login.body)}`);
  return { employee: created.body.employee, input, password, agent };
}
