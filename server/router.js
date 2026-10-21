import { getDb } from './db.js';
import { HttpError, redirect, sendJson } from './http.js';
import { assertSameOrigin } from './security.js';
import * as auth from './routes/auth.js';
import * as admin from './routes/admin.js';
import * as employee from './routes/employee.js';
import * as profile from './routes/profile.js';
import * as documents from './routes/documents.js';
import * as invoices from './routes/invoices.js';
import * as access from './routes/access.js';

/**
 * @typedef {{
 *   db: import('./db.js').Database,
 *   req: import('node:http').IncomingMessage & { body?: unknown },
 *   res: import('node:http').ServerResponse,
 *   url: URL,
 *   params: Record<string, string>
 * }} HandlerContext
 * @typedef {(ctx: HandlerContext) => Promise<void>} Handler
 */

/** @type {Array<[string, string, Handler]>} */
const ROUTES = [
  ['GET', '/entry', auth.entry],
  ['POST', '/auth/login', auth.login],
  ['POST', '/auth/logout', auth.logout],
  ['GET', '/auth/session', auth.currentSession],
  ['POST', '/auth/change-password', auth.changePassword],
  ['PATCH', '/auth/theme', auth.updateTheme],
  ['POST', '/auth/forgot-password', auth.forgotPassword],
  ['POST', '/auth/token-info', auth.accessTokenInfo],
  ['POST', '/auth/set-password', auth.setPasswordWithToken],
  ['GET', '/auth/profile', profile.getSelfProfile],
  ['PATCH', '/auth/profile', profile.updateSelfProfile],
  ['GET', '/auth/avatar', profile.getOwnAvatar],

  ['GET', '/admin/overview', admin.overview],
  ['GET', '/admin/employees', admin.listEmployees],
  ['POST', '/admin/employees', admin.createEmployee],
  ['GET', '/admin/employees/:id', admin.getEmployee],
  ['PATCH', '/admin/employees/:id', admin.updateEmployee],
  ['POST', '/admin/employees/:id/status', admin.setEmployeeStatus],
  ['POST', '/admin/employees/:id/access-link', admin.issueEmployeeAccessLink],
  ['GET', '/admin/admins', admin.listAdmins],
  ['POST', '/admin/admins', admin.createAdminAccount],
  ['POST', '/admin/admins/:id/status', admin.setAdminStatus],
  ['POST', '/admin/admins/:id/access-link', admin.issueAdminAccessLink],
  ['GET', '/admin/audit-logs', admin.auditLogs],
  ['GET', '/admin/documents', documents.listAdminDocuments],
  ['POST', '/admin/documents', documents.createDocument],
  ['DELETE', '/admin/documents/:id', documents.deleteDocument],
  ['GET', '/documents/:id/file', documents.downloadDocument],
  ['GET', '/admin/invoices', invoices.listInvoices],
  ['POST', '/admin/invoices', invoices.createInvoice],
  ['POST', '/admin/invoices/:id/status', invoices.setInvoiceStatus],
  ['GET', '/admin/access', access.listAccess],
  ['POST', '/admin/access', access.setAccess],

  ['GET', '/employee/profile', employee.getProfile],
  ['GET', '/employee/documents', documents.listOwnDocuments],
  ['GET', '/employee/invoices', invoices.listOwnInvoices],
  ['PATCH', '/employee/profile', employee.updateProfile]
];

const COMPILED = ROUTES.map(([method, pattern, handler]) => {
  const keys = [];
  const regex = new RegExp(
    '^' + pattern.replace(/:([a-zA-Z]+)/g, (_, key) => { keys.push(key); return '([^/]+)'; }) + '/?$'
  );
  return { method, regex, keys, handler };
});

/** @param {string | undefined} code */
function databaseErrorMessage(code) {
  if (code === 'SELF_SIGNED_CERT_IN_CHAIN' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
    return 'The database certificate was rejected. Remove DATABASE_CA_CERT and redeploy.';
  }
  if (code === '28P01' || code === '28000') return 'The database rejected the username or password.';
  if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ENETUNREACH' || code === 'EAI_AGAIN') {
    return 'The server could not reach the database host. Use the transaction pooler on port 6543.';
  }
  if (code === '42P01' || code === '3F000') return 'The database is missing the portal tables.';
  return 'Something went wrong. Please try again.';
}

/** @param {URL} url */
function apiPath(url) {
  // Vercel rewrites /api/:path* to /api?route=:path*; locally the full path is used.
  const routed = url.searchParams.get('route');
  if (routed !== null) return '/' + routed.replace(/^\/+/, '');
  return url.pathname.replace(/^\/api(?=\/|$)/, '') || '/';
}

/**
 * @param {import('node:http').IncomingMessage & { body?: unknown }} req
 * @param {import('node:http').ServerResponse} res
 */
export async function handleApi(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  const url = new URL(req.url || '/', 'http://localhost');
  const path = apiPath(url);
  const method = (req.method || 'GET').toUpperCase();

  try {
    const pathMatches = COMPILED.filter((r) => r.regex.test(path));
    if (!pathMatches.length) throw new HttpError(404, 'Not found.', { code: 'NOT_FOUND' });
    const route = pathMatches.find((r) => r.method === method);
    if (!route) {
      res.setHeader('Allow', pathMatches.map((r) => r.method).join(', '));
      throw new HttpError(405, 'Method not allowed.', { code: 'METHOD_NOT_ALLOWED' });
    }

    assertSameOrigin(req);
    const match = /** @type {RegExpExecArray} */ (route.regex.exec(path));
    /** @type {Record<string, string>} */
    const params = {};
    route.keys.forEach((key, i) => { params[key] = decodeURIComponent(match[i + 1]); });

    await route.handler({ db: getDb(), req, res, url, params });
  } catch (err) {
    if (res.headersSent) return;
    if (path === '/entry' && method === 'GET') {
      if (!(err instanceof HttpError)) console.error('[api] entry redirect failed', err);
      redirect(res, '/auth/login');
      return;
    }
    if (err instanceof HttpError) {
      for (const [k, v] of Object.entries(err.headers || {})) res.setHeader(k, v);
      sendJson(res, err.status, { error: { message: err.message, code: err.code, fields: err.fields } });
      return;
    }
    const code = /** @type {{ code?: string }} */ (err)?.code;
    if (code === 'DB_NOT_CONFIGURED') {
      console.error('[api] DATABASE_URL is not configured');
      sendJson(res, 503, { error: { message: 'The portal is not configured yet. Please contact your administrator.', code: 'NOT_CONFIGURED' } });
      return;
    }
    console.error('[api] unhandled error', err);
    sendJson(res, 500, { error: { message: databaseErrorMessage(code), code: 'INTERNAL' } });
  }
}
