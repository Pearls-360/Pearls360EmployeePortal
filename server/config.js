/**
 * Server-only configuration. Nothing in this directory is bundled into the
 * browser build; never import it from `src/`.
 */

function env(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL_ENV);

function databaseFields() {
  const host = env('DATABASE_HOST');
  const user = env('DATABASE_USER');
  const password = env('DATABASE_PASSWORD');
  if (!host || !user || !password) return null;
  return {
    host,
    port: env('DATABASE_PORT') || '6543',
    user,
    password,
    database: env('DATABASE_NAME') || 'postgres'
  };
}

function appOrigin() {
  const configured = env('APP_ORIGIN');
  if (configured) return configured.replace(/\/+$/, '');
  if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return isProduction ? 'https://login.pearls360designs.com' : 'http://localhost:5173';
}

export const config = {
  isProduction,
  appOrigin: appOrigin(),
  /** Extra origins accepted by the CSRF check (comma-separated), e.g. a preview URL. */
  extraOrigins: (env('ALLOWED_ORIGINS') || '').split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean),

  databaseUrl: env('DATABASE_URL'),
  /**
   * Preferred on Vercel. The password is the raw database password, so
   * characters like ] } % do not have to be percent-encoded.
   */
  database: databaseFields(),
  migrationDatabaseUrl: env('MIGRATION_DATABASE_URL') || env('DATABASE_URL'),
  /** PEM contents of the Supabase root CA. Enables full TLS verification. */
  databaseCaCert: env('DATABASE_CA_CERT')?.replace(/\\n/g, '\n'),
  /** 'disable' only for local Postgres without TLS. */
  databaseSsl: env('DATABASE_SSL') || 'require',
  databasePoolMax: Number(env('DATABASE_POOL_MAX') || 3),

  session: {
    cookieName: isProduction ? '__Host-p360_session' : 'p360_session',
    ttlMs: 12 * 60 * 60 * 1000,
    absoluteMaxMs: 7 * 24 * 60 * 60 * 1000
  },

  tokens: {
    activationTtlMs: 72 * 60 * 60 * 1000,
    adminResetTtlMs: 24 * 60 * 60 * 1000,
    selfResetTtlMs: 60 * 60 * 1000
  },

  email: {
    resendApiKey: env('RESEND_API_KEY'),
    from: env('EMAIL_FROM')
  }
};

export function emailConfigured() {
  return Boolean(config.email.resendApiKey && config.email.from);
}
