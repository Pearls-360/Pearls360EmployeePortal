import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../server/migrations.js';
import { BootstrapError, createAdmin } from '../server/bootstrap.js';
import { createTestDb } from './helpers.js';

const TABLES = ['users', 'employee_profiles', 'sessions', 'password_reset_tokens', 'audit_logs', 'rate_limits'];

describe('migrations', () => {
  test('are idempotent', async () => {
    const db = await createTestDb();
    assert.deepEqual(await migrate(db), [], 'second run applies nothing');
    const { rows } = await db.query('select filename from app.schema_migrations');
    assert.ok(rows.length >= 1);
    await db.end();
  });

  test('tables live in the private app schema with RLS enabled', async () => {
    const db = await createTestDb();
    const { rows } = await db.query(
      `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'app' and c.relkind = 'r'`
    );
    const byName = Object.fromEntries(rows.map((r) => [r.relname, r.relrowsecurity]));
    for (const t of TABLES) assert.equal(byName[t], true, `${t} has RLS`);
    const pub = await db.query("select count(*)::int as n from pg_tables where schemaname = 'public'");
    assert.equal(pub.rows[0].n, 0, 'nothing is created in the public schema');
    await db.end();
  });

  test('Supabase API roles (anon, authenticated) get no access', async () => {
    const pglite = new PGlite();
    await pglite.exec('create role anon nologin; create role authenticated nologin;');
    const db = {
      query: async (text, params) => (params?.length ? pglite.query(text, params) : (await pglite.exec(text)).at(-1) || { rows: [] }),
      tx: (fn) => pglite.transaction((tx) => fn({ query: async (text, params) => (params?.length ? tx.query(text, params) : (await tx.exec(text)).at(-1) || { rows: [] }) }))
    };
    await migrate(/** @type {any} */ (db));
    for (const role of ['anon', 'authenticated', 'public']) {
      const schema = await pglite.query("select has_schema_privilege($1, 'app', 'USAGE') as ok", [role]);
      assert.equal(schema.rows[0].ok, false, `${role} has no schema usage`);
      for (const t of TABLES) {
        const r = await pglite.query("select has_table_privilege($1, $2, 'SELECT, INSERT, UPDATE, DELETE') as ok", [role, `app.${t}`]);
        assert.equal(r.rows[0].ok, false, `${role} cannot touch app.${t}`);
      }
    }
    await pglite.close();
  });

  test('constraints reject invalid data at the database level', async () => {
    const db = await createTestDb();
    await assert.rejects(db.query("insert into app.users (email, role, status) values ('Mixed@Case.test', 'employee', 'pending')"));
    await assert.rejects(db.query("insert into app.users (email, role, status) values ('x@y.test', 'superuser', 'pending')"));
    await assert.rejects(db.query("insert into app.users (email, role, status) values ('x@y.test', 'employee', 'active')"), 'active requires a password');
    await db.end();
  });
});

describe('admin bootstrap', () => {
  test('creates one admin that must change the password, and refuses duplicates', async () => {
    const db = await createTestDb();
    const created = await createAdmin(db, { email: 'Owner@Example.test', password: 'Initial-Pass-2026!' });
    assert.equal(created.email, 'owner@example.test');

    const { rows } = await db.query('select role, status, must_change_password, password_hash from app.users');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].role, 'admin');
    assert.equal(rows[0].status, 'active');
    assert.equal(rows[0].must_change_password, true);
    assert.match(rows[0].password_hash, /^\$argon2id\$/);
    assert.ok(!rows[0].password_hash.includes('Initial-Pass-2026!'));

    await assert.rejects(createAdmin(db, { email: 'second@example.test', password: 'Another-Pass-2026!' }), BootstrapError);
    await assert.rejects(createAdmin(db, { email: 'owner@example.test', password: 'Another-Pass-2026!', allowAdditional: true }), BootstrapError);

    const extra = await createAdmin(db, { email: 'second@example.test', password: 'Another-Pass-2026!', allowAdditional: true });
    assert.equal(extra.email, 'second@example.test');

    const audit = await db.query("select count(*)::int as n from app.audit_logs where action = 'admin.bootstrap'");
    assert.equal(audit.rows[0].n, 2);
    await db.end();
  });

  test('forcePasswordChange: false creates an admin that can use the portal immediately', async () => {
    const db = await createTestDb();
    await createAdmin(db, { email: 'ready@example.test', password: 'Initial-Pass-2026!', forcePasswordChange: false });
    const { rows } = await db.query('select must_change_password from app.users');
    assert.equal(rows[0].must_change_password, false);
    await db.end();
  });

  test('rejects invalid emails and weak passwords', async () => {
    const db = await createTestDb();
    await assert.rejects(createAdmin(db, { email: 'not-an-email', password: 'Initial-Pass-2026!' }), BootstrapError);
    await assert.rejects(createAdmin(db, { email: 'owner@example.test', password: 'short' }), BootstrapError);
    await assert.rejects(createAdmin(db, { email: 'owner@example.test', password: 'aaaaaaaaaaaaaaaa' }), BootstrapError);
    const { rows } = await db.query('select count(*)::int as n from app.users');
    assert.equal(rows[0].n, 0);
    await db.end();
  });
});
