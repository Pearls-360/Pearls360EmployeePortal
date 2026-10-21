#!/usr/bin/env node
// Usage: npm run db:migrate   (reads MIGRATION_DATABASE_URL or DATABASE_URL from .env.local)
import { config } from '../server/config.js';
import { createPgDatabase } from '../server/db.js';
import { migrate } from '../server/migrations.js';

if (!config.migrationDatabaseUrl) {
  console.error('Set MIGRATION_DATABASE_URL (or DATABASE_URL) in .env.local first. See .env.example.');
  process.exit(1);
}

const db = createPgDatabase(config.migrationDatabaseUrl, { max: 1 });
try {
  const applied = await migrate(db, { log: (m) => console.log(`• ${m}`) });
  console.log(applied.length ? `Applied ${applied.length} migration(s).` : 'Database is up to date.');
} catch (err) {
  console.error('Migration failed:', /** @type {Error} */ (err).message);
  process.exitCode = 1;
} finally {
  await db.end?.();
}
