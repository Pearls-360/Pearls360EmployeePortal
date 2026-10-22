import { HttpError, clientIp, readJson, sendJson } from '../http.js';
import { audit, requireSession } from '../security.js';
import { assertUuid } from '../validation.js';

const STATUSES = new Set(['draft', 'open', 'paid', 'void']);
const LIST = `
  i.id, i.invoice_number, i.description, i.amount::text as amount, i.currency, i.status,
  to_char(i.issued_on, 'YYYY-MM-DD') as issued_on, to_char(i.due_on, 'YYYY-MM-DD') as due_on,
  i.employee_id, u.email as employee_email,
  p.first_name, p.last_name`;

/** @param {any} row */
function toInvoice(row) {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    description: row.description,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    issuedOn: row.issued_on,
    dueOn: row.due_on,
    employeeId: row.employee_id,
    employeeEmail: row.employee_email,
    employeeName: `${row.first_name || ''} ${row.last_name || ''}`.trim()
  };
}

/** @param {unknown} value */
function isDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** @type {import('../router.js').Handler} */
export async function listInvoices({ db, req, res }) {
  await requireSession(db, req, { roles: ['admin'] });
  const { rows } = await db.query(
    `select ${LIST}
       from app.invoices i
       join app.users u on u.id = i.employee_id
       left join app.employee_profiles p on p.user_id = u.id
      where i.deleted_at is null and u.deleted_at is null
      order by i.issued_on desc, i.created_at desc
      limit 300`
  );
  sendJson(res, 200, { invoices: rows.map(toInvoice) });
}

/** @type {import('../router.js').Handler} */
export async function createInvoice({ db, req, res }) {
  const session = await requireSession(db, req, { roles: ['admin'] });
  const body = await readJson(req);
  const employeeId = String(body.employeeId || '');
  const invoiceNumber = String(body.invoiceNumber || '').trim().toUpperCase();
  const description = String(body.description || '').trim();
  const amountRaw = String(body.amount || '').trim();
  const currency = String(body.currency || '').trim().toUpperCase();
  const status = String(body.status || 'open');
  const issuedOn = String(body.issuedOn || '');
  const dueOn = String(body.dueOn || '');
  /** @type {Record<string, string>} */
  const errors = {};
  if (!/^[0-9a-f-]{36}$/i.test(employeeId)) errors.employeeId = 'Choose an employee.';
  if (!/^[A-Z0-9][A-Z0-9_-]{0,31}$/.test(invoiceNumber)) errors.invoiceNumber = 'Use letters, numbers, dashes, or underscores.';
  if (!description || description.length > 240) errors.description = 'Description is required.';
  if (!/^\d+(\.\d{1,2})?$/.test(amountRaw) || Number(amountRaw) > 9999999999.99) errors.amount = 'Enter an amount with up to 2 decimal places.';
  if (!/^[A-Z]{3}$/.test(currency)) errors.currency = 'Use a 3-letter currency code.';
  if (!STATUSES.has(status)) errors.status = 'Choose a status.';
  if (!isDate(issuedOn)) errors.issuedOn = 'Enter the issue date.';
  if (dueOn && !isDate(dueOn)) errors.dueOn = 'Enter a valid due date.';
  if (dueOn && issuedOn && dueOn < issuedOn) errors.dueOn = 'Due date cannot be before the issue date.';
  if (Object.keys(errors).length) throw new HttpError(422, 'Please correct the highlighted fields.', { code: 'VALIDATION', fields: errors });

  const { rows: employees } = await db.query("select id from app.users where id = $1 and role = 'employee' and deleted_at is null", [employeeId]);
  if (!employees[0]) throw new HttpError(422, 'Choose an employee.', { code: 'VALIDATION', fields: { employeeId: 'Choose an employee account.' } });

  try {
    const { rows } = await db.query(
      `insert into app.invoices
         (employee_id, invoice_number, description, amount, currency, status, issued_on, due_on, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning id`,
      [employeeId, invoiceNumber, description, amountRaw, currency, status, issuedOn, dueOn || null, session.user.id]
    );
    await audit(db, {
      actorId: session.user.id,
      action: 'invoice.created',
      targetType: 'invoice',
      targetId: rows[0].id,
      metadata: { currency, status },
      ip: clientIp(req)
    });
  } catch (err) {
    const code = /** @type {{ code?: string }} */ (err).code;
    if (code === '23505') {
      throw new HttpError(409, 'That invoice number is already used.', { code: 'CONFLICT', fields: { invoiceNumber: 'This invoice number is already used.' } });
    }
    throw err;
  }

  const { rows } = await db.query(
    `select ${LIST} from app.invoices i
       join app.users u on u.id = i.employee_id
       left join app.employee_profiles p on p.user_id = u.id
      where i.invoice_number = $1`,
    [invoiceNumber]
  );
  sendJson(res, 201, { invoice: toInvoice(rows[0]) });
}

/** @type {import('../router.js').Handler} */
export async function setInvoiceStatus({ db, req, res, params }) {
  const session = await requireSession(db, req, { roles: ['admin'] });
  const id = assertUuid(params.id, 'Invoice not found.');
  const body = await readJson(req);
  if (!STATUSES.has(String(body.status || ''))) {
    throw new HttpError(422, 'Choose a status.', { code: 'VALIDATION', fields: { status: 'Choose a status.' } });
  }
  const { rowCount } = await db.query('update app.invoices set status = $2 where id = $1 and deleted_at is null', [id, body.status]);
  if (!rowCount) throw new HttpError(404, 'Invoice not found.', { code: 'NOT_FOUND' });
  await audit(db, { actorId: session.user.id, action: 'invoice.updated', targetType: 'invoice', targetId: id, metadata: { status: body.status }, ip: clientIp(req) });
  sendJson(res, 200, { ok: true });
}

/** @type {import('../router.js').Handler} */
export async function listOwnInvoices({ db, req, res }) {
  const session = await requireSession(db, req, { roles: ['employee'] });
  const { rows } = await db.query(
    `select ${LIST}
       from app.invoices i
       join app.users u on u.id = i.employee_id
       left join app.employee_profiles p on p.user_id = u.id
      where i.employee_id = $1 and i.status <> 'draft' and i.deleted_at is null
      order by i.issued_on desc`,
    [session.user.id]
  );
  sendJson(res, 200, { invoices: rows.map(toInvoice) });
}
