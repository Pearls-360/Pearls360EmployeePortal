#!/usr/bin/env node
/**
 * One-time bootstrap of the first Admin account.
 *
 *   npm run admin:create
 *   npm run admin:create -- --no-force-change
 *
 * Credentials come from the environment (loaded from `.env.local` by the npm
 * script). Nothing is hardcoded here.
 *
 *   ADMIN_EMAIL
 *   ADMIN_PASSWORD   (or ADMIN_INITIAL_PASSWORD)
 *
 * If either is missing, the script prompts. Pass `-- --additional` to
 * deliberately create a second Admin. Pass `-- --no-force-change` to skip the
 * forced password change on first sign-in.
 */
import readline from 'node:readline';
import { config } from '../server/config.js';
import { createPgDatabase } from '../server/db.js';
import { BootstrapError, createAdmin } from '../server/bootstrap.js';

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); }));
}

function askHidden(question) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) {
      reject(new Error('No TTY available. Set ADMIN_PASSWORD in .env.local instead.'));
      return;
    }
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (/** @type {string} */ ch) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (c === '\u0003') { stdout.write('\n'); process.exit(130); }
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1);
        else value += c;
      }
    };
    stdin.on('data', onData);
  });
}

if (!config.migrationDatabaseUrl) {
  console.error('Set DATABASE_URL (or MIGRATION_DATABASE_URL) in .env.local first. See .env.example.');
  process.exit(1);
}

const allowAdditional = process.argv.includes('--additional');
const forcePasswordChange = !process.argv.includes('--no-force-change');

const emailFromEnv = process.env.ADMIN_EMAIL?.trim();
const passwordFromEnv = process.env.ADMIN_PASSWORD || process.env.ADMIN_INITIAL_PASSWORD;

const email = emailFromEnv || (await ask('Admin email: '));
let password = passwordFromEnv;
if (!password) {
  password = await askHidden(`${forcePasswordChange ? 'Temporary password' : 'Password'} (min 12 chars, hidden): `);
  const confirm = await askHidden('Confirm password: ');
  if (password !== confirm) {
    console.error('Passwords do not match.');
    process.exit(1);
  }
}

const db = createPgDatabase(config.migrationDatabaseUrl, { max: 1 });
try {
  const admin = await createAdmin(db, { email, password, allowAdditional, forcePasswordChange });
  console.log(`Admin created: ${admin.email}`);
  console.log(forcePasswordChange ? 'Sign in at /auth/login — you will be asked to choose a new password.' : 'Sign in at /auth/login.');
} catch (err) {
  if (err instanceof BootstrapError) console.error(err.message);
  else console.error('Failed to create admin:', /** @type {Error} */ (err).message);
  process.exitCode = 1;
} finally {
  await db.end?.();
}
