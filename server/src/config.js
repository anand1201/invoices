/**
 * Environment loading.
 *
 * Every secret lives here and only here — the browser bundle never sees a
 * database password or an SMTP credential. `.env` is read from the server
 * folder first, then the repo root, so either layout works.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, '..');
const repoRoot = path.resolve(serverRoot, '..');

// `override: false` means the first file that defines a key wins, and a real
// process env var (as set by a host like Render or Railway) always wins.
dotenv.config({ path: path.join(serverRoot, '.env'), override: false });
dotenv.config({ path: path.join(repoRoot, '.env'), override: false });

const bool = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
};

const int = (value, fallback) => {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: int(process.env.PORT, 4000),
  /** Where the built client lives, if we are serving it ourselves. */
  clientDist: path.join(repoRoot, 'client', 'dist'),
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: int(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME || 'invoice_studio',
    ssl: bool(process.env.DB_SSL) ? { rejectUnauthorized: true } : undefined,
  },

  mail: {
    host: process.env.SMTP_HOST || '',
    port: int(process.env.SMTP_PORT, 587),
    secure: bool(process.env.SMTP_SECURE, int(process.env.SMTP_PORT, 587) === 465),
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    fromName: process.env.MAIL_FROM_NAME || 'Invoice Studio',
    fromEmail: process.env.MAIL_FROM_EMAIL || '',
    bcc: process.env.MAIL_BCC || '',
    etherealFallback: bool(process.env.MAIL_USE_ETHEREAL_FALLBACK, true),
    // Shared/cPanel hosts often serve a certificate for the server's own
    // hostname (e.g. srv123.hostgator.com) rather than the mail domain, which
    // fails strict verification. Opt-in escape hatch, off by default.
    allowSelfSigned: bool(process.env.SMTP_ALLOW_SELF_SIGNED, false),
  },
};

export const isProduction = config.env === 'production';
