import { Logger } from '@nestjs/common';

const logger = new Logger('Env');
const DEV_JWT_DEFAULT = 'dev-streamy-secret-change-in-prod';

/**
 * Validate environment configuration at boot.
 *
 * Goals:
 *  - In production, fail FAST with a readable message instead of a confusing
 *    runtime crash three requests later (e.g. missing DATABASE_URL).
 *  - In development, never block startup — only warn — so the existing
 *    `docker compose up` / `npm run dev` workflow keeps working untouched.
 *  - Normalise a couple of convenience defaults (DIRECT_URL, STORAGE_DRIVER).
 */
export function validateEnv(): void {
  const isProd = process.env.NODE_ENV === 'production';
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- Database -------------------------------------------------------------
  if (!process.env.DATABASE_URL) {
    (isProd ? errors : warnings).push('DATABASE_URL is not set.');
  }
  // Prisma `directUrl` is only consumed by the migration engine, but defaulting
  // it here keeps local dev (where there is no separate pooler) friction-free.
  if (!process.env.DIRECT_URL && process.env.DATABASE_URL) {
    process.env.DIRECT_URL = process.env.DATABASE_URL;
  }

  // --- Auth -----------------------------------------------------------------
  if (!process.env.JWT_SECRET) {
    (isProd ? errors : warnings).push('JWT_SECRET is not set.');
  } else if (isProd && process.env.JWT_SECRET === DEV_JWT_DEFAULT) {
    errors.push('JWT_SECRET is still the insecure dev default — set a strong random secret in production.');
  }

  // --- CORS / frontend origin ----------------------------------------------
  if (!process.env.WEB_ORIGIN) {
    (isProd ? errors : warnings).push(
      'WEB_ORIGIN is not set — CORS and Socket.IO will reject the deployed frontend.',
    );
  }

  // --- Redis ----------------------------------------------------------------
  if (!process.env.REDIS_URL) {
    warnings.push(
      'REDIS_URL is not set — Socket.IO will use the in-memory adapter (fine for ONE instance only).',
    );
  }

  // --- Storage --------------------------------------------------------------
  const driver = (process.env.STORAGE_DRIVER || '').toLowerCase();
  if (driver === 'r2') {
    const required = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];
    const missing = required.filter((k) => !process.env[k]);
    if (missing.length) {
      errors.push(`STORAGE_DRIVER=r2 but missing: ${missing.join(', ')}.`);
    }
  } else if (isProd && driver !== 'local') {
    warnings.push(
      'STORAGE_DRIVER is not "r2" in production — uploads write to the local disk and are LOST on every redeploy/restart.',
    );
  }

  for (const w of warnings) logger.warn(w);

  if (errors.length) {
    logger.error('Invalid environment configuration:');
    for (const e of errors) logger.error(`  • ${e}`);
    throw new Error(`Environment validation failed with ${errors.length} error(s). See logs above.`);
  }

  logger.log(
    `Environment OK (NODE_ENV=${process.env.NODE_ENV || 'undefined'}, ` +
      `storage=${driver || 'local'}, redis=${process.env.REDIS_URL ? 'on' : 'off'}).`,
  );
}
