import { HttpError, clientIp, readJson, sendJson } from '../http.js';
import { audit, requireSession } from '../security.js';
import { assertUuid } from '../validation.js';

const MAX_BYTES = 2_000_000;
const KINDS = new Set(['library', 'resource']);
const VISIBILITY = new Set(['company', 'leadership']);
const MIME_PATTERN = /^[a-z0-9][a-z0-9.+-]{0,127}\/[a-z0-9][a-z0-9.+-]{0,127}$/;
const VIEWABLE = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp']);
/** Types that would run in the browser if served as themselves. Stored and downloaded as a plain file. */
const ACTIVE = new Set(['text/html', 'application/xhtml+xml', 'image/svg+xml', 'text/javascript', 'application/javascript', 'application/x-javascript']);

/** @param {unknown} value */
function parseFile(value) {
  if (typeof value !== 'string') {
    throw new HttpError(422, 'Choose a file.', { code: 'VALIDATION', fields: { file: 'Choose a file under 2 MB.' } });
  }
  const match = /^data:([^;,]*);base64,([A-Za-z0-9+/=\s]+)$/i.exec(value.trim());
  if (!match) {
    throw new HttpError(422, 'Choose a file.', { code: 'VALIDATION', fields: { file: 'Use a file under 2 MB.' } });
  }
  let mime = match[1].toLowerCase() || 'application/octet-stream';
  if (!MIME_PATTERN.test(mime) || ACTIVE.has(mime)) mime = 'application/octet-stream';
  const bytes = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (!bytes.length || bytes.length > MAX_BYTES) {
    throw new HttpError(422, 'Choose a file.', { code: 'VALIDATION', fields: { file: 'Use a file under 2 MB.' } });
  }
  return { mime, bytes };
}

/** @param {unknown} value */
function cleanName(value) {
  const name = String(value || 'document').split(/[/\\]/).pop() || 'document';
  const safe = name.replace(/[^\w.\- ()]+/g, '_').replace(/^\.+/, '').slice(0, 180);
  return safe || 'document';
}

/** @param {unknown} value @param {number} max */
function cleanText(value, max) {
  return String(value || '').trim().slice(0, max);
}

const LIST_COLUMNS = `id, kind, title, category, file_name, mime, byte_size, visibility, created_at`;

/** @param {any} row */
function toDocument(row) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    category: row.category,
    fileName: row.file_name,
    mime: row.mime,
    byteSize: row.byte_size,
    visibility: row.visibility,
    createdAt: row.created_at
  };
}

/**
 * @param {import('../db.js').Queryable} db
 * @param {{ id: string, role: string }} user
 * @param {{ id: string, visibility: string }} doc
 */
async function canRead(db, user, doc) {
  if (user.role === 'admin') return true;
  if (user.role !== 'employee') return false;
  if (doc.visibility === 'company') return true;
  const { rows } = await db.query('select 1 from app.leadership_access where user_id = $1', [user.id]);
  return rows.length > 0;
}

/** @type {import('../router.js').Handler} */
export async function listAdminDocuments({ db, req, res, url }) {
  await requireSession(db, req, { roles: ['admin'] });
  const kind = url.searchParams.get('kind');
  if (!KINDS.has(kind || '')) throw new HttpError(422, 'Choose a library or a resource list.', { code: 'VALIDATION' });
  const { rows } = await db.query(
    `select ${LIST_COLUMNS} from app.documents where kind = $1 order by created_at desc limit 200`,
    [kind]
  );
  sendJson(res, 200, { documents: rows.map(toDocument) });
}

/** @type {import('../router.js').Handler} */
export async function createDocument({ db, req, res }) {
  const session = await requireSession(db, req, { roles: ['admin'] });
  const body = await readJson(req);
  const title = cleanText(body.title, 160);
  const category = cleanText(body.category, 80);
  const kind = String(body.kind || '');
  const visibility = String(body.visibility || 'company');
  /** @type {Record<string, string>} */
  const errors = {};
  if (!title) errors.title = 'Title is required.';
  if (!KINDS.has(kind)) errors.kind = 'Choose library or resource.';
  if (!VISIBILITY.has(visibility)) errors.visibility = 'Choose who can open this.';
  if (!body.file) errors.file = 'Choose a file.';
  if (Object.keys(errors).length) throw new HttpError(422, 'Please correct the highlighted fields.', { code: 'VALIDATION', fields: errors });

  const file = parseFile(body.file);
  const fileName = cleanName(body.fileName);
  const { rows } = await db.query(
    `insert into app.documents
       (kind, title, category, file_name, mime, byte_size, file_bytes, visibility, uploaded_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning ${LIST_COLUMNS}`,
    [kind, title, category || null, fileName, file.mime, file.bytes.length, file.bytes, visibility, session.user.id]
  );
  await audit(db, {
    actorId: session.user.id,
    action: 'document.created',
    targetType: 'document',
    targetId: rows[0].id,
    metadata: { kind, visibility, byteSize: file.bytes.length },
    ip: clientIp(req)
  });
  sendJson(res, 201, { document: toDocument(rows[0]) });
}

/** @type {import('../router.js').Handler} */
export async function deleteDocument({ db, req, res, params }) {
  const session = await requireSession(db, req, { roles: ['admin'] });
  const id = assertUuid(params.id, 'Document not found.');
  const { rowCount } = await db.query('delete from app.documents where id = $1', [id]);
  if (!rowCount) throw new HttpError(404, 'Document not found.', { code: 'NOT_FOUND' });
  await audit(db, { actorId: session.user.id, action: 'document.deleted', targetType: 'document', targetId: id, ip: clientIp(req) });
  sendJson(res, 200, { ok: true });
}

/** @type {import('../router.js').Handler} */
export async function downloadDocument({ db, req, res, params }) {
  const session = await requireSession(db, req, { roles: ['admin', 'employee'] });
  const id = assertUuid(params.id, 'Document not found.');
  const { rows } = await db.query(
    'select id, visibility, file_name, mime, file_bytes from app.documents where id = $1',
    [id]
  );
  const doc = rows[0];
  if (!doc || !(await canRead(db, session.user, doc))) {
    throw new HttpError(404, 'Document not found.', { code: 'NOT_FOUND' });
  }
  const bytes = Buffer.isBuffer(doc.file_bytes) ? doc.file_bytes : Buffer.from(doc.file_bytes);
  res.statusCode = 200;
  const mime = MIME_PATTERN.test(String(doc.mime)) && !ACTIVE.has(String(doc.mime)) ? String(doc.mime) : 'application/octet-stream';
  const disposition = VIEWABLE.has(mime) ? 'inline' : 'attachment';
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Length', String(bytes.length));
  res.setHeader('Content-Disposition', `${disposition}; filename="${cleanName(doc.file_name).replace(/"/g, '')}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(bytes);
}

/** @type {import('../router.js').Handler} */
export async function listOwnDocuments({ db, req, res }) {
  const session = await requireSession(db, req, { roles: ['employee'] });
  const { rows: access } = await db.query('select 1 from app.leadership_access where user_id = $1', [session.user.id]);
  const leadership = access.length > 0;
  const { rows } = await db.query(
    `select ${LIST_COLUMNS} from app.documents
      where visibility = 'company' or ($1::boolean and visibility = 'leadership')
      order by created_at desc limit 200`,
    [leadership]
  );
  sendJson(res, 200, { documents: rows.map(toDocument) });
}
