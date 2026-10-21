import pg from 'pg';
import { config } from './config.js';

/**
 * @typedef {{ rows: any[], rowCount: number | null }} QueryResult
 * @typedef {{ query: (text: string, params?: unknown[]) => Promise<QueryResult> }} Queryable
 * @typedef {Queryable & { tx: <T>(fn: (client: Queryable) => Promise<T>) => Promise<T>, end?: () => Promise<void> }} Database
 */

/** @param {string} url */
function sslOptions(url) {
  if (config.databaseSsl === 'disable') return false;
  if (config.databaseCaCert) return { ca: config.databaseCaCert, rejectUnauthorized: true };
  // Encrypted, but the server certificate is not verified. Set DATABASE_CA_CERT to verify.
  if (/supabase\.(co|com)/.test(url)) return { rejectUnauthorized: false };
  return { rejectUnauthorized: true };
}

/** sslmode in the URL would override the explicit ssl options below. */
function stripSslMode(url) {
  const parsed = new URL(url);
  parsed.searchParams.delete('sslmode');
  return parsed.toString();
}

/**
 * @param {string} url
 * @param {{ max?: number }} [options]
 * @returns {Database}
 */
export function createPgDatabase(url, options = {}) {
  const pool = new pg.Pool({
    connectionString: stripSslMode(url),
    ssl: sslOptions(url),
    max: options.max ?? config.databasePoolMax,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000
  });
  pool.on('error', (err) => console.error('[db] idle client error', err.message));

  return {
    query: (text, params) => pool.query(text, params),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await fn({ query: (text, params) => client.query(text, params) });
        await client.query('commit');
        return result;
      } catch (err) {
        await client.query('rollback').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    end: () => pool.end(),
    // @ts-ignore exposed for attachDatabasePool
    pool
  };
}

/** @type {Database | null} */
let current = null;

/** @returns {Database} */
export function getDb() {
  if (current) return current;
  if (!config.databaseUrl) {
    const err = new Error('DATABASE_URL is not configured.');
    // @ts-ignore
    err.code = 'DB_NOT_CONFIGURED';
    throw err;
  }
  current = createPgDatabase(config.databaseUrl);
  return current;
}

/** Test hook: swap in another implementation (e.g. PGlite). @param {Database | null} db */
export function setDb(db) {
  current = db;
}
