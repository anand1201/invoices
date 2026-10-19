/**
 * MySQL / MariaDB access.
 *
 * Schema shape — a deliberate hybrid:
 *   - Anything we filter, sort or display in the "saved invoices" list gets a
 *     real typed column (invoice number, dates, party names, the four money
 *     totals). Those are the fields that benefit from indexes and from the
 *     database enforcing UNSIGNED, so a negative amount cannot even be stored.
 *   - The repeating structures (line items, custom fields) are stored as JSON
 *     documents. They are only ever read as a whole invoice, so splitting them
 *     into child tables would buy joins and no queries.
 *
 * Money is stored the way it is computed: integer cents in BIGINT UNSIGNED.
 * There is no DECIMAL and no FLOAT anywhere in this schema.
 */

import mysql from 'mysql2/promise';
import { config } from './config.js';

let pool;

/** Lazily created connection pool. */
export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      ...config.db,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      // Returns DATE columns as 'YYYY-MM-DD' strings instead of JS Dates, which
      // keeps timezone drift out of issue/due dates entirely.
      dateStrings: true,
      charset: 'utf8mb4_unicode_ci',
    });
  }
  return pool;
}

export async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

const CREATE_INVOICES = `
CREATE TABLE IF NOT EXISTS invoices (
  id                  CHAR(36)        NOT NULL PRIMARY KEY,
  invoice_number      VARCHAR(64)     NOT NULL,
  issue_date          DATE            NOT NULL,
  due_date            DATE            NOT NULL,
  currency            CHAR(3)         NOT NULL DEFAULT 'USD',

  business_name       VARCHAR(160)    NOT NULL,
  business_email      VARCHAR(320)    NOT NULL DEFAULT '',
  business_phone      VARCHAR(60)     NOT NULL DEFAULT '',
  business_address    VARCHAR(500)    NOT NULL DEFAULT '',

  customer_name       VARCHAR(160)    NOT NULL,
  customer_email      VARCHAR(320)    NOT NULL DEFAULT '',
  customer_phone      VARCHAR(60)     NOT NULL DEFAULT '',
  customer_address    VARCHAR(500)    NOT NULL DEFAULT '',

  line_items          LONGTEXT        NOT NULL,
  custom_fields       LONGTEXT        NOT NULL,
  notes               TEXT            NULL,

  -- all money in integer cents; all rates in thousandths of a percent
  discount_cents      BIGINT UNSIGNED NOT NULL DEFAULT 0,
  tax_rate_milli      INT UNSIGNED    NOT NULL DEFAULT 0,
  subtotal_cents      BIGINT UNSIGNED NOT NULL DEFAULT 0,
  tax_cents           BIGINT UNSIGNED NOT NULL DEFAULT 0,
  total_cents         BIGINT UNSIGNED NOT NULL DEFAULT 0,

  created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  KEY idx_invoices_updated (updated_at),
  KEY idx_invoices_number (invoice_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

const CREATE_EMAIL_LOG = `
CREATE TABLE IF NOT EXISTS invoice_emails (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  invoice_id     CHAR(36)        NOT NULL,
  to_email       VARCHAR(320)    NOT NULL,
  subject        VARCHAR(255)    NOT NULL,
  status         ENUM('sent','failed') NOT NULL,
  transport      VARCHAR(40)     NOT NULL DEFAULT 'smtp',
  message_id     VARCHAR(255)    NULL,
  preview_url    VARCHAR(500)    NULL,
  error_message  VARCHAR(500)    NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_emails_invoice (invoice_id, created_at),
  CONSTRAINT fk_emails_invoice FOREIGN KEY (invoice_id)
    REFERENCES invoices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

/**
 * Create the database and tables if they do not exist.
 *
 * `CREATE DATABASE` needs a connection that is not bound to that database yet,
 * so it gets its own short-lived connection before the pool is built.
 */
export async function initSchema() {
  const { database, ...withoutDb } = config.db;
  const bootstrap = await mysql.createConnection({ ...withoutDb, multipleStatements: false });
  try {
    await bootstrap.query(
      `CREATE DATABASE IF NOT EXISTS \`${database.replace(/`/g, '')}\`
       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await bootstrap.end();
  }

  const p = getPool();
  await p.query(CREATE_INVOICES);
  await p.query(CREATE_EMAIL_LOG);
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
