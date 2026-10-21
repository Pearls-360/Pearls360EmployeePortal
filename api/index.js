import { attachDatabasePool } from '@vercel/functions';
import { getDb } from '../server/db.js';
import { handleApi } from '../server/router.js';

let attached = false;

/**
 * Single Vercel Function serving every /api/* route (see vercel.json rewrites).
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
export default async function handler(req, res) {
  if (!attached) {
    try {
      // Lets Fluid compute release idle pooled connections before suspending.
      // @ts-ignore pool is exposed by createPgDatabase
      attachDatabasePool(getDb().pool);
      attached = true;
    } catch {
      // DATABASE_URL missing; handleApi reports a 503.
    }
  }
  return handleApi(req, res);
}
