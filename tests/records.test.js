import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { call, createActiveEmployee, createTestDb, setupAdmin } from './helpers.js';

/** @type {Awaited<ReturnType<typeof createTestDb>>} */
let db;
/** @type {Awaited<ReturnType<typeof setupAdmin>>} */
let admin;

const pdf = Buffer.from('%PDF-1.4 record');
const file = `data:application/pdf;base64,${pdf.toString('base64')}`;

before(async () => {
  db = await createTestDb();
  admin = await setupAdmin(db);
});
after(() => db.end());

describe('documents and invoices', () => {
  test('a company document is stored in Postgres and only visible people can download it', async () => {
    const alice = await createActiveEmployee(admin, { email: 'alice.records@example.test', employeeCode: 'REC-1' });
    const created = await admin.post('/admin/documents', {
      kind: 'library',
      title: 'Staff handbook',
      category: 'Policy',
      visibility: 'leadership',
      fileName: 'handbook.pdf',
      file
    });
    assert.equal(created.status, 201);
    const stored = await db.query('select octet_length(file_bytes)::int as n, mime from app.documents where id = $1', [created.body.document.id]);
    assert.equal(stored.rows[0].n, pdf.length);
    assert.equal(stored.rows[0].mime, 'application/pdf');
    assert.ok(!JSON.stringify(created.body).includes('file_bytes'));

    const blocked = await alice.agent.get(`/documents/${created.body.document.id}/file`);
    assert.equal(blocked.status, 404);

    const grant = await admin.post('/admin/access', { userId: alice.employee.id, leadership: true });
    assert.equal(grant.status, 200);
    const opened = await alice.agent.get(`/documents/${created.body.document.id}/file`);
    assert.equal(opened.status, 200);
    assert.equal(opened.headers['content-type'], 'application/pdf');
    assert.equal(Buffer.from(opened.raw).subarray(0, 4).toString(), '%PDF');

    const listed = await alice.agent.get('/employee/documents');
    assert.equal(listed.body.documents.length, 1);

    const anonymous = await call({ path: `/documents/${created.body.document.id}/file` });
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.raw.includes('%PDF'), false);
  });

  test('Word, PowerPoint, and other files are stored and stay private', async () => {
    const docx = Buffer.from('PK office document');
    const mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const created = await admin.post('/admin/documents', {
      kind: 'resource',
      title: 'Brand deck notes',
      visibility: 'company',
      fileName: 'notes.docx',
      file: `data:${mime};base64,${docx.toString('base64')}`
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.document.mime, mime);

    const employee = await createActiveEmployee(admin, { email: 'dana.records@example.test', employeeCode: 'REC-4' });
    const opened = await employee.agent.get(`/documents/${created.body.document.id}/file`);
    assert.equal(opened.status, 200);
    assert.equal(opened.headers['content-disposition'].startsWith('attachment'), true);
    assert.equal(Buffer.from(opened.raw).equals(docx), true);

    const outsider = await call({ path: `/documents/${created.body.document.id}/file` });
    assert.equal(outsider.status, 401);
  });

  test('an employee only sees their own non-draft invoices', async () => {
    const bob = await createActiveEmployee(admin, { email: 'bob.records@example.test', employeeCode: 'REC-2' });
    const cara = await createActiveEmployee(admin, { email: 'cara.records@example.test', employeeCode: 'REC-3' });
    const invoice = await admin.post('/admin/invoices', {
      employeeId: bob.employee.id,
      invoiceNumber: 'inv-10',
      description: 'March stipend',
      amount: '1500.50',
      currency: 'usd',
      status: 'open',
      issuedOn: '2026-03-01',
      dueOn: '2026-03-15'
    });
    assert.equal(invoice.status, 201);
    assert.equal(invoice.body.invoice.currency, 'USD');
    assert.equal(invoice.body.invoice.invoiceNumber, 'INV-10');

    await admin.post('/admin/invoices', {
      employeeId: bob.employee.id,
      invoiceNumber: 'INV-DRAFT',
      description: 'Hidden draft',
      amount: '10',
      currency: 'USD',
      status: 'draft',
      issuedOn: '2026-03-02'
    });
    await admin.post('/admin/invoices', {
      employeeId: cara.employee.id,
      invoiceNumber: 'INV-20',
      description: 'Cara only',
      amount: '20',
      currency: 'EUR',
      status: 'open',
      issuedOn: '2026-03-02'
    });

    const own = await bob.agent.get('/employee/invoices');
    assert.equal(own.status, 200);
    assert.deepEqual(own.body.invoices.map((row) => row.invoiceNumber), ['INV-10']);
    const overview = await admin.get('/admin/overview');
    assert.equal(overview.body.invoices, 3);
    assert.ok(overview.body.documents >= 1);
  });
});
