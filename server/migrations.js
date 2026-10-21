import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../db/migrations/', import.meta.url));

/** Arbitrary constant so concurrent runners never apply migrations twice. */
const LOCK_KEY = 360_360_001;

/**
 * Applies pending `db/migrations/*.sql` files in filename order, each in its
 * own transaction, recording them in app.schema_migrations.
 * @param {import('./db.js').Database} db
 * @param {{ log?: (msg: string) => void }} [options]
 * @returns {Promise<string[]>} applied filenames
 */
export async function migrate(db, { log = () => {} } = {}) {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();

  return db.tx(async (tx) => {
    await tx.query('select pg_advisory_xact_lock($1)', [LOCK_KEY]);
    await tx.query('create schema if not exists app');
    await tx.query(`create table if not exists app.schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )`);
    await tx.query('alter table app.schema_migrations enable row level security');

    const { rows } = await tx.query('select filename from app.schema_migrations');
    const done = new Set(rows.map((r) => r.filename));
    const applied = [];

    for (const file of files) {
      if (done.has(file)) continue;
      log(`applying ${file}`);
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      await tx.query(sql);
      await tx.query('insert into app.schema_migrations (filename) values ($1)', [file]);
      applied.push(file);
    }
    return applied;
  });
}
