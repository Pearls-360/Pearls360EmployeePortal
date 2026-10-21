# Pearls360 Employee Portal

Internal employee portal for Pearls 360 Design & Planning, served at
`https://login.pearls360designs.com`.

## Stack

| | |
| --- | --- |
| Hosting | [Vercel](https://vercel.com) |
| Database | [Supabase](https://supabase.com) Postgres, used only as a database |
| App | Node.js 20, Vite, vanilla HTML / CSS / JS |

Auth is custom (Argon2id, HttpOnly session cookies). Supabase Auth and the Data API are not used.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run db:migrate
npm run admin:create
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Routes

| Path               | Access          | Purpose                                                     |
| ------------------ | --------------- | ----------------------------------------------------------- |
| `/`                | —               | Redirects to `/login`, `/admin` or `/employee` by session   |
| `/login`           | Public          | Shared sign-in for Admins and Employees                     |
| `/forgot-password` | Public          | Request a reset link (requires email delivery configured)   |
| `/set-password`    | One-time link   | Activate an account or reset a password                     |
| `/change-password` | Signed in       | Change password (forced on first Admin sign-in)             |
| `/admin`           | Admin           | Dashboard overview (stats, recent employees, activity) |
| `/admin/admins`    | Admin           | Administrator directory and invitations |
| `/admin/employees` | Admin           | Directory, add/edit, activate/deactivate, password resets |
| `/admin/profile`   | Admin           | Admin account profile |
| `/admin/settings`  | Admin           | Security / session settings |
| `/employee`        | Employee        | Personalized dashboard |
| `/employee/profile`| Employee        | Profile + phone update |
| `/employee/settings`| Employee       | Change password and session |

There is no public sign-up. Admins create employee accounts; each employee sets
their own password through a one-time activation link.

## How it works

**Accounts.** `app.users` holds credentials and role (`admin` / `employee`) and
status (`pending` → `active` / `inactive`). `app.employee_profiles` holds HR
details. Creating an employee inserts both rows, issues an activation token and
writes an audit entry in one transaction.

**One-time links.** Activation (72 h), admin-initiated reset (24 h) and
self-service reset (1 h) tokens are random 256-bit values; only their SHA-256
hash is stored. The token travels in the URL fragment (`/set-password#token=…`)
so it never reaches server logs, and the page strips it from the address bar.
Issuing a new link revokes older ones; links are single-use.

If `RESEND_API_KEY`/`EMAIL_FROM` are set, links are emailed. Otherwise the Admin
sees the link once and shares it through a trusted channel, and
"Forgot password" tells users to contact their administrator.

**Sessions.** A random token in an `HttpOnly; SameSite=Strict; Secure` cookie
(`__Host-p360_session` in production). Only its hash is stored in
`app.sessions`. Sessions slide for 12 h of inactivity, up to 7 days absolute.
They are revoked on logout, password change/reset and account deactivation.

**Authorization.** Every API handler calls `requireSession()` with the allowed
roles. Employee endpoints never take an id — they always act on the session's
own user — so one employee cannot reach another's record. Page guards in the
browser only decide what to render.

**CSRF.** State-changing requests must carry a matching `Origin` (or
`Sec-Fetch-Site: same-origin`) and a JSON body; cookies are `SameSite=Strict`.

**Database exposure.** All tables live in the private `app` schema, which
Supabase does not expose through the Data API. RLS is enabled with no policies,
and all privileges are revoked from `public`, `anon` and `authenticated`. Only
the server-side connection (the `postgres` role) can read or write.

The dev server serves the pages and the API together, and reads `.env.local` for the API. Without `DATABASE_URL` the pages still render, and API calls return "The portal is not configured yet".

### Scripts

| Command                | Description                                                      |
| ---------------------- | ---------------------------------------------------------------- |
| `npm run dev`          | Dev server with the API                                          |
| `npm run build`        | Production build to `dist/`                                      |
| `npm run preview`      | Serve the production build locally (with the API)                |
| `npm test`             | Auth, authorization and data-isolation tests (in-memory Postgres via PGlite) |
| `npm run lint`         | ESLint                                                           |
| `npm run typecheck`    | Type-check browser and server code via JSDoc (`tsc`)             |
| `npm run check`        | Lint + type-check + tests + build                                |
| `npm run db:migrate`   | Apply pending `db/migrations/*.sql`                              |
| `npm run admin:create` | Create the first Admin (refuses if one exists; `-- --additional` to add another) |

## Configuration

All variables are server-only (there are no `VITE_*` variables), so nothing
here reaches the browser. Put them in `.env.local` locally and in Vercel →
Project → Settings → Environment Variables. **Never commit `.env.local`.**

| Name                     | Required | Description |
| ------------------------ | -------- | ----------- |
| `DATABASE_URL`           | Yes      | Supabase **Transaction pooler** connection string (port 6543). Used by the app. |
| `MIGRATION_DATABASE_URL` | For migrations | Supabase **Session pooler** string (port 5432). Defaults to `DATABASE_URL`. |
| `DATABASE_CA_CERT`       | Recommended | Supabase root CA (PEM). Enables full TLS certificate verification. |
| `DATABASE_SSL`           | No       | `require` (default). `disable` only for a local non-TLS Postgres. |
| `DATABASE_POOL_MAX`      | No       | Connections per serverless instance (default 3). |
| `APP_ORIGIN`             | Production | `https://login.pearls360designs.com`. Used for CSRF checks and links. |
| `ALLOWED_ORIGINS`        | No       | Extra comma-separated origins for the CSRF check. |
| `RESEND_API_KEY`, `EMAIL_FROM` | No | Enable emailing activation/reset links via [Resend](https://resend.com). |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Bootstrap only | Read by `npm run admin:create`; prompted for if unset. Remove afterwards. (`ADMIN_INITIAL_PASSWORD` is accepted as an alias.) |

### Where to find the Supabase values

In the [Supabase dashboard](https://supabase.com/dashboard), open the project:

1. **Connection strings** — click **Connect** in the top bar.
   - **Transaction pooler** (port `6543`) → `DATABASE_URL`.
   - **Session pooler** (port `5432`) → `MIGRATION_DATABASE_URL`.
   - Replace `[YOUR-PASSWORD]` with the database password.
2. **Database password** — **Project Settings → Database**. If you don't have
   it, use **Reset database password** there. (This is not an API key.)
3. **CA certificate** — **Project Settings → Database → SSL Configuration →
   Download certificate**. Paste the PEM contents into `DATABASE_CA_CERT`
   (newlines may be written as `\n`).

The publishable/anon key and the service-role/secret key are **not needed**.

### Creating the first Admin

```bash
npm run admin:create
```

It reads `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env.local` (or prompts if
they are unset — password input is hidden). Nothing is hardcoded. It refuses to
run if an Admin already exists. The Admin must change the password at first
sign-in, unless you run `npm run admin:create -- --no-force-change` with a
password you intend to keep. `.env.local` stays git-ignored, so keeping
`ADMIN_PASSWORD` there for local use is fine.

## Project structure

```
api/index.js              Vercel Function entry (all /api/* routes and /)
server/
  router.js               Route table, CSRF check, error handling
  routes/auth.js          Login, logout, session, change/forgot/set password
  routes/admin.js         Overview, employees CRUD, status, access links, audit log
  routes/employee.js      Own profile (read, phone update)
  auth/                   Passwords (Argon2id), sessions, one-time tokens
  security.js             requireSession, CSRF origin check, rate limit, audit
  validation.js           Input validation
  db.js, migrations.js    Postgres pool and migration runner
  bootstrap.js, email.js  First-Admin creation, optional Resend email
db/migrations/            Version-controlled SQL migrations
scripts/                  migrate.js, create-admin.js
tests/                    node:test suites (PGlite)
login/ admin/ employee/ set-password/ forgot-password/ change-password/
                          Page HTML (Vite multi-page inputs)
src/
  pages/                  Page scripts
  lib/                    API client, session guard, forms, formatting
  styles/                 base.css (design system), portal.css, dashboard.css
public/boot.js            Tiny pre-paint script (kept external for the CSP)
```

## Deployment (Vercel)

`vercel.json` pins the Vite preset, rewrites `/` and `/api/*` to the function,
maps the clean page URLs, and sets security headers (strict CSP, HSTS, no
framing, `noindex`).

1. Add the environment variables above for **Production** (and **Preview** if
   used — set `ALLOWED_ORIGINS` or rely on the automatic preview origin).
2. Run `npm run db:migrate` once against the production database.
3. Run `npm run admin:create` once.
4. Deploy, then attach `login.pearls360designs.com`.
