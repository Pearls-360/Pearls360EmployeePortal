/**
 * Minimal request/response helpers that work with both Vercel Node functions
 * and the Vite dev-server middleware (plain Node IncomingMessage/ServerResponse).
 */

export class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} message  safe to show to the user
   * @param {{ code?: string, fields?: Record<string, string>, headers?: Record<string, string> }} [extra]
   */
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = extra.code;
    this.fields = extra.fields;
    this.headers = extra.headers;
  }
}

/** Default JSON body limit. Profile photo uploads send a compressed data-URL (~700 KB). */
const MAX_BODY_BYTES = 768 * 1024;

/** @param {import('node:http').IncomingMessage & { body?: unknown }} req */
export async function readJson(req) {
  const type = String(req.headers['content-type'] || '');
  if (!type.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'Requests must be sent as JSON.');
  }
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  let raw = '';
  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
    raw = req.body.toString();
  } else {
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Request is too large.');
      raw += chunk;
    }
  }
  if (raw.length > MAX_BODY_BYTES) throw new HttpError(413, 'Request is too large.');
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed;
  } catch {
    throw new HttpError(400, 'Invalid request body.');
  }
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 */
export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

/** @param {import('node:http').ServerResponse} res @param {string} location */
export function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}

/** @param {import('node:http').IncomingMessage} req */
export function parseCookies(req) {
  /** @type {Record<string, string>} */
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    if (!name || name in out) continue;
    try {
      out[name] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      // ignore malformed values
    }
  }
  return out;
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {string} name
 * @param {string} value
 * @param {{ maxAgeSeconds: number, secure: boolean }} options
 */
export function setCookie(res, name, value, { maxAgeSeconds, secure }) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`
  ];
  if (secure) parts.push('Secure');
  const existing = res.getHeader('Set-Cookie');
  const list = Array.isArray(existing) ? existing : existing ? [String(existing)] : [];
  res.setHeader('Set-Cookie', [...list, parts.join('; ')]);
}

/** @param {import('node:http').IncomingMessage} req */
export function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded || '').split(',')[0].trim();
  const real = req.headers['x-real-ip'];
  return first || (Array.isArray(real) ? real[0] : real) || req.socket?.remoteAddress || 'unknown';
}

/** @param {import('node:http').IncomingMessage} req */
export function userAgent(req) {
  return String(req.headers['user-agent'] || '').slice(0, 300);
}
