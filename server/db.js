import pg from 'pg';
import { config } from './config.js';

/**
 * @typedef {{ rows: any[], rowCount: number | null }} QueryResult
 * @typedef {{ query: (text: string, params?: unknown[]) => Promise<QueryResult> }} Queryable
 * @typedef {Queryable & { tx: <T>(fn: (client: Queryable) => Promise<T>) => Promise<T>, end?: () => Promise<void> }} Database
 */

/**
 * Supabase's pooler certificate is not in Node's trust store. Verifying it
 * (sslmode=require, or any DATABASE_CA_CERT value) fails the connection.
 * @param {string} host
 */
function sslOptions(host) {
  if (config.databaseSsl === 'disable') return false;
  return { rejectUnauthorized: false, servername: host };
}

/**
 * @param {{ host: string, port: string | number, user: string, password: string, database: string }} fields
 * @param {{ max?: number }} [options]
 * @returns {Database}
 */
function poolFromFields(fields, options = {}) {
  const pool = new pg.Pool({
    host: fields.host,
    port: Number(fields.port),
    user: fields.user,
    password: fields.password,
    database: fields.database,
    ssl: sslOptions(fields.host),
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

/**
 * @param {string} url
 * @param {{ max?: number }} [options]
 * @returns {Database}
 */
export function createPgDatabase(url, options = {}) {
  const parsed = new URL(url);
  return poolFromFields({
    host: parsed.hostname,
    port: parsed.port || '5432',
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, '')) || 'postgres'
  }, options);
}

/** @type {Database | null} */
let current = null;

/** @returns {Database} */
export function getDb() {
  if (current) return current;
  if (config.database) {
    current = poolFromFields(config.database);
    return current;
  }
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
