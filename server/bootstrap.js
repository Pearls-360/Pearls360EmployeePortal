import { hashPassword, passwordProblem } from './auth/passwords.js';
import { audit } from './security.js';
import { isValidEmail, normalizeEmail } from './validation.js';

export class BootstrapError extends Error {}

/**
 * Creates an Admin account with a temporary password that must be changed at
 * first sign-in. Refuses to run when an Admin already exists unless
 * `allowAdditional` is set explicitly.
 * @param {import('./db.js').Database} db
 * @param {{ email: string, password: string, allowAdditional?: boolean, forcePasswordChange?: boolean }} input
 */
export async function createAdmin(db, { email: rawEmail, password, allowAdditional = false, forcePasswordChange = true }) {
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) throw new BootstrapError('ADMIN_EMAIL is not a valid email address.');
  const problem = passwordProblem(password, { email });
  if (problem) throw new BootstrapError(`Initial password rejected: ${problem}`);
  const hash = await hashPassword(password);

  return db.tx(async (tx) => {
    await tx.query('lock table app.users in share row exclusive mode');
    const { rows: admins } = await tx.query("select count(*)::int as n from app.users where role = 'admin'");
    if (admins[0].n > 0 && !allowAdditional) {
      throw new BootstrapError('An Admin account already exists. Re-run with --additional to deliberately create another one.');
    }
    const { rows: existing } = await tx.query('select 1 from app.users where email = $1', [email]);
    if (existing.length) throw new BootstrapError('A user with this email already exists.');

    const { rows } = await tx.query(
      `insert into app.users (email, password_hash, role, status, must_change_password)
       values ($1, $2, 'admin', 'active', $3) returning id`,
      [email, hash, forcePasswordChange]
    );
    await audit(tx, { actorId: null, action: 'admin.bootstrap', targetType: 'user', targetId: rows[0].id, metadata: { source: 'cli', mustChangeOnFirstLogin: forcePasswordChange } });
    return { id: rows[0].id, email };
  });
}
